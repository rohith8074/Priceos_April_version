import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Types } from "mongoose";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, text, orgId } = body;

    if (!conversationId || !text) {
      return NextResponse.json({ error: "Missing conversationId or text" }, { status: 400 });
    }

    await connectToDatabase();

    // Query for conversation
    const query: any = {};
    const orConditions: any[] = [{ hostawayConversationId: String(conversationId) }];
    
    if (Types.ObjectId.isValid(conversationId)) {
      orConditions.push({ _id: new Types.ObjectId(conversationId) });
    }
    query.$or = orConditions;

    if (orgId && Types.ObjectId.isValid(orgId)) {
      query.orgId = new Types.ObjectId(orgId);
    }

    const conv = await HostawayConversation.findOne(query);

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Add new message
    conv.messages.push({
      sender: "admin",
      text: String(text).trim(),
      timestamp: new Date().toISOString()
    });

    conv.needsReply = false;
    await conv.save();

    return NextResponse.json({ success: true, message: "Reply saved to MongoDB" });
  } catch (err: any) {
    console.error("[POST /api/hostaway/save-reply]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
