import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job } from "@/lib/db/models/Job";
import { callLyzrAgent } from "@/lib/services/lyzr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, sessionId, graphSessionId } = body;

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
        
        const result = await callLyzrAgent(
          agentId,
          message,
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
