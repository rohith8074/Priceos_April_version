/**
 * sync-server-utils.ts — Server-side sync helpers
 *
 * Utilities for syncing Hostaway data into MongoDB.
 * Used exclusively in server-side code (API routes, background jobs).
 */
import mongoose, { Types } from "mongoose";
import { Listing } from "@/lib/db/models/Listing";
import { Reservation } from "@/lib/db/models/Reservation";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { HostawayClient } from "@/lib/pms/hostaway-client";
import { format } from "date-fns";

const BULK_CHUNK = 200; // max ops per bulkWrite call

// ── Listings ─────────────────────────────────────────────────────────────────

/**
 * Upsert Hostaway listings for an org.
 * After upserting, stale listings for this org (no longer in Hostaway) are deleted.
 */
export async function syncListingsToDb(hostawayListings: any[], orgId?: string) {
  if (hostawayListings.length === 0) return;

  const orgOid = orgId ? new Types.ObjectId(orgId) : null;
  const realIds = hostawayListings.map((l) => String(l.id));

  const ops = hostawayListings.map((hl) => ({
    updateOne: {
      filter: { hostawayId: String(hl.id) },
      update: {
        $set: {
          ...(orgOid ? { orgId: orgOid } : {}),
          hostawayId: String(hl.id),
          name: hl.name,
          internalListingName: hl.internalListingName || hl.name,
          currencyCode: hl.currencyCode || "AED",
          price: hl.price || 0,
          propertyType: hl.propertyType,
          roomType: hl.roomType,
        },
      },
      upsert: true,
    },
  }));

  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    await Listing.bulkWrite(ops.slice(i, i + BULK_CHUNK), { ordered: false });
  }

  // Remove stale listings for this org: those whose hostawayId is not in the fetched set,
  // or demo/seed listings (no real hostawayId, or ids starting with "demo-")
  if (orgOid) {
    await Listing.deleteMany({
      orgId: orgOid,
      $or: [
        { hostawayId: { $nin: realIds } },
        { hostawayId: { $exists: false } },
        { hostawayId: "" },
      ],
    });
  }
}

// ── Reservations ─────────────────────────────────────────────────────────────

