import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Listing } from "@/lib/db/models/Listing";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    await connectToDatabase();
    
    const listing = await Listing.findById(listingId);
    if (!listing || !listing.hostawayId) {
       return NextResponse.json({ conversations: [] }); // No hostaway mapping
    }

    const hostawayToken = process.env.Hostaway_Authorization_token;
    if (!hostawayToken) {
       return NextResponse.json({ error: "Missing hostaway token" }, { status: 500 });
    }

    // Call actual hostaway API
    const res = await fetch(`https://api.hostaway.com/v1/conversations?listingMapId=${listing.hostawayId}`, {
      headers: {
        "Authorization": `Bearer ${hostawayToken}`,
        "Cache-control": "no-cache"
      }
    });

    if (!res.ok) {
       return NextResponse.json({ error: "Failed to fetch from Hostaway" }, { status: res.status });
    }

    const data = await res.json();
    const results = data.result || [];
    
    const formatted = results.map((conv: any) => ({
      hostawayConversationId: conv.id.toString(),
      guestName: conv.guestName || "Guest",
      needsReply: conv.isUnread || false,
      dateFrom: conv.reservationDateFrom || "",
      dateTo: conv.reservationDateTo || "",
      updatedAt: conv.updatedOn || new Date().toISOString()
    }));

    return NextResponse.json({ conversations: formatted });
  } catch (err: any) {
    console.error("[GET /api/hostaway/conversations]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
