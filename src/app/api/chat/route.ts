import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job, ChatMessage } from "@/lib/db/models";
import { callLyzrAgent } from "@/lib/services/lyzr";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, orgId, context, sessionId, dateRange } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectToDatabase();

    const jobId = `job-aria-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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

        // Aria Concierge — the fast Q&A persona that reads pre-computed analyses
        // from AgentCache via tools. Falls back to the old CRO Router agent if
        // the env var isn't configured (transitional safety).
        const agentId =
          process.env.Lyzr_Precompute_Agent_ID ||
          process.env.LYZR_ARIA_CONCIERGE_AGENT_ID ||
          "6a09d9428e3a6bafa13d8284";

        const listingId = context?.propertyId || null;
        const fromStr = dateRange?.from || null;
        const toStr = dateRange?.to || null;

        // Aria Concierge's tools require dateFrom/dateTo to look up the right
        // cache scope. The agent's system prompt expects this exact envelope.
        const envelope = [
          `org_id: ${orgId || "priceos-user"}`,
          `listing_id: ${listingId || "portfolio"}`,
          fromStr ? `date_from: ${fromStr}` : null,
          toStr ? `date_to: ${toStr}` : null,
          context?.propertyName ? `property_name: ${context.propertyName}` : null,
          "",
          `User Query: ${message}`,
        ].filter(Boolean).join("\n");

        let systemVars: any = {};
        if (context) {
          systemVars = {
            context_type: context.type,
            property_id: context.propertyId,
            property_name: context.propertyName,
          };
        }

        // Persist user message before calling Lyzr so history is recorded even on failure
        const orgOid = orgId && mongoose.Types.ObjectId.isValid(orgId)
          ? new mongoose.Types.ObjectId(orgId) : null;
        const propertyOid = context?.propertyId && mongoose.Types.ObjectId.isValid(context.propertyId)
          ? new mongoose.Types.ObjectId(context.propertyId) : null;
        const msgContext = context?.type
          ? { type: context.type as "portfolio" | "property", ...(propertyOid ? { propertyId: propertyOid } : {}) }
          : undefined;
        const effectiveSessionId = sessionId || jobId;

        if (orgOid) {
          await ChatMessage.create({
            orgId: orgOid,
            sessionId: effectiveSessionId,
            role: "user",
            content: message, // original user text, not the injected SESSION_INIT block
            ...(msgContext ? { context: msgContext } : {}),
          });
        }

        const result = await callLyzrAgent(
          agentId,
          envelope,
          orgId || "priceos-user",
          effectiveSessionId,
          systemVars
        );

        const job = await Job.findOne({ jobId });
        if (job) {
          if (result.ok) {
            job.status = "complete";
            job.result = {
              message: result.response,
              raw_json: result.parsedJson,
            };
            // Persist assistant response so session history is queryable
            if (orgOid) {
              await ChatMessage.create({
                orgId: orgOid,
                sessionId: effectiveSessionId,
                role: "assistant",
                content: result.response,
                ...(msgContext ? { context: msgContext } : {}),
                ...(result.parsedJson ? { metadata: { parsedJson: result.parsedJson } } : {}),
              });
            }
          } else {
            job.status = "error";
            job.error = result.error || "Failed to execute agent request";
          }
          await job.save();
        }
      } catch (bgErr: any) {
        console.error(`[Background Job ${jobId}] Aria Proxy Error:`, bgErr);
        try {
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
    console.error("[POST /api/chat]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
