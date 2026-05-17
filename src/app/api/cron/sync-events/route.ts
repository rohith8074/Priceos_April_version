/**
 * GET /api/cron/sync-events
 *
 * Vercel Cron job: runs every 4 hours (see vercel.json).
 * Fetches events from Eventbrite, Ticketmaster, DTCM, Dubai RSS feeds,
 * and SERP Google Events, then upserts into MarketEvent collection.
 *
 * SERP budget: consumes 1 call per run → ~6 calls/day → ~180/month.
 * Adjust cron schedule if approaching the 250/month free limit.
 *
 * Secured by CRON_SECRET env var (Vercel sets Authorization header).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { DataSyncLog } from "@/lib/db/models";
import { syncEventFeeds } from "@/lib/events/event-feed-syncer";
import mongoose from "mongoose";

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || "69d776a671c7b939aaf49053";

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret (prevents accidental public triggers)
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  await connectToDatabase();

  const orgId = new mongoose.Types.ObjectId(DEFAULT_ORG_ID);

  // Create a running log entry
  const logEntry = await DataSyncLog.create({
    orgId,
    jobName: "sync-events",
    startedAt,
    status: "running",
    serpCallsUsed: 0,
  });

  try {
    const result = await syncEventFeeds(orgId, 90, "Dubai");

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await DataSyncLog.updateOne(
      { _id: logEntry._id },
      {
        $set: {
          status: result.errors.length > 0 ? "complete" : "complete",
          completedAt,
          durationMs,
          recordsInserted: result.inserted,
          recordsUpdated: result.updated,
          recordsSkipped: result.skipped,
          // SERP uses 1 call if SERP_Events or SERP_News ran
          serpCallsUsed: (result.sources["SERP_Events"] !== undefined ? 1 : 0) +
                         (result.sources["SERP_News"] !== undefined ? 1 : 0),
          sources: result.sources,
          errorMessage: result.errors.length > 0 ? result.errors.join("; ") : undefined,
        },
      }
    );

    console.log(`[cron/sync-events] Done in ${durationMs}ms — inserted: ${result.inserted}, updated: ${result.updated}`);

    return NextResponse.json({
      ok: true,
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      sources: result.sources,
      errors: result.errors,
      durationMs,
    });
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    await DataSyncLog.updateOne(
      { _id: logEntry._id },
      { $set: { status: "error", completedAt: new Date(), errorMessage } }
    );
    console.error("[cron/sync-events] Fatal error:", errorMessage);
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
