import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PrecomputeJob } from "@/lib/db/models/precompute_job";
import { runPrecompute, isFullyCached } from "@/lib/services/precompute-orchestrator";

/**
 * POST /api/precompute-property
 *
 * Body: { orgId, listingId, dateFrom, dateTo }
 *
 * Triggers the precompute orchestrator. Returns the jobId immediately so the
 * frontend can poll GET /api/precompute-property/:jobId for progress.
 *
 * If the AgentCache already has fresh outputs for all 5 agents (same property,
 * same date window, within 4hrs) → returns a job marked `complete` with
 * `cacheHit: true` without firing any Lyzr calls. The frontend skips the
 * "warming intelligence" UX in this case and goes straight to chat.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, listingId, dateFrom, dateTo } = body as {
      orgId?: string;
      listingId?: string;
      dateFrom?: string;
      dateTo?: string;
    };

    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ error: "Valid orgId required" }, { status: 400 });
    }
    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ error: "Valid listingId required" }, { status: 400 });
    }
    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "dateFrom and dateTo required (YYYY-MM-DD)" }, { status: 400 });
    }

    await connectToDatabase();

    const input = { orgId, listingId, dateFrom, dateTo };

    // Short-circuit: cache hit for this exact scope
    const cached = await isFullyCached(input);

    const jobId = `precompute-${listingId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const job = await PrecomputeJob.create({
      jobId,
      orgId: new Types.ObjectId(orgId),
      listingId: new Types.ObjectId(listingId),
      dateFrom,
      dateTo,
      overallStatus: cached ? "complete" : "running",
      cacheHit: cached,
      startedAt: new Date(),
      completedAt: cached ? new Date() : undefined,
      agentStates: [
        { agentName: "property",        status: cached ? "complete" : "pending" },
        { agentName: "booking",         status: cached ? "complete" : "pending" },
        { agentName: "market_research", status: cached ? "complete" : "pending" },
        { agentName: "price_guard",     status: cached ? "complete" : "pending" },
        { agentName: "anomaly",         status: cached ? "complete" : "pending" },
      ],
    });

    if (cached) {
      console.log(`[precompute] cache hit for ${listingId} ${dateFrom}→${dateTo} — skipping Lyzr calls`);
      return NextResponse.json({ jobId: job.jobId, cacheHit: true, status: "complete" });
    }

    // Fire-and-forget orchestration. The HTTP response returns immediately.
    // Background runs Phase 1 (parallel 3) → Phase 2 (PriceGuard) → Phase 3 (Anomaly).
    (async () => {
      try {
        await runPrecompute(jobId, input);
      } catch (err) {
        console.error(`[precompute ${jobId}] background failure:`, err);
      }
    })();

    return NextResponse.json({ jobId: job.jobId, cacheHit: false, status: "running" });
  } catch (err: any) {
    console.error("[POST /api/precompute-property]", err);
    return NextResponse.json({ error: err.message || "Precompute failed" }, { status: 500 });
  }
}
