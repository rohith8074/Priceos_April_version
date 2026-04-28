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

    const conversations = await HostawayConversation.find(query).sort({ updatedAt: -1 }).limit(50).lean();

    return NextResponse.json({ conversations });
  } catch (err: any) {
    console.error("[GET /api/hostaway/conversations/cached]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
