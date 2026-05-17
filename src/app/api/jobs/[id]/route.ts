import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job } from "@/lib/db/models/Job";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    const job = await Job.findOne({ jobId: id }).lean();
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      status: job.status,
      result: job.result,
      error: job.error,
      created_at: (job as any).createdAt?.toISOString(),
    });
  } catch (err: any) {
    console.error(`[GET /api/jobs]`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
