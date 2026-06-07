import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job, ChatMessage } from "@/lib/db/models";
import { callLyzrAgent } from "@/lib/services/lyzr";
import { buildAgentContext } from "@/lib/agents/db-context-builder";
import { newTraceId, logChatInput, logChatResponse } from "@/lib/utils/agent-logger";

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const { message, sessionId, orgId, listingId } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectToDatabase();

    const jobId = `job-global-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await Job.create({
      jobId,
      status: "running",
      result: null,
      error: null,
    });

    // Fire-and-forget background execution
    (async () => {
      try {
        await connectToDatabase();

        const agentId = process.env.LYZR_DASHBOARD_AGENT_ID || "69df6b63fac6b1f936ca8e7b";

        let messageToSend = message;

        if (sessionId) {
          const priorCount = await ChatMessage.countDocuments({ sessionId });

          if (priorCount === 0) {
            // Turn 1: inject full portfolio context.
            // listingId null/undefined → buildAgentContext calls buildDashboardContext()
            // which aggregates ALL properties: reservations, occupancy, channel mix,
            // cancellation rate, upcoming events, per-property forward occupancy.
            let fullContext = "";
            const resolvedListingId = (listingId && listingId !== "portfolio_wide") ? listingId : null;

            try {
              fullContext = await buildAgentContext(
                orgId || "priceos-user",
                resolvedListingId,
                undefined // dashboard context has no date restriction
              );
            } catch (ctxErr: any) {
              console.warn(`[chat/global ${jobId}] buildAgentContext failed:`, ctxErr?.message);
              fullContext = JSON.stringify({
                note: "Portfolio context unavailable. Answer from general Dubai STR knowledge only.",
              });
            }

            messageToSend = [
              "[SESSION_INIT]",
              `org_id: ${orgId || "priceos-user"}`,
              `scope: ${resolvedListingId ? `property:${resolvedListingId}` : "portfolio_wide"}`,
              "",
              "FULL_CONTEXT:",
              fullContext,
              "",
              "User Request:",
              message,
            ].join("\n");
          }
        }

        logChatInput({
          traceId,
          route: "/api/chat/global",
          orgId,
          listingId,
          userMessage: message,
          context: { messageToSend, sessionId, jobId, agentId },
        });

        const result = await callLyzrAgent(
          agentId,
          messageToSend,
          orgId || "priceos-user",
          sessionId || jobId
        );

        logChatResponse({
          traceId,
          route: "/api/chat/global",
          status: result.ok ? 200 : 502,
          durationMs: Date.now() - startedAt,
          response: result.ok ? { message: result.response } : undefined,
          error: result.ok ? undefined : (result.error || "Lyzr call failed"),
        });

        const job = await Job.findOne({ jobId });
        if (job) {
          if (result.ok) {
            job.status = "complete";
            job.result = { message: result.response };
          } else {
            job.status = "error";
            job.error = result.error || "Failed to execute agent request";
          }
          await job.save();
        }
      } catch (bgErr: any) {
        console.error(`[Background Job ${jobId}] Dashboard agent error:`, bgErr);
        logChatResponse({
          traceId,
          route: "/api/chat/global",
          status: 500,
          durationMs: Date.now() - startedAt,
          error: bgErr,
        });
        try {
          const job = await Job.findOne({ jobId });
          if (job) {
            job.status = "error";
            job.error = bgErr.message || "Background execution error";
            await job.save();
          }
        } catch {}
      }
    })();

    return NextResponse.json({ jobId });
  } catch (err: any) {
    console.error("[POST /api/chat/global]", err);
    logChatResponse({
      traceId,
      route: "/api/chat/global",
      status: 500,
      durationMs: Date.now() - startedAt,
      error: err,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
