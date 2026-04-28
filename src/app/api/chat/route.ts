import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job, ChatMessage, Listing } from "@/lib/db/models";
import { callLyzrAgent } from "@/lib/services/lyzr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, orgId, context, sessionId } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectToDatabase();

    const jobId = `job-aria-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

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

        const agentId = "69998743f4d61186679a9515"; // Aria CRO Router Agent

        // Check if this is the first message in the session
        let messageToSend = message;
        if (sessionId) {
          const priorCount = await ChatMessage.countDocuments({ sessionId });
          if (priorCount === 0) {
            let propertyDetails = "";
            if (context?.propertyId) {
              const listing = await Listing.findById(context.propertyId).lean();
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
            messageToSend = `[SESSION_INIT]\norg_id: ${orgId || "priceos-user"}\nlisting_id: ${context?.propertyId || "portfolio_wide"}${propertyDetails}\n\nUser Request: ${message}`;
          }
        }

        let systemVars: any = {};
        if (context) {
          systemVars = {
            context_type: context.type,
            property_id: context.propertyId,
            property_name: context.propertyName,
          };
        }

        const result = await callLyzrAgent(
          agentId,
          messageToSend,
          orgId || "priceos-user",
          sessionId || jobId,
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
