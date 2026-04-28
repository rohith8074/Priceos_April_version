import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema(
  {
    orgId: { type: String, required: true },
    conversationId: { type: String, required: true },
    feedback: { type: String, enum: ["good", "bad"], required: true },
    draft: { type: String },
  },
  { timestamps: true }
);

const DraftFeedback =
  mongoose.models.draft_feedbacks ||
  mongoose.model("draft_feedbacks", FeedbackSchema);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, conversationId, feedback, draft } = body;

    if (orgId && conversationId && feedback) {
      await connectToDatabase();
      await DraftFeedback.create({ orgId, conversationId, feedback, draft });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[POST /api/hostaway/draft-feedback]", err);
    return NextResponse.json({ ok: true });
  }
}
