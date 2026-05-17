import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { ChatMessage } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const propertyId = searchParams.get("propertyId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ sessions: [] });
    }

    await connectToDatabase();

    const match: any = {
      orgId: new Types.ObjectId(orgId),
      role: { $in: ["user", "assistant"] },
    };

    // Filter by sessionId prefix — encodes property + date range — so all past
    // conversations for this scope appear regardless of when the chat was held.
    // A createdAt filter would hide chats from previous days about a future window.
    if (propertyId && propertyId !== "null" && Types.ObjectId.isValid(propertyId)) {
      if (from && to) {
        // Exact scope: property + date range (most common case)
        match.sessionId = { $regex: `^property-${propertyId}-${from}-${to}` };
      } else {
        // Any conversation for this property
        match.sessionId = { $regex: `^property-${propertyId}-` };
      }
    } else if (!propertyId || propertyId === "null") {
      // Portfolio-level sessions
      if (from && to) {
        match.sessionId = { $regex: `^portfolio-${from}-${to}` };
      } else {
        match.sessionId = { $regex: `^portfolio-` };
      }
    }

    const results = await ChatMessage.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$sessionId",
          lastMessageAt: { $max: "$createdAt" },
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      { $limit: 50 },
    ]);

    const sessions = results.map((r) => ({
      sessionId: r._id,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? new Date().toISOString(),
      messageCount: r.messageCount,
    }));

    return NextResponse.json({ sessions });
  } catch (err: any) {
    console.error("[GET /api/chat/sessions]", err);
    return NextResponse.json({ sessions: [] });
  }
}
