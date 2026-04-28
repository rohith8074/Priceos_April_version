import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models";
import { Types } from "mongoose";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const { id: threadId } = await params;

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
    }

    await connectToDatabase();

    const query: any = {};
    if (orgId && Types.ObjectId.isValid(orgId)) {
      query.orgId = new Types.ObjectId(orgId);
    }
    query.$or = [{ _id: threadId }, { hostawayId: threadId }, { conversationId: threadId }];

    const conv = await HostawayConversation.findOne(query).lean() as any;

    if (!conv) {
      return NextResponse.json({ summary: null, generated: false, message: "Conversation not found" });
    }

    const messages = conv.messages || [];
    const guestMessages = messages.filter((m: any) => m.role !== "host" && m.role !== "admin");
    const lastMsg = messages[messages.length - 1];

    return NextResponse.json({
      generated: true,
      guestName: conv.guestName || "Guest",
      propertyName: conv.propertyName || conv.listingName || "",
      messageCount: messages.length,
      lastActivity: lastMsg?.time || lastMsg?.createdAt || null,
      summary: `Conversation with ${conv.guestName || "guest"} — ${messages.length} messages, ${guestMessages.length} from guest.`,
    });
  } catch (err: any) {
    console.error("[POST /api/guest-agent/threads/[id]/summary]", err);
    return NextResponse.json({ summary: null, generated: false, error: err.message }, { status: 500 });
  }
}
