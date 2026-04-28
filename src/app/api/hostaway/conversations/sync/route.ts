import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Listing } from "@/lib/db/models/Listing";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    await connectToDatabase();
    
    const listings = await Listing.find({ orgId }).lean();
    if (listings.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const hostawayToken = process.env.Hostaway_Authorization_token;
    if (!hostawayToken) {
      return NextResponse.json({ error: "Missing Hostaway authorization token" }, { status: 500 });
    }

    let syncCount = 0;

    for (const listing of listings) {
      if (!listing.hostawayId) continue;

      try {
        const res = await fetch(`https://api.hostaway.com/v1/conversations?listingMapId=${listing.hostawayId}`, {
          headers: {
            "Authorization": `Bearer ${hostawayToken}`,
            "Cache-control": "no-cache"
          }
        });

        if (!res.ok) continue;

        const data = await res.json();
        const results = data.result || [];

        for (const conv of results) {
          const convId = String(conv.id);
          
          // Optionally fetch messages for this conversation if needed
          let messages: any[] = [];
          try {
            const msgRes = await fetch(`https://api.hostaway.com/v1/conversations/${convId}/messages`, {
              headers: {
                "Authorization": `Bearer ${hostawayToken}`,
                "Cache-control": "no-cache"
              }
            });
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              messages = (msgData.result || []).map((m: any) => ({
                sender: m.isIncoming === 1 ? "guest" : "admin",
                text: m.body || "",
                timestamp: m.insertedOn || m.updatedOn || new Date().toISOString()
              }));
            }
          } catch (msgErr) {
            console.error(`[SYNC] Failed messages for convId=${convId}`, msgErr);
          }

          const existing = await HostawayConversation.findOne({
            orgId: listing.orgId,
            hostawayConversationId: convId
          });

          if (existing) {
            existing.guestName = conv.guestName || "Guest";
            existing.dateFrom = conv.reservationDateFrom || existing.dateFrom || "";
            existing.dateTo = conv.reservationDateTo || existing.dateTo || "";
            existing.needsReply = Boolean(conv.isUnread);
            existing.syncedAt = new Date();
            if (messages.length > 0) {
              existing.messages = messages;
            }
            await existing.save();
          } else {
            await HostawayConversation.create({
              orgId: listing.orgId,
              listingId: listing._id,
              hostawayConversationId: convId,
              guestName: conv.guestName || "Guest",
              dateFrom: conv.reservationDateFrom || "",
              dateTo: conv.reservationDateTo || "",
              needsReply: Boolean(conv.isUnread),
              syncedAt: new Date(),
              messages
            });
          }
          syncCount++;
        }
      } catch (listErr) {
        console.error(`[SYNC] Failed for listing=${listing._id}`, listErr);
      }
    }

    return NextResponse.json({ success: true, count: syncCount });
  } catch (err: any) {
    console.error("[POST /api/hostaway/conversations/sync]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
