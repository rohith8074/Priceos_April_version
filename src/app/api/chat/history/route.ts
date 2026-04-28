import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { ChatMessage } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const sessionId = searchParams.get("sessionId");
    const propertyId = searchParams.get("propertyId");

    if (!orgId || !sessionId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ messages: [] });
    }

    await connectToDatabase();

    const query: any = {
      orgId: new Types.ObjectId(orgId),
      sessionId,
      role: { $in: ["user", "assistant"] },
    };

    const docs = await ChatMessage.find(query)
      .sort({ createdAt: 1 })
      .lean() as any[];

    const messages = docs.map((doc) => ({
      id: String(doc._id),
      role: doc.role as "user" | "assistant",
      content: doc.content,
      proposals: doc.metadata?.proposals,
      proposalStatus: doc.metadata?.proposalStatus,
      proposalDecisions: doc.metadata?.proposalDecisions,
      metadata: doc.metadata,
    }));

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("[GET /api/chat/history]", err);
    return NextResponse.json({ messages: [] });
  }
}
