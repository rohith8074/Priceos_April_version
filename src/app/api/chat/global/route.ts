import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job, ChatMessage, Listing } from "@/lib/db/models";
import { callLyzrAgent } from "@/lib/services/lyzr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, graphSessionId, orgId, listingId } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectToDatabase();

    const jobId = `job-global-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create the job immediately in "running" status
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
            let propertyDetails = "";
            if (listingId && listingId !== "portfolio_wide") {
              const listing = await Listing.findById(listingId).lean();
              if (listing) {
                propertyDetails = `\n\n[PROPERTY_DATA]\n` +
                  `- Name: ${(listing as any).name}\n` +
                  `- Base Price: ${(listing as any).basePrice ?? (listing as any).price}\n` +
                  `- City: ${(listing as any).city || "Dubai"}\n` +
                  `- Area: ${(listing as any).area || "Dubai Marina"}\n` +
                  `- Bedrooms: ${(listing as any).bedrooms || 1}\n` +
                  `- Bathrooms: ${(listing as any).bathrooms || 1}`;
              }
            }
            messageToSend = `[SESSION_INIT]\norg_id: ${orgId || "priceos-user"}\nlisting_id: ${listingId || "portfolio_wide"}${propertyDetails}\n\nUser Request: ${message}`;
          }
        }
        
        const result = await callLyzrAgent(
          agentId,
          messageToSend,
          "priceos-user",
          sessionId || jobId
        );

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
        console.error(`[Background Job ${jobId}] Failed:`, bgErr);
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
