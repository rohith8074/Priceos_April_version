import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PrecomputeJob } from "@/lib/db/models/precompute_job";

/**
 * GET /api/precompute-property/:jobId
 *
 * Returns the live state of a precompute job. Frontend polls this every ~2s
 * while the "warming intelligence" indicator is visible. Once `overallStatus`
 * is `complete` or the core agents (property + booking + market_research) are
 * marked `complete`, the chat input is enabled.
 */
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await props.params;
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

    await connectToDatabase();

    const job = await PrecomputeJob.findOne({ jobId }).lean() as any;
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const ready = job.agentStates.filter((s: any) => s.status === "complete").map((s: any) => s.agentName);
    const pending = job.agentStates.filter((s: any) => s.status === "pending" || s.status === "running").map((s: any) => s.agentName);
    const failed = job.agentStates.filter((s: any) => s.status === "failed").map((s: any) => ({ agent: s.agentName, error: s.errorMessage }));

    // Core readiness: chat can start once property + booking + market_research are complete.
    // PriceGuard + Anomaly fill in progressively after.
    const corePhaseReady = ["property", "booking", "market_research"].every((a) => ready.includes(a));

    return NextResponse.json({
      jobId: job.jobId,
      overallStatus: job.overallStatus,
      cacheHit: job.cacheHit,
      corePhaseReady,
      readyAgents: ready,
      pendingAgents: pending,
      failedAgents: failed,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      listingId: String(job.listingId),
      dateFrom: job.dateFrom,
      dateTo: job.dateTo,
    });
  } catch (err: any) {
    console.error("[GET /api/precompute-property/:jobId]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
