import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job, ChatMessage } from "@/lib/db/models";
import { AgentCache, type AgentName } from "@/lib/db/models/agent_cache";
import { callLyzrAgent } from "@/lib/services/lyzr";
import mongoose from "mongoose";
import { newTraceId, logChatInput, logChatResponse } from "@/lib/utils/agent-logger";

/**
 * FALLBACK context. Aria is expected to fetch fresh data via its own tools, but a
 * Lyzr manager sometimes delegates/loops instead of calling tools. To guarantee it
 * always has correct numbers, we ALSO inject any precomputed AgentCache as a
 * fallback block. Marked FALLBACK (not authoritative) so Aria prefers a live tool
 * call when it makes one, and uses this only if it doesn't. Empty when nothing cached.
 */
async function buildFallbackCacheBlock(
  orgId: string | undefined,
  listingId: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Promise<string> {
  if (!orgId || !listingId || !dateFrom || !dateTo) return "";
  if (!mongoose.Types.ObjectId.isValid(orgId) || !mongoose.Types.ObjectId.isValid(listingId)) return "";
  const rows = await AgentCache.find({
    orgId: new mongoose.Types.ObjectId(orgId),
    listingId: new mongoose.Types.ObjectId(listingId),
    dateFrom, dateTo, status: "complete",
  }).lean();
  if (!rows.length) return "";
  const labels: Record<AgentName, string> = {
    property: "PROPERTY_ANALYSIS", booking: "BOOKING_INTELLIGENCE",
    market_research: "MARKET_RESEARCH", price_guard: "PRICE_GUARD", anomaly: "ANOMALY_REPORT",
  };
  const parts: string[] = [];
  for (const r of rows as any[]) {
    const label = labels[r.agentName as AgentName];
    if (label) parts.push(`[FALLBACK_${label}]\n${JSON.stringify(r.output ?? {})}`);
  }
  if (!parts.length) return "";
  return [
    "[FALLBACK_PRECOMPUTED_ANALYSES] — Use your live tools first. If a tool call is",
    "unavailable or returns nothing, fall back to these last precomputed values.",
    "Never fabricate; if neither tool nor fallback has a value, say it's unavailable.",
    "", parts.join("\n\n"), "",
  ].join("\n");
}

// The CRO Router (Aria) returns STRUCTURED JSON only. The chat bubble renders
// `message` as markdown, so we pull the human-readable narration field out of the
// structured object and surface it as the bubble text, while the full structured
// payload is preserved in raw_json/metadata for rich (card) rendering.
function extractDisplayText(parsed: any, fallback: string): string {
  if (!parsed || typeof parsed !== "object") return fallback;
  const candidates = [
    "narrative",        // ← CRO Router (cro_router_response) narration field
    "chat_response", "response", "message", "summary", "answer",
    "narration", "recommendation", "reply", "text",
    "executive_summary", "headline", "explanation",
  ];
  for (const k of candidates) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}

export async function POST(req: NextRequest) {
  // Observability: one traceId per chat turn correlates input, tool calls, output.
  const traceId = newTraceId();
  const startedAt = Date.now();
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

    // Every user message goes to Aria (the CRO Router). No static/canned shortcuts —
    // greetings, definitions, and metric questions all get a live, context-aware
    // answer from the agent (Aria answers small-talk itself per its prompt, and
    // delegates real analysis).

    // Fire-and-forget background execution (CRO Router / Aria)
    (async () => {
      try {
        await connectToDatabase();

        // CRO Router (Aria) — the manager agent that orchestrates the 7 subagents
        // (Property, Booking, Market Research, PriceGuard, Anomaly, Atlas, Event)
        // and returns structured output. Env override wins; concierge IDs kept as
        // transitional fallbacks.
        const agentId =
          process.env.LYZR_CRO_ROUTER_AGENT_ID ||
          process.env.Lyzr_Precompute_Agent_ID ||
          process.env.LYZR_ARIA_CONCIERGE_AGENT_ID ||
          "6a1bd495f0b2191493afbd2f"; // CRO Router (Aria) manager

        const listingId = context?.propertyId || null;
        const fromStr = dateRange?.from || null;
        const toStr = dateRange?.to || null;

        // Aria fetches fresh data via its own tools. We ALSO attach any precomputed
        // cache as a FALLBACK block (used only if a tool call is unavailable / loops),
        // so the answer is never left without numbers. Empty string when nothing cached.
        const fallbackBlock = await buildFallbackCacheBlock(orgId, listingId, fromStr, toStr);

        const envelope = [
          `org_id: ${orgId || "priceos-user"}`,
          `listing_id: ${listingId || "portfolio"}`,
          fromStr ? `date_from: ${fromStr}` : null,
          toStr ? `date_to: ${toStr}` : null,
          context?.propertyName ? `property_name: ${context.propertyName}` : null,
          "",
          `User Query: ${message}`,
          fallbackBlock ? "\n" + fallbackBlock : null,
        ].filter(Boolean).join("\n");

        let systemVars: any = {};
        if (context) {
          systemVars = {
            context_type: context.type,
            property_id: context.propertyId,
            property_name: context.propertyName,
          };
        }

        // Observability: log the user's input + the full context sent to the agent.
        logChatInput({
          traceId,
          route: "/api/chat",
          orgId,
          listingId,
          userMessage: message,
          context: { envelope, systemVars, dateRange, jobId },
        });

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

        // Observability: log the agent's response (or error), status, and duration.
        logChatResponse({
          traceId,
          route: "/api/chat",
          status: result.ok ? 200 : 502,
          durationMs: Date.now() - startedAt,
          response: result.ok ? { message: result.response, parsedJson: result.parsedJson } : undefined,
          error: result.ok ? undefined : (result.error || "Lyzr call failed"),
        });

        const job = await Job.findOne({ jobId });
        if (job) {
          if (result.ok) {
            job.status = "complete";
            // CRO Router returns structured JSON; show its narration as the bubble
            // text and keep the full structured object in raw_json for card rendering.
            const displayMessage = extractDisplayText(result.parsedJson, result.response);
            const pj = (result.parsedJson || {}) as Record<string, any>;
            job.result = {
              message: displayMessage,
              raw_json: result.parsedJson,
              // Surface CRO Router structured fields the chat UI consumes (proposal
              // cards, action chips). Omitted cleanly when the agent didn't return them.
              ...(Array.isArray(pj.proposals) && pj.proposals.length ? { proposals: pj.proposals } : {}),
              metadata: {
                intent: pj.intent,
                agents_consulted: pj.agents_consulted,
                action_buttons: pj.action_buttons,
                escalations: pj.escalations,
                audit_decision_id: pj.audit_decision_id,
              },
            };
            // Persist assistant response so session history is queryable
            if (orgOid) {
              await ChatMessage.create({
                orgId: orgOid,
                sessionId: effectiveSessionId,
                role: "assistant",
                content: displayMessage,
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
        logChatResponse({
          traceId,
          route: "/api/chat",
          status: 500,
          durationMs: Date.now() - startedAt,
          error: bgErr,
        });
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
    logChatResponse({
      traceId,
      route: "/api/chat",
      status: 500,
      durationMs: Date.now() - startedAt,
      error: err,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
