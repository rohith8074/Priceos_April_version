import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { DataSyncLog } from "@/lib/db/models";
import { syncEventFeeds } from "@/lib/events/event-feed-syncer";
import { Types } from "mongoose";

const THROTTLE_MS = 300_000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, force = false } = body as { orgId: string; force?: boolean };

    if (!orgId) {
      return NextResponse.json(
        { ok: false, error: "orgId is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const orgOid = new Types.ObjectId(orgId);

    // Throttle check: skip if a successful sync ran within the last 5 minutes
    if (!force) {
      const lastLog = await DataSyncLog.findOne({
        orgId: orgOid,
        jobName: "sync-events",
        status: "complete",
      })
        .sort({ startedAt: -1 })
        .lean();

      if (lastLog && lastLog.startedAt) {
        const ageMs = Date.now() - new Date(lastLog.startedAt).getTime();
        if (ageMs < THROTTLE_MS) {
          return NextResponse.json({
            ok: true,
            skipped: true,
            reason: "synced recently",
          });
        }
      }
    }

    const startedAt = new Date();
    const startMs = Date.now();

    // Write a "running" log entry
    const logDoc = await DataSyncLog.create({
      orgId: orgOid,
      jobName: "sync-events",
      startedAt,
      status: "running",
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      serpCallsUsed: 0,
      sources: {},
    });

    let syncResult;
    try {
      syncResult = await syncEventFeeds(orgOid, 90, "Dubai");
    } catch (syncErr) {
      const durationMs = Date.now() - startMs;
      await DataSyncLog.updateOne(
        { _id: logDoc._id },
        {
          $set: {
            status: "error",
            completedAt: new Date(),
            durationMs,
            errorMessage:
              syncErr instanceof Error ? syncErr.message : String(syncErr),
          },
        }
      );
      throw syncErr;
    }

    const durationMs = Date.now() - startMs;

    // Update log to "complete"
    await DataSyncLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "complete",
          completedAt: new Date(),
          durationMs,
          recordsInserted: syncResult.inserted,
          recordsUpdated: syncResult.updated,
          recordsSkipped: syncResult.skipped,
          sources: syncResult.sources,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      inserted: syncResult.inserted,
      updated: syncResult.updated,
      sources: syncResult.sources,
      duration: durationMs,
    });
  } catch (err: any) {
    console.error("[api/events/sync]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
