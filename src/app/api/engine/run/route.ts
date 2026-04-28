import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Types } from "mongoose";

// Stub for the pipeline runner
async function runPipeline(listingId: string, triggerDetail: string = "Manual Trigger"): Promise<{id: string, daysChanged: number}> {
  console.log(`[ENGINE] Running pipeline for listing: ${listingId} (${triggerDetail})`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  return { id: new Types.ObjectId().toString(), daysChanged: Math.floor(Math.random() * 30) };
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    if (!body.listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const run = await runPipeline(body.listingId, body.triggerDetail);

    return NextResponse.json({
      success: true,
      runId: run.id,
      daysChanged: run.daysChanged
    });
  } catch (err: any) {
    console.error("[POST /api/engine/run]", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
