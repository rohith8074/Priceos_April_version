/**
 * sync-server-utils.ts — Server-side sync helpers
 *
 * Utilities for syncing Hostaway data into MongoDB.
 * Used exclusively in server-side code (API routes, background jobs).
 */
import mongoose from "mongoose";
import { Listing } from "@/lib/db/models/Listing";
import { Reservation } from "@/lib/db/models/Reservation";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { HostawayClient } from "@/lib/pms/hostaway-client";
import { format } from "date-fns";

// ── Listings ─────────────────────────────────────────────────────────────────

export async function syncListingsToDb(hostawayListings: any[]) {
  for (const hl of hostawayListings) {
    await Listing.findOneAndUpdate(
      { hostawayId: String(hl.id) },
      {
        $set: {
          hostawayId: String(hl.id),
          name: hl.name,
          internalListingName: hl.internalListingName || hl.name,
          currencyCode: hl.currencyCode || "AED",
          price: hl.price || 0,
          propertyType: hl.propertyType,
          roomType: hl.roomType,
        },
      },
      { upsert: true, new: true }
    );
  }
}

// ── Reservations ─────────────────────────────────────────────────────────────

export async function syncReservationsToDb(
  reservations: any[],
  _syncedAt: Date
) {
  for (const r of reservations) {
    await Reservation.findOneAndUpdate(
      { hostawayReservationId: String(r.id) },
      {
        $set: {
          hostawayReservationId: String(r.id),
          listingId: r.listingMapId,
          guestName: r.guestName || "Guest",
          checkIn: r.arrivalDate,
          checkOut: r.departureDate,
          totalPrice: r.totalPrice || 0,
          status: r.status || "confirmed",
          channelName: r.channelName,
        },
      },
      { upsert: true, new: true }
    );
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
  if (!listing) return;

  for (const day of calendarDays) {
    if (!day.date) continue;
    // Store calendar price overrides into the listing's priceOverrides map
    await Listing.findByIdAndUpdate(listing._id, {
      $set: {
        [`priceOverrides.${day.date}`]: {
          price: day.price || 0,
          status: day.status || "available",
          isAvailable: day.isAvailable !== false,
          minimumStay: day.minimumStay,
        },
      },
    });
  }
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function syncConversationsToDb(
  hostawayToInternalIdMap: Map<number, mongoose.Types.ObjectId>,
  _apiKey: string
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  for (const [hostawayListingId, _internalId] of hostawayToInternalIdMap) {
    try {
      const client = new HostawayClient();
      const conversations = await client.getConversations({ listingMapId: hostawayListingId, limit: 50 });

      for (const conv of conversations) {
        await HostawayConversation.findOneAndUpdate(
          { hostawayConversationId: String(conv.id) },
          {
            $set: {
              hostawayConversationId: String(conv.id),
              guestName: conv.guestName || "Guest",
              isUnread: conv.isUnread || false,
              listingMapId: hostawayListingId,
              updatedAt: conv.updatedOn ? new Date(conv.updatedOn) : new Date(),
            },
          },
          { upsert: true, new: true }
        );
        synced++;
      }
    } catch (err) {
      errors++;
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
