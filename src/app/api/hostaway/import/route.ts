/**
 * POST /api/hostaway/import
 *
 * Real Hostaway data import — called after onboarding property selection
 * or manually from Settings → Sync.
 *
 * What it fetches per listing:
 *   1. GET /listings/{id}           → price, minStay, maxStay, amenities, capacity
 *   2. GET /listings/{id}/calendar  → 90-day availability + per-day prices
 *
 * What it writes to MongoDB:
 *   - Listing.price, priceFloor (50% base), priceCeiling (3× base)
 *   - Listing.lowestMinStayAllowed, defaultMaxStay, amenities, personCapacity
 *   - InventoryMaster: one doc per calendar day (status + price)
 *
 * NOTE: This is a READ-ONLY pull from Hostaway — no data is written back.
 * The user must be authenticated and own the listings (org-scoped).
 *
 * Body: { listingIds: string[] }   ← MongoDB Listing._id values
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { connectDB, Organization, Listing, InventoryMaster } from "@/lib/db";
import mongoose from "mongoose";
import { format, addDays } from "date-fns";

// ── Hostaway API base ─────────────────────────────────────────────────────────
const HOSTAWAY_API = "https://api.hostaway.com/v1";

// ── Helper: fetch with auth ───────────────────────────────────────────────────
async function hostawayGet(path: string, apiKey: string): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`${HOSTAWAY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn(`[Hostaway/Import] ${path} → ${res.status}`);
    return { ok: false, data: null };
  }
  const json = await res.json();
  return { ok: true, data: json.result ?? json };
}

// ── Hostaway calendar status → InventoryMaster status ────────────────────────
function mapCalendarStatus(
  isAvailable: number | boolean,
  isBooked: number | boolean
): "available" | "booked" | "blocked" {
  if (isBooked === 1 || isBooked === true) return "booked";
  if (isAvailable === 0 || isAvailable === false) return "blocked";
  return "available";
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload: { orgId: string; userId: string };
    try {
      payload = verifyAccessToken(token) as { orgId: string; userId: string };
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    await connectDB();

    // ── Fetch org API key ─────────────────────────────────────────────────────
    const org = await Organization.findById(payload.orgId).select("hostawayApiKey").lean();
    if (!org?.hostawayApiKey) {
      return NextResponse.json(
        { error: "Hostaway API key not configured. Please reconnect in Settings." },
        { status: 400 }
      );
    }
    const apiKey = org.hostawayApiKey;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const listingMongoIds: string[] = Array.isArray(body.listingIds) ? body.listingIds : [];

    if (listingMongoIds.length === 0) {
      return NextResponse.json({ error: "listingIds array is required" }, { status: 400 });
    }

    const orgObjectId = new mongoose.Types.ObjectId(payload.orgId);

    // Validate all requested listings belong to this org
    const ownedListings = await Listing.find({
      _id: { $in: listingMongoIds.map(id => new mongoose.Types.ObjectId(id)) },
      orgId: orgObjectId,
    }).select("_id hostawayId name").lean();

    if (ownedListings.length === 0) {
      return NextResponse.json({ error: "No valid listings found for this organization" }, { status: 404 });
    }

    // ── Import loop ───────────────────────────────────────────────────────────
    const results: {
      listingId: string;
      name: string;
      hostawayId: string;
      calendarDays: number;
      status: "ok" | "error";
      error?: string;
    }[] = [];

    const calendarStart = new Date();
    const calendarEnd = addDays(calendarStart, 90);
    const startStr = format(calendarStart, "yyyy-MM-dd");
    const endStr = format(calendarEnd, "yyyy-MM-dd");

    for (const listing of ownedListings) {
      const hostawayId = listing.hostawayId;
      if (!hostawayId || hostawayId.startsWith("demo-")) {
        // Skip demo listings — they have no real Hostaway ID
        results.push({
          listingId: listing._id.toString(),
          name: listing.name,
          hostawayId: hostawayId ?? "none",
          calendarDays: 0,
          status: "error",
          error: "Demo listing — no Hostaway ID",
        });
        continue;
      }

      try {
        // ── Step 1: Fetch listing detail (price, minStay, amenities) ──────────
        const { ok: detailOk, data: detailData } = await hostawayGet(
          `/listings/${hostawayId}`,
          apiKey
        );

        let priceUpdate: Record<string, unknown> = {};

        if (detailOk && detailData && typeof detailData === "object") {
          const d = detailData as Record<string, unknown>;

          const basePrice = Number(d.price ?? d.basePrice ?? 0);
          const minStay  = Number(d.minimumStay ?? d.minNights ?? d.lowestMinStayAllowed ?? 1);
          const maxStay  = Number(d.maximumStay ?? d.maxNights ?? d.defaultMaxStay ?? 365);
          const capacity = Number(d.personCapacity ?? d.guestCapacity ?? 0);

          // Parse amenities — Hostaway returns array or comma-separated string
          let amenities: string[] = [];
          if (Array.isArray(d.amenities)) {
            amenities = (d.amenities as string[]).filter(Boolean).slice(0, 30);
          } else if (typeof d.amenities === "string") {
            amenities = d.amenities.split(",").map((a: string) => a.trim()).filter(Boolean).slice(0, 30);
          }

          if (basePrice > 0) {
            priceUpdate = {
              price:                 basePrice,
              priceFloor:            Math.round(basePrice * 0.5),  // 50% of base
              priceCeiling:          Math.round(basePrice * 3.0),  // 3× base
              guardrailsSource:      "market_template" as const,
              lowestMinStayAllowed:  minStay,
              defaultMaxStay:        maxStay,
              ...(capacity > 0 && { personCapacity: capacity }),
              ...(amenities.length > 0 && { amenities }),
            };

            await Listing.findByIdAndUpdate(listing._id, { $set: priceUpdate });
            console.log(
              `[Hostaway/Import] ${listing.name}: price=${basePrice}, minStay=${minStay}`
            );
          }
        }

        // ── Step 2: Fetch 90-day calendar ─────────────────────────────────────
        const { ok: calOk, data: calData } = await hostawayGet(
          `/listings/${hostawayId}/calendar?startDate=${startStr}&endDate=${endStr}`,
          apiKey
        );

        let calendarDays = 0;

        if (calOk && calData) {
          const days: unknown[] = Array.isArray(calData)
            ? calData
            : (calData as Record<string, unknown[]>).days ?? [];

          // Build bulk ops for InventoryMaster
          const bulkOps = days
            .filter((day): day is Record<string, unknown> => typeof day === "object" && day !== null)
            .map((day) => {
              const dateStr = String(day.date ?? "");
              if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

              const dayPrice = Number(
                day.price ?? day.basePrice ?? day.customPrice ??
                priceUpdate.price ?? listing.name // fallback skipped
              ) || 0;

              const status = mapCalendarStatus(
                day.isAvailable as number,
                day.isBooked as number
              );

              const minStay = Number(day.minimumStay ?? day.minNights ?? 1);
              const maxStay = Number(day.maximumStay ?? day.maxNights ?? 365);

              return {
                updateOne: {
                  filter: {
                    orgId:     orgObjectId,
                    listingId: listing._id,
                    date:      dateStr,
                  },
                  update: {
                    $set: {
                      orgId:        orgObjectId,
                      listingId:    listing._id,
                      date:         dateStr,
                      currentPrice: dayPrice,
                      basePrice:    dayPrice,
                      status,
                      minStay:      minStay,
                      maxStay:      maxStay,
                    },
                  },
                  upsert: true,
                },
              };
            })
            .filter(Boolean);

          if (bulkOps.length > 0) {
            await InventoryMaster.bulkWrite(
              bulkOps as Parameters<typeof InventoryMaster.bulkWrite>[0],
              { ordered: false }
            );
            calendarDays = bulkOps.length;
          }
        }

        results.push({
          listingId: listing._id.toString(),
          name: listing.name,
          hostawayId,
          calendarDays,
          status: "ok",
        });
      } catch (listingErr) {
        console.error(`[Hostaway/Import] Error importing listing ${listing.name}:`, listingErr);
        results.push({
          listingId: listing._id.toString(),
          name: listing.name,
          hostawayId: hostawayId ?? "",
          calendarDays: 0,
          status: "error",
          error: listingErr instanceof Error ? listingErr.message : String(listingErr),
        });
      }
    }

    const successful = results.filter(r => r.status === "ok").length;
    const totalCalendarDays = results.reduce((sum, r) => sum + r.calendarDays, 0);

    return NextResponse.json({
      success: true,
      imported: successful,
      total: ownedListings.length,
      totalCalendarDays,
      results,
    });
  } catch (e: unknown) {
    console.error("[Hostaway/Import] Fatal error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
