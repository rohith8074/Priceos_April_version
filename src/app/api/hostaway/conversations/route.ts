import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Listing } from "@/lib/db/models/Listing";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const orgId = searchParams.get("orgId");
    
    await connectToDatabase();
    
    let listings = [];
    if (listingId) {
      const listing = await Listing.findById(listingId);
      if (listing) listings.push(listing);
    } else if (orgId) {
      const orgOid = new Types.ObjectId(orgId);
      listings = await Listing.find({ orgId: orgOid });
    } else {
      return NextResponse.json({ error: "listingId or orgId required" }, { status: 400 });
    }

    if (listings.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    const hostawayToken = process.env.Hostaway_Authorization_token;
    if (!hostawayToken) {
       return NextResponse.json({ error: "Missing hostaway token" }, { status: 500 });
    }

    let allConversations: any[] = [];
    
    // For each listing, fetch conversations from Hostaway
    for (const listing of listings) {
      if (!listing.hostawayId) continue;
      
      try {
        const res = await fetch(`https://api.hostaway.com/v1/conversations?listingMapId=${listing.hostawayId}`, {
          headers: {
            "Authorization": `Bearer ${hostawayToken}`,
            "Cache-control": "no-cache"
          }
        });

        if (res.ok) {
          const data = await res.json();
          const results = data.result || [];
          
          results.forEach((conv: any) => {
            allConversations.push({
              hostawayConversationId: conv.id.toString(),
              id: conv.id.toString(),
              guestName: conv.guestName || "Guest",
              lastMessage: conv.lastMessageContent || "No message content",
              status: conv.isUnread ? "needs_reply" : "resolved",
              unreadCount: conv.isUnread ? 1 : 0,
              messages: [
                { id: `msg-${conv.id}`, sender: "guest", text: conv.lastMessageContent || "Inquiry", time: conv.updatedOn || "Today" }
              ],
              listingId: listing._id.toString(),
              updatedAt: conv.updatedOn || new Date().toISOString()
            });
          });
        }
      } catch (err) {
        console.error(`Failed to fetch for listing ${listing._id}`, err);
      }
    }

    return NextResponse.json({ conversations: allConversations });
  } catch (err: any) {
    console.error("[GET /api/hostaway/conversations]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
