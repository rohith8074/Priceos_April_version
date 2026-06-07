import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job } from "@/lib/db/models/Job";
import { callLyzrAgent } from "@/lib/services/lyzr";
import { newTraceId, logChatInput, logChatResponse } from "@/lib/utils/agent-logger";

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const {
      messages = [],
      guestName = "Guest",
      propertyName = "Property",
      orgId,
      threadId,
      listingId,
      sessionId,
      commsState = "active",
      checkIn,
      checkOut,
      additionalContext,
    } = body;

    await connectToDatabase();

    const jobId = `job-draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await Job.create({
      jobId,
      status: "running",
      result: null,
      error: null,
    });

    // Fire-and-forget background execution
    (async () => {
      try {
        // Prefer the dedicated guest-reply agent (which has Hostaway OpenAPI tools).
        // Fall back to the generic chat agent only if not configured.
        const agentId =
          process.env.LYZR_GUEST_REPLY_AGENT_ID ||
          process.env.LYZR_Chat_Response_Agent_ID ||
          "699d8ab150b4c733eb376fd4";

        // Stable session so the agent retains memory across multiple draft clicks
        // for the same conversation thread.
        const lyzrSessionId = sessionId || `inbox-${threadId || jobId}`;

        // Build the last guest message as the trigger — the agent will call
        // readThread(thread_id) to fetch full reservation context via its tools.
        const lastGuestMsg = [...messages]
          .reverse()
          .find((m: { sender?: string; role?: string }) => m.sender === "guest" || m.role === "guest");
        const guestMessage =
          (lastGuestMsg as { text?: string; content?: string } | undefined)?.text ||
          (lastGuestMsg as { text?: string; content?: string } | undefined)?.content ||
          (messages[messages.length - 1] as { text?: string; content?: string } | undefined)?.text ||
          "";

        // Include the last few messages as fallback context in case readThread
        // is unavailable, but keep it short so it doesn't overshadow tool data.
        const recentHistory = (messages as { sender?: string; role?: string; text?: string; content?: string }[])
          .slice(-6)
          .map((m) => `${m.sender === "guest" || m.role === "guest" ? "Guest" : "Host"}: ${m.text || m.content || ""}`)
          .join("\n");

        const stayInfo =
          checkIn && checkOut ? `\nGuest stay: ${checkIn} → ${checkOut}` : "";
        const rewriteNote = additionalContext
          ? `\n\nProperty manager note: ${additionalContext}`
          : "";

        const resolvedThreadId = threadId || jobId;
        const resolvedListingId = listingId || "";

        const prompt = `Guest message: "${guestMessage}"

Recent conversation:
${recentHistory}${stayInfo}${rewriteNote}

Context (use these exact values when calling tools):
- thread_id: ${resolvedThreadId}
- listing_id: ${resolvedListingId}
- org_id: ${orgId || "69d776a671c7b939aaf49053"}

Instructions:
1. Call readThread with threadId=${resolvedThreadId} to fetch full reservation details.
2. Classify the guest intent using the decision table in your system prompt.
3. Use the correct tool: sendGuestMessage (most replies), createOpsTicket (maintenance/issues), escalateThread (angry/legal/refund), sendAccessDetails (wifi/door codes), getPropertyData (amenities/rules), sendUpsellOffer (early check-in/extension).
4. Draft a warm, professional reply. Never invent access codes or house rules — use tool data only.`;

        const systemVars = {
          guest_name: guestName,
          property_name: propertyName,
          org_id: orgId || "69d776a671c7b939aaf49053",
          listing_id: listingId || "",
          thread_id: threadId || jobId,
          comms_state: commsState,
          today: new Date().toISOString().slice(0, 10),
        };

        logChatInput({
          traceId,
          route: "/api/hostaway/suggest-reply",
          orgId,
          listingId,
          userMessage: guestMessage,
          context: { prompt, systemVars, threadId: resolvedThreadId, jobId, agentId },
        });

        const result = await callLyzrAgent(
          agentId,
          prompt,
          "priceos-user",
          lyzrSessionId,
          systemVars
        );

        logChatResponse({
          traceId,
          route: "/api/hostaway/suggest-reply",
          status: result.ok ? 200 : 502,
          durationMs: Date.now() - startedAt,
          response: result.ok ? { message: result.response, parsedJson: result.parsedJson } : undefined,
          error: result.ok ? undefined : (result.error || "Lyzr call failed"),
        });

        await connectToDatabase();
        const job = await Job.findOne({ jobId });
        if (job) {
          if (result.ok) {
            job.status = "complete";

            // Extract the guest-facing reply text from the structured output.
            // The agent returns { triage, suggested_reply: { content, approval_required, action_buttons }, chat_response }.
            const parsed = result.parsedJson;
            const draftContent: string =
              parsed?.suggested_reply?.content ||
              result.response;

            job.result = {
              // message = the draft text the UI shows in the reply textarea
              message: draftContent,
              // raw_json carries the full structured output so the UI can read
              // triage intent/urgency, approval_required, action_buttons, and
              // chat_response (the property manager explanation)
              raw_json: parsed ?? null,
            };
          } else {
            job.status = "error";
            job.error = result.error || "Lyzr agent failure";
          }
          await job.save();
        }
      } catch (bgErr: any) {
        console.error(`[Background Job ${jobId}] Lyzr Direct Error:`, bgErr);
        logChatResponse({
          traceId,
          route: "/api/hostaway/suggest-reply",
          status: 500,
          durationMs: Date.now() - startedAt,
          error: bgErr,
        });
        try {
          await connectToDatabase();
          const job = await Job.findOne({ jobId });
          if (job) {
            job.status = "error";
            job.error = bgErr.message || "Execution error";
            await job.save();
          }
        } catch {}
      }
    })();

    return NextResponse.json({ jobId });
  } catch (err: any) {
    console.error("[POST /api/hostaway/suggest-reply]", err);
    logChatResponse({
      traceId,
      route: "/api/hostaway/suggest-reply",
      status: 500,
      durationMs: Date.now() - startedAt,
      error: err,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