export async function syncReservationsToDb(
  reservations: any[],
  _syncedAt: Date,
  orgId?: string
) {
  if (reservations.length === 0) return;

  const orgOid = orgId ? new Types.ObjectId(orgId) : null;

  const ops = reservations.map((r) => ({
    updateOne: {
      filter: { hostawayReservationId: String(r.id) },
      update: {
        $set: {
          hostawayReservationId: String(r.id),
          listingId: r.listingMapId,
          guestName: r.guestName || "Guest",
          checkIn: r.arrivalDate,
          checkOut: r.departureDate,
          nights: r.nights || 1,
          totalPrice: r.totalPrice || 0,
          status: r.status || "confirmed",
          channelName: r.channelName || "Direct",
          ...(orgOid ? { orgId: orgOid } : {}),
        },
      },
      upsert: true,
    },
  }));

  for (let i = 0; i < ops.length; i += BULK_CHUNK) {
    await Reservation.bulkWrite(ops.slice(i, i + BULK_CHUNK), { ordered: false });
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function syncCalendarToDb(
  client: HostawayClient,
  _listingIds: mongoose.Types.ObjectId[],
  startDate: Date,
  endDate: Date,
  hostawayListingId: number
) {
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");
  const calendarDays = await client.getCalendar(hostawayListingId, startStr, endStr);

  const listing = await Listing.findOne({ hostawayId: String(hostawayListingId) });
  if (!listing || calendarDays.length === 0) return;

  // Build the entire $set payload for all days in one pass, then write once
  const setPayload: Record<string, any> = {};
  for (const day of calendarDays) {
    if (!day.date) continue;
    setPayload[`priceOverrides.${day.date}`] = {
      price: day.price || 0,
      status: day.status || "available",
      isAvailable: day.isAvailable !== false,
      minimumStay: day.minimumStay,
    };
  }

  if (Object.keys(setPayload).length > 0) {
    await Listing.findByIdAndUpdate(listing._id, { $set: setPayload });
  }
}

// ── Conversations ─────────────────────────────────────────────────────────────

const CONV_CONCURRENCY = 5; // parallel Hostaway API requests

export async function syncConversationsToDb(
  hostawayToInternalIdMap: Map<number, mongoose.Types.ObjectId>,
  bearerToken?: string,
  orgId?: string
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  const orgOid = orgId ? new Types.ObjectId(orgId) : null;
  const listingIds = Array.from(hostawayToInternalIdMap.keys());

  for (let i = 0; i < listingIds.length; i += CONV_CONCURRENCY) {
    const chunk = listingIds.slice(i, i + CONV_CONCURRENCY);

    const results = await Promise.allSettled(
      chunk.map(async (hostawayListingId) => {
        const internalListingId = hostawayToInternalIdMap.get(hostawayListingId);
        const client = new HostawayClient(bearerToken);
        const conversations = await client.getConversations({
          listingMapId: hostawayListingId,
          limit: 50,
        });

        if (conversations.length === 0) return 0;

        // Build a reservationId → reservation map for guest name lookup
        const reservationIds = conversations
          .map((c: any) => String(c.reservationId || ""))
          .filter(Boolean);
        let reservationGuestMap: Map<string, { guestName: string; checkIn: string; checkOut: string }> = new Map();
        if (reservationIds.length > 0) {
          const { Reservation } = await import("@/lib/db/models/Reservation");
          const resvDocs = await Reservation.find(
            { hostawayReservationId: { $in: reservationIds } },
            { hostawayReservationId: 1, guestName: 1, checkIn: 1, checkOut: 1 }
          ).lean() as any[];
          resvDocs.forEach((r: any) => {
            if (r.hostawayReservationId) {
              reservationGuestMap.set(r.hostawayReservationId, {
                guestName: r.guestName,
                checkIn: r.checkIn,
                checkOut: r.checkOut,
              });
            }
          });
        }

        const ops = conversations.map((conv: any) => {
          const resvId = conv.reservationId ? String(conv.reservationId) : "";
          const linkedResv = resvId ? reservationGuestMap.get(resvId) : undefined;
          const guestName = conv.guestName || linkedResv?.guestName || "Guest";
          const dateFrom = conv.arrivalDate || conv.dateFrom || linkedResv?.checkIn || "";
          const dateTo = conv.departureDate || conv.dateTo || linkedResv?.checkOut || "";
          const channelName = conv.channelName || conv.channel || "Direct";

          return {
            updateOne: {
              // hostawayConversationId is the unique key — no duplicates possible
              filter: { hostawayConversationId: String(conv.id) },
              update: {
                $set: {
                  hostawayConversationId: String(conv.id),
                  guestName,
                  needsReply: Boolean(conv.isUnread),
                  listingMapId: hostawayListingId,
                  channelName,
                  dateFrom,
                  dateTo,
                  reservationId: resvId || undefined,
                  ...(orgOid ? { orgId: orgOid } : {}),
                  ...(internalListingId ? { listingId: internalListingId } : {}),
                  updatedAt: conv.updatedOn ? new Date(conv.updatedOn) : new Date(),
                },
              },
              upsert: true,
            },
          };
        });

        await HostawayConversation.bulkWrite(ops, { ordered: false });
        return ops.length;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") synced += result.value;
      else errors++;
    }
  }

  return { synced, errors };
}

// ── Client-side trigger (fetch-based, no direct DB access) ───────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export async function syncHostawayConversations(
  listingId: string,
  sessionToken?: string
): Promise<{ success: boolean; synced?: number; message?: string }> {
  try {
    const res = await fetch(`${API}/sync/hostaway-conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ listingId }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: err };
    }
    return res.json();
  } catch (err) {
    return { success: false, message: String(err) };
  }
}

export async function triggerFullSync(
  orgId: string,
  sessionToken?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${API}/sync/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ orgId }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: err };
    }
    return res.json();
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
