import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { MarketEvent } from "@/lib/db/models/MarketEvent";
import { BenchmarkData } from "@/lib/db/models/BenchmarkData";
import { GuestSummary } from "@/lib/db/models/GuestSummary";
import { AirbticsCache } from "@/lib/db/models/airbtics_cache";
import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import { CompetitorPerformance } from "@/lib/db/models/competitor_performance";
import { Types } from "mongoose";

// ── Helpers ───────────────────────────────────────────────────────────────────

function oid(s: string): Types.ObjectId {
  return new Types.ObjectId(s);
}

async function resolveListing(orgId: string, listingId: string) {
  let listing: any = null;
  if (Types.ObjectId.isValid(listingId)) {
    listing = await Listing.findOne({
      _id: oid(listingId),
      orgId: oid(orgId),
    }).lean();
  }
  if (!listing) {
    listing = await Listing.findOne({
      hostawayId: listingId,
      orgId: oid(orgId),
    }).lean();
  }
  return listing;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const k = ((sorted.length - 1) * pct) / 100;
  const f = Math.floor(k);
  const c = Math.min(f + 1, sorted.length - 1);
  return Math.round((sorted[f] + (k - f) * (sorted[c] - sorted[f])) * 10) / 10;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const { path } = await props.params;
  // Strip leading "v1/" prefix if present (Lyzr may call /v1/get-property-profile)
  const parts = path.join("/").replace(/^v1\//, "");
  const { searchParams } = new URL(req.url);
  const sp = searchParams;

  console.log(`[agent-tools] /${parts} status=...`);

  await connectToDatabase();

  try {
    // ── GET /get-property-profile ─────────────────────────────────────────────
    if (parts === "get-property-profile" || parts === "property-profile") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const listing = await resolveListing(orgId, listingId);
      if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      return NextResponse.json({
        listingId: String(listing._id),
        name: listing.name,
        area: listing.area,
        city: listing.city,
        bedrooms: listing.bedroomsNumber,
        basePrice: Number(listing.price || 0),
        priceFloor: Number(listing.priceFloor || 0),
        priceCeiling: Number(listing.priceCeiling || 0),
        hostawayId: listing.hostawayId,
      });
    }

    // ── GET /get-property-calendar-metrics ────────────────────────────────────
    if (parts === "get-property-calendar-metrics" || parts === "calendar-metrics") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const listing = await resolveListing(orgId, listingId);
      if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

      const docs = await InventoryMaster.find({
        orgId: oid(orgId),
        listingId: listing._id,
        date: { $gte: dateFrom, $lte: dateTo },
      }).lean() as any[];

      const total = docs.length;
      const booked = docs.filter((d) => d.status === "booked").length;
      const blocked = docs.filter((d) => d.status === "blocked").length;
      const bookable = Math.max(total - blocked, 0);
      const prices = docs.filter((d) => d.currentPrice).map((d) => Number(d.currentPrice));
      return NextResponse.json({
        totalDays: total,
        bookedDays: booked,
        blockedDays: blocked,
        bookableDays: bookable,
        occupancyPct: bookable > 0 ? Math.round((booked / bookable) * 1000) / 10 : 0,
        avgNightlyRate: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 : 0,
        totalRevenue: Math.round(docs.filter((d) => d.status === "booked").reduce((s, d) => s + Number(d.currentPrice || 0), 0) * 100) / 100,
      });
    }

    // ── GET /get-property-reservations ────────────────────────────────────────
    if (parts === "get-property-reservations" || parts === "property-reservations") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const limit = parseInt(sp.get("limit") || "50");
      const listing = await resolveListing(orgId, listingId);
      if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

      const docs = await Reservation.find({
        orgId: oid(orgId),
        listingId: listing._id,
        checkIn: { $lte: dateTo },
        checkOut: { $gte: dateFrom },
      })
        .sort({ checkIn: 1 })
        .limit(limit)
        .lean() as any[];

      return NextResponse.json({
        count: docs.length,
        reservations: docs.map((r) => ({
          guestName: r.guestName,
          channel: r.channelName,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights,
          totalPrice: Number(r.totalPrice || 0),
          status: r.status,
        })),
      });
    }

    // ── GET /get-property-market-events ──────────────────────────────────────
    if (parts === "get-property-market-events" || parts === "market-events") {
      const orgId = sp.get("orgId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const docs = await MarketEvent.find({
        orgId: oid(orgId),
        isActive: true,
        endDate: { $gte: dateFrom },
        startDate: { $lte: dateTo },
      })
        .sort({ startDate: 1 })
        .lean() as any[];

      return NextResponse.json({
        count: docs.length,
        events: docs.map((e) => ({
          name: e.name,
          startDate: e.startDate,
          endDate: e.endDate,
          impactLevel: e.impactLevel,
          upliftPct: Number(e.upliftPct || 0),
          description: e.description,
          source: e.source,
        })),
      });
    }

    // ── GET /get-property-benchmark ───────────────────────────────────────────
    if (parts === "get-property-benchmark" || parts === "benchmark") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const bedrooms = parseInt(sp.get("bedrooms") || "1");
      const marketId = sp.get("marketId") || "2286";

      const listing = await resolveListing(orgId, listingId);
      if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

      // Try AirbticsCache first
      const cacheKey = `comp_listings:${marketId}:${bedrooms}br`;
      const now = new Date();
      const cache = await AirbticsCache.findOne({
        cacheKey,
        expiresAt: { $gt: now },
      }).lean() as any;

      if (cache?.data) {
        const d = cache.data;
        return NextResponse.json({
          source: "cache",
          cache_key: cacheKey,
          cache_available: true,
          compCount: d.compCount || 0,
          p25: d.p25Adr,
          p50: d.p50Adr,
          p75: d.p75Adr,
          p90: d.p90Adr,
          avgAdr: d.avgAdr,
          avgOccupancy: d.avgOccupancy,
          comps: (d.comps || []).slice(0, 15),
          verdict: null,
          recommendedWeekday: d.p50Adr ? Math.round(d.p50Adr * 0.97 * 100) / 100 : null,
          recommendedWeekend: d.p75Adr ? Math.round(d.p75Adr * 0.95 * 100) / 100 : null,
          recommendedEvent: d.p90Adr ? Math.round(d.p90Adr * 0.90 * 100) / 100 : null,
        });
      }

      // Fallback: BenchmarkData
      const b = await BenchmarkData.findOne({
        orgId: oid(orgId),
        listingId: listing._id,
      })
        .sort({ updatedAt: -1 })
        .lean() as any;

      if (b) {
        return NextResponse.json({
          source: "benchmark_data",
          cache_available: false,
          p25: b.p25Rate,
          p50: b.p50Rate,
          p75: b.p75Rate,
          verdict: b.verdict,
          comps: [],
        });
      }

      return NextResponse.json({ source: "none", cache_available: false, verdict: null, p25: null, p50: null, p75: null });
    }

    // ── GET /nearby-comps ─────────────────────────────────────────────────────
    if (parts === "nearby-comps") {
      const lat = parseFloat(sp.get("lat") || "0");
      const lon = parseFloat(sp.get("lon") || "0");
      const bedrooms = parseInt(sp.get("bedrooms") || "1");
      const radiusKm = parseFloat(sp.get("radiusKm") || "1.0");
      const marketId = sp.get("marketId") || "2286";
      const limit = parseInt(sp.get("limit") || "25");
      const dateFrom = sp.get("dateFrom") || "";
      let month = sp.get("month") || (dateFrom ? dateFrom.slice(0, 7) : new Date().toISOString().slice(0, 7));
      if (month.length === 7) month = `${month}-01`;

      const allListings = await CompetitorListing.find({ marketId, bedrooms }).lean() as any[];
      let nearby: Array<[any, number]> = allListings
        .map((cl) => [cl, haversineKm(lat, lon, cl.latitude, cl.longitude)] as [any, number])
        .filter(([, dist]) => dist <= radiusKm)
        .sort(([, a], [, b]) => a - b)
        .slice(0, limit);

      if (!nearby.length) {
        return NextResponse.json({
          comps: [],
          percentiles: { p25: 0, p50: 0, p75: 0, p90: 0 },
          summary: { count: 0, avg_occupancy: 0, avg_adr: 0 },
          radius_km: radiusKm,
          bedrooms,
          month,
        });
      }

      const listingIds = nearby.map(([cl]) => cl.airbticsListingId);
      const perfDocs = await CompetitorPerformance.find({
        marketId,
        date: month,
        airbticsListingId: { $in: listingIds },
      }).lean() as any[];

      const perfMap: Record<string, any> = {};
      perfDocs.forEach((p) => { perfMap[p.airbticsListingId] = p; });

      const comps: any[] = [];
      const adrs: number[] = [];
      const occupancies: number[] = [];

      for (const [cl, dist] of nearby) {
        const perf = perfMap[cl.airbticsListingId];
        const entry: any = {
          listing_name: cl.listingName,
          bedrooms: cl.bedrooms,
          distance_km: Math.round(dist * 1000) / 1000,
          rating: cl.ratingOverall,
          num_reviews: cl.numReviews,
          host_name: cl.hostName,
          latitude: cl.latitude,
          longitude: cl.longitude,
        };
        if (perf) {
          entry.occupancy = perf.occupancy;
          entry.native_rate_avg = perf.nativeRateAvg;
          entry.native_revenue = perf.nativeRevenue;
          entry.reserved_days = perf.reservedDays;
          entry.vacant_days = perf.vacantDays;
          entry.length_of_stay_avg = perf.lengthOfStayAvg;
          entry.data_type = perf.dataType;
          if (perf.nativeRateAvg > 0) adrs.push(perf.nativeRateAvg);
          if (perf.occupancy > 0) occupancies.push(perf.occupancy);
        }
        comps.push(entry);
      }

      const sorted = [...adrs].sort((a, b) => a - b);
      return NextResponse.json({
        comps,
        percentiles: {
          p25: percentile(sorted, 25),
          p50: percentile(sorted, 50),
          p75: percentile(sorted, 75),
          p90: percentile(sorted, 90),
        },
        summary: {
          count: comps.length,
          with_perf_data: adrs.length,
          avg_occupancy_pct: occupancies.length ? Math.round((occupancies.reduce((a, b) => a + b, 0) / occupancies.length) * 1000) / 10 : 0,
          avg_adr: adrs.length ? Math.round((adrs.reduce((a, b) => a + b, 0) / adrs.length) * 10) / 10 : 0,
        },
        radius_km: radiusKm,
        bedrooms,
        month,
      });
    }

    // ── GET /list-guest-conversations ─────────────────────────────────────────
    if (parts === "list-guest-conversations" || parts === "conversations") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const listing = await resolveListing(orgId, listingId);
      const listingOid = listing?._id;

      const query: any = { orgId: oid(orgId) };
      if (listingOid) query.listingId = listingOid;

      const docs = await HostawayConversation.find(query).lean() as any[];
      const seen: Record<string, any> = {};
      docs.forEach((c) => {
        if (!seen[c.hostawayConversationId]) seen[c.hostawayConversationId] = c;
      });

      const result = Object.values(seen).map((conv) => {
        const msgs = (conv.messages || []).sort((a: any, b: any) => (a.timestamp || "").localeCompare(b.timestamp || ""));
        const last = msgs[msgs.length - 1];
        return {
          conversationId: conv.hostawayConversationId,
          guestName: conv.guestName,
          lastMessage: last?.text || "No messages",
          status: last?.sender === "guest" ? "needs_reply" : "resolved",
          messages: msgs.map((m: any) => ({ sender: m.sender, text: m.text, timestamp: m.timestamp })),
        };
      });

      return NextResponse.json({ count: result.length, conversations: result });
    }

    // ── GET /get-guest-summary ────────────────────────────────────────────────
    if (parts === "get-guest-summary" || parts === "guest-summary") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const listing = await resolveListing(orgId, listingId);
      if (!listing) return NextResponse.json({ cached: false, stale: false, summary: null });

      const summary = await GuestSummary.findOne({
        orgId: oid(orgId),
        listingId: listing._id,
        dateFrom,
        dateTo,
      }).lean() as any;

      if (!summary) return NextResponse.json({ cached: false, stale: false, summary: null });

      const ageMs = Date.now() - new Date(summary.updatedAt).getTime();
      const stale = ageMs > 6 * 60 * 60 * 1000;
      return NextResponse.json({
        cached: !stale,
        stale,
        summary: {
          sentiment: summary.sentiment,
          themes: summary.themes,
          actionItems: summary.actionItems,
          bulletPoints: summary.bulletPoints,
          totalConversations: summary.totalConversations,
          needsReplyCount: summary.needsReplyCount,
        },
      });
    }

    // ── GET /listing-metadata ─────────────────────────────────────────────────
    if (parts === "listing-metadata") {
      const orgId = sp.get("orgId") || "";
      const listings = await Listing.find({ orgId: oid(orgId), isActive: true })
        .select("name area city")
        .lean() as any[];
      return NextResponse.json({
        count: listings.length,
        listings: listings.map((l) => ({
          listingId: String(l._id),
          name: l.name,
          area: l.area,
          city: l.city,
        })),
      });
    }

    // ── GET /get-agent-system-status ──────────────────────────────────────────
    if (parts === "get-agent-system-status") {
      return NextResponse.json({
        status: "operational",
        agents: [
          { name: "Portfolio Analyst", status: "active", version: "1.0.0" },
          { name: "CRO Router", status: "active", version: "1.0.0" }
        ],
        last_sync: new Date().toISOString()
      });
    }

    // ── GET /portfolio-overview ───────────────────────────────────────────────
    if (parts === "portfolio-overview" || parts === "get-portfolio-overview") {
      const orgId = sp.get("orgId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const orgOid = oid(orgId);

      const [listings, invDocs] = await Promise.all([
        Listing.find({ orgId: orgOid, isActive: true }).lean() as any,
        InventoryMaster.find({ orgId: orgOid, date: { $gte: dateFrom, $lte: dateTo } }).lean() as any,
      ]);

      const statMap: Record<string, any> = {};
      for (const doc of invDocs as any[]) {
        const lid = String(doc.listingId);
        const s = statMap[lid] || (statMap[lid] = { totalDays: 0, bookedDays: 0, blockedDays: 0, revenue: 0, prices: [] });
        s.totalDays++;
        if (doc.status === "booked") { s.bookedDays++; s.revenue += Number(doc.currentPrice || 0); }
        if (doc.status === "blocked") s.blockedDays++;
        if (doc.currentPrice) s.prices.push(Number(doc.currentPrice));
      }

      const properties = (listings as any[]).map((l) => {
        const s = statMap[String(l._id)] || {};
        const total = s.totalDays || 0;
        const blocked = s.blockedDays || 0;
        const booked = s.bookedDays || 0;
        const bookable = Math.max(total - blocked, 0);
        const occ = bookable > 0 ? Math.round((booked / bookable) * 100) : 0;
        const prices: number[] = s.prices || [];
        return {
          listingId: String(l._id),
          name: l.name,
          occupancyPct: occ,
          revenue: Math.round((s.revenue || 0) * 100) / 100,
          avgNightlyRate: prices.length ? Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length) : Number(l.price || 0),
        };
      });

      const totalRevenue = properties.reduce((s, p) => s + p.revenue, 0);
      const avgOcc = properties.length ? Math.round(properties.reduce((s, p) => s + p.occupancyPct, 0) / properties.length) : 0;
      const avgNightly = properties.length ? Math.round(properties.reduce((s, p) => s + p.avgNightlyRate, 0) / properties.length) : 0;

      return NextResponse.json({ totalProperties: properties.length, avgOccupancyPct: avgOcc, totalRevenue, avgNightlyRate: avgNightly, properties });
    }

    // ── Fallback: 404 ─────────────────────────────────────────────────────────
    console.warn(`[agent-tools] Unknown path: /${parts}`);
    return NextResponse.json({ error: `Unknown tool endpoint: /${parts}` }, { status: 404 });

  } catch (err: any) {
    console.error(`[agent-tools] /${parts} error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
