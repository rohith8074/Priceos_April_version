import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const orgId = searchParams.get("orgId");
    
    if (!listingId && !orgId) {
      return NextResponse.json({ error: "listingId or orgId required" }, { status: 400 });
    }

    await connectToDatabase();
    
    const query: any = {};
    if (listingId && Types.ObjectId.isValid(listingId)) {
      query.listingId = new Types.ObjectId(listingId);
    }
    if (orgId && Types.ObjectId.isValid(orgId)) {
      query.orgId = new Types.ObjectId(orgId);
    }

    const docs = await HostawayConversation.find(query).sort({ updatedAt: -1 }).limit(200).lean() as any[];

    const today = new Date().toISOString().split("T")[0];

    const conversations = docs.map((doc) => {
      const dateFrom = doc.dateFrom || "";
      const dateTo = doc.dateTo || "";

      // A conversation needs reply if Hostaway flagged it (isUnread/needsReply)
      // or if the last message in the thread is from the guest.
      let needsReply = Boolean(doc.needsReply);
      
      if (!doc.needsReply && doc.messages && doc.messages.length > 0) {
        const lastMsg = doc.messages[doc.messages.length - 1];
        if (lastMsg.sender === "guest") {
          needsReply = true;
        }
      }

      return {
        ...doc,
        id: doc.hostawayConversationId || doc._id.toString(),
        listingId: doc.listingId?.toString() || "",
        channelName: doc.channelName || "Direct",
        dateFrom,
        dateTo,
        needsReply,
        status: needsReply ? "needs_reply" : "resolved",
      };
    });

    return NextResponse.json({ conversations });
  } catch (err: any) {
    console.error("[GET /api/hostaway/conversations/cached]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
