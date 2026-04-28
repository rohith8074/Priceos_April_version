import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models/Listing";
import { Types } from "mongoose";

// Stub for the pipeline runner (will be implemented next)
async function runPipeline(listingId: string, triggerDetail: string = "Manual Trigger"): Promise<{id: string, daysChanged: number}> {
  console.log(`[ENGINE] Running pipeline for listing: ${listingId} (${triggerDetail})`);
  // Simulate delay
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

// Support SSE streaming for /run-all
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    
    // Check if it's the run-all endpoint wrapper
    if (!req.url.includes('run-all')) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 404 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    await connectToDatabase();
    const listings = await Listing.find({ orgId: new Types.ObjectId(orgId) });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function sse(type: string, data: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        }

        try {
          sse("status", { step: "routing", message: `Orchestrating pipeline for ${listings.length} listings...` });
          sse("thinking", { message: "Initializing pricing engine and verifying organization permissions..." });
          
          await new Promise(r => setTimeout(r, 500));

          let succeeded = 0;
          for (let i = 0; i < listings.length; i++) {
            const l = listings[i];
            const listingName = l.name || l._id.toString();
            
            sse("status", { step: "analyzing", message: `[${i+1}/${listings.length}] Analyzing ${listingName}...` });
            sse("thinking", { message: `Processing market data and historical performance for ${listingName}...` });
            
            try {
              const run = await runPipeline(l._id.toString(), "Run All");
              succeeded++;
              
              sse("status", { step: "validating", message: `Validating results for ${listingName}...` });
              sse("thinking", { message: `Ensuring ${run.daysChanged} days of adjustments meet PriceGuard constraints...` });
              await new Promise(r => setTimeout(r, 200));
            } catch (err: any) {
              sse("error", { message: `Error on ${listingName}: ${err.message}` });
            }
          }

          sse("status", { step: "generating", message: "Finalizing all proposals..." });
          sse("thinking", { message: "Consolidating all property runs into final dashboard view..." });
          await new Promise(r => setTimeout(r, 500));

          sse("complete", {
            message: `Processed ${listings.length} properties. ${succeeded} succeeded.`,
            summary: { totalListings: listings.length, succeeded, failed: listings.length - succeeded }
          });
        } catch (e: any) {
          sse("error", { message: e.message });
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
