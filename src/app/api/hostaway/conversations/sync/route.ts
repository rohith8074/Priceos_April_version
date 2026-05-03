import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { Listing } from "@/lib/db/models/Listing";
import { getOrgHostawayToken } from "@/lib/hostaway/token";

export async function POST(req: NextRequest) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    await connectToDatabase();

    let hostawayToken: string;
    try {
      hostawayToken = await getOrgHostawayToken(orgId);
    } catch {
      hostawayToken = process.env.Hostaway_Authorization_token || "";
    }

    if (!hostawayToken) {
      return NextResponse.json({ error: "Missing Hostaway authorization token" }, { status: 500 });
    }

    // 1. Build listing map from DB (hostawayId → MongoDB _id)
    const listings = await Listing.find({ orgId }).lean();
    const listingMap = new Map(
      listings
        .filter((l: any) => l.hostawayId)
        .map((l: any) => [String(l.hostawayId), l._id])
    );

    console.log(`[SYNC] org=${orgId} — ${listings.length} listings in DB, ${listingMap.size} have hostawayId set`);

    // 2. Fetch conversations from Hostaway
    //    If any listings lack hostawayId, also fetch Hostaway's listing catalog
    //    so we can heal the hostawayId and build a complete map.
    let healedCount = 0;
    if (listingMap.size < listings.length) {
      try {
        const hwListingsRes = await fetch("https://api.hostaway.com/v1/listings?limit=100&includeResources=0", {
          headers: {
            Authorization: `Bearer ${hostawayToken}`,
            "Cache-control": "no-cache",
          },
        });
        if (hwListingsRes.ok) {
          const hwListingsData = await hwListingsRes.json();
          const hwListings: any[] = hwListingsData.result || [];

          // Match by name (case-insensitive) for listings that have no hostawayId
          for (const dbListing of listings as any[]) {
            if (dbListing.hostawayId) continue;
            const match = hwListings.find(
              (hl: any) =>
                hl.name?.toLowerCase().trim() === dbListing.name?.toLowerCase().trim()
            );
            if (match) {
              const hwId = String(match.id);
              await Listing.findByIdAndUpdate(dbListing._id, { hostawayId: hwId });
              listingMap.set(hwId, dbListing._id);
              healedCount++;
              console.log(`[SYNC] Healed hostawayId=${hwId} for listing "${dbListing.name}"`);
            }
          }
        }
      } catch (healErr: any) {
        console.warn("[SYNC] Listing heal step failed (non-fatal):", healErr?.message);
      }
    }

    if (healedCount > 0) {
      console.log(`[SYNC] Healed hostawayId on ${healedCount} listing(s)`);
    }

    // 3. Fetch all conversations for this Hostaway account
    const convsRes = await fetch("https://api.hostaway.com/v1/conversations?limit=100", {
      headers: {
        Authorization: `Bearer ${hostawayToken}`,
        "Cache-control": "no-cache",
        "User-Agent": "PriceOS/1.0 (GuestInboxSync)",
      },
    });

    if (!convsRes.ok) {
      const errText = await convsRes.text();
      throw new Error(`Hostaway API error: ${convsRes.status} ${errText}`);
    }

    const convsData = await convsRes.json();
    const allConvs: any[] = convsData.result || [];

    // Diagnose: unique listingMapIds coming from Hostaway
    const hwListingIds = [...new Set(allConvs.map((c: any) => String(c.listingMapId)))];
    console.log(`[SYNC] ${allConvs.length} conversations from Hostaway. Unique listingMapIds:`, hwListingIds);
    console.log(`[SYNC] Our listing map keys:`, [...listingMap.keys()]);

    // 4. Sync ALL conversations from this account — link to a listing when possible,
    //    save without a listing link otherwise (so nothing is silently dropped).
    const CONCURRENCY = 5;
    let syncCount = 0;

    for (let i = 0; i < allConvs.length; i += CONCURRENCY) {
      const chunk = allConvs.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (conv: any) => {
          const convId = String(conv.id);
          const listingId = listingMap.get(String(conv.listingMapId)) ?? null;

          const existing = await HostawayConversation.findOne({
            orgId,
            hostawayConversationId: convId,
          });

          let messages = existing?.messages || [];

          if (!existing || conv.isUnread) {
            try {
              const msgRes = await fetch(
                `https://api.hostaway.com/v1/conversations/${convId}/messages`,
                {
                  headers: {
                    Authorization: `Bearer ${hostawayToken}`,
                    "Cache-control": "no-cache",
                    "User-Agent": "PriceOS/1.0 (MessageFetch)",
                  },
                }
              );
              if (msgRes.ok) {
                const msgData = await msgRes.json();
                messages = (msgData.result || []).map((m: any) => ({
                  sender: m.isIncoming === 1 ? "guest" : "admin",
                  text: m.body || "",
                  timestamp: m.insertedOn || m.updatedOn || new Date().toISOString(),
                }));
              }
            } catch (msgErr) {
              console.error(`[SYNC] Failed messages for convId=${convId}`, msgErr);
            }
          }

          if (existing) {
            existing.guestName = conv.guestName || "Guest";
            existing.listingId = listingId ?? existing.listingId;
            existing.listingMapId = Number(conv.listingMapId);
            existing.dateFrom = conv.reservationDateFrom || existing.dateFrom || "";
            existing.dateTo = conv.reservationDateTo || existing.dateTo || "";
            existing.needsReply = Boolean(conv.isUnread);
            existing.syncedAt = new Date();
            existing.messages = messages;
            await existing.save();
          } else {
            await HostawayConversation.create({
              orgId,
              listingId,
              listingMapId: Number(conv.listingMapId),
              hostawayConversationId: convId,
              guestName: conv.guestName || "Guest",
              dateFrom: conv.reservationDateFrom || "",
              dateTo: conv.reservationDateTo || "",
              needsReply: Boolean(conv.isUnread),
              syncedAt: new Date(),
              messages,
            });
          }
          syncCount++;
        })
      );
    }

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[SYNC] Done in ${duration}s. Synced ${syncCount}/${allConvs.length} conversations (${healedCount} listings healed).`);

    return NextResponse.json({
      success: true,
      count: syncCount,
      healed: healedCount,
      duration: `${duration}s`,
    });
  } catch (err: any) {
    console.error("[POST /api/hostaway/conversations/sync]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
