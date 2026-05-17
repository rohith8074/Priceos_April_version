import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import {
  fetchSerpCompsForProperty,
  upsertSerpComps,
  isCacheFresh,
  markCacheFresh,
} from "@/lib/services/serp-comps";
import { Types } from "mongoose";

// Market Overview: ADR from SERP comps, Occupancy from your InventoryMaster,
// RevPAR = ADR × Occupancy. Cached 4hrs per listingId via DataSyncLog.

const jobName = (listingId: string) => `serp-market-overview-${listingId}`;

async function readSerpComps(area: string, bedrooms: number) {
  return (CompetitorListing as any).find({
    marketId: area,
    bedrooms,
    airbticsListingId: { $regex: "^serp:" },
    ttmAvgRateNative: { $gt: 0 },
  }).lean();
}

async function computeOccupancyFromInventory(
  listingId: Types.ObjectId,
  month: string
): Promise<{ occupancy: number; bookedDays: number; totalDays: number }> {
  // Build month window: month is "YYYY-MM-01" or similar
  const start = month.slice(0, 7) + "-01";
  const startDate = new Date(start);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const [invDocs, reservations] = await Promise.all([
    InventoryMaster.find({
      listingId,
      date: { $gte: start, $lt: end },
    }).lean() as any,
    Reservation.find({
      listingId,
      status: { $ne: "cancelled" },
      checkIn: { $lt: end },
      checkOut: { $gt: start },
    }).lean() as any,
  ]);

  // Prefer InventoryMaster if populated, else fall back to reservation date-set
  if (invDocs.length > 0) {
    const total = invDocs.length;
    const booked = invDocs.filter((d: any) => d.status === "booked").length;
    const blocked = invDocs.filter((d: any) => d.status === "blocked").length;
    const bookable = Math.max(total - blocked, 0);
    return {
      occupancy: bookable > 0 ? booked / bookable : 0,
      bookedDays: booked,
      totalDays: total,
    };
  }

  // Synthetic-calendar fallback: Set-based occupancy from reservation date ranges
  const bookedSet = new Set<string>();
  for (const r of reservations) {
    let cur = new Date(r.checkIn > start ? r.checkIn : start);
    const stop = new Date(r.checkOut < end ? r.checkOut : end);
    while (cur < stop) {
      bookedSet.add(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  return {
    occupancy: days > 0 ? bookedSet.size / days : 0,
    bookedDays: bookedSet.size,
    totalDays: days,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId") || "";
    let month = searchParams.get("month") || new Date().toISOString().slice(0, 10);
    if (month.length === 7) month = `${month}-01`;

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ source: "none", reason: "listingId required" });
    }

    await connectToDatabase();

    const listing = await Listing.findById(listingId).lean() as any;
    if (!listing) {
      return NextResponse.json({ source: "none", reason: "Listing not found" });
    }

    const area = listing.area || listing.city;
    const bedrooms = listing.bedroomsNumber || listing.bedrooms || 1;
    if (!area) {
      return NextResponse.json({ source: "none", reason: "Listing has no area" });
    }

    const orgId = listing.orgId as Types.ObjectId;
    const cacheKey = jobName(listingId);

    // Honor 4-hr cache. If stale, refresh SERP comps for this area+bedrooms.
    // Only mark the cache fresh when SERP actually returned data — if SERP
    // returns empty, leave the cache stale so the user's next refresh click
    // retries (otherwise an empty result would lock out retries for 4hrs).
    const fresh = await isCacheFresh(orgId, cacheKey);
    let compsCount = 0;

    console.log(`[market-overview] listingId=${listingId} area="${area}" bedrooms=${bedrooms} cacheFresh=${fresh}`);

    if (!fresh) {
      const newComps = await fetchSerpCompsForProperty(area, bedrooms);
      if (newComps.length > 0) {
        const r = await upsertSerpComps(area, bedrooms, newComps);
        compsCount = r.inserted + r.updated;
        await markCacheFresh(orgId, cacheKey, {
          recordsInserted: r.inserted,
          recordsUpdated: r.updated,
          sources: { SERP_Market_Overview: compsCount },
        });
        console.log(`[market-overview] Persisted ${r.inserted} new + ${r.updated} updated comps`);
      } else {
        console.log(`[market-overview] SERP returned no usable comps — leaving cache stale so next refresh retries`);
      }
    } else {
      console.log(`[market-overview] Skipping SERP call (cache fresh within 4hrs)`);
    }

    // Read whatever comps are now in DB
    const comps = await readSerpComps(area, bedrooms);

    if (comps.length === 0) {
      return NextResponse.json({
        source: "none",
        reason: fresh ? "Cached as empty (no SERP comps available)" : "SERP returned no comps",
      });
    }

    const rates = comps.map((c: any) => Number(c.ttmAvgRateNative)).filter((r: number) => r > 0);
    const adr = rates.length > 0
      ? Math.round(rates.reduce((a: number, b: number) => a + b, 0) / rates.length)
      : 0;

    const { occupancy } = await computeOccupancyFromInventory(new Types.ObjectId(listingId), month);
    const revpar = Math.round(adr * occupancy);

    return NextResponse.json({
      source: "serp",
      adr,
      revpar,
      occupancy,
      activeListings: comps.length,
      area,
      bedrooms,
      cached: fresh,
    });
  } catch (err: any) {
    console.error("[GET /api/agent-tools/market-overview]", err);
    return NextResponse.json({ source: "none", error: err.message });
  }
}
