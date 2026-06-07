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
import { GuestThread } from "@/lib/db/models/guest_thread";
import { OpsTicket } from "@/lib/db/models/ops_ticket";
import { AgentCache, type AgentName } from "@/lib/db/models/agent_cache";
import { Types } from "mongoose";
import { newTraceId, logToolCall, logToolResponse } from "@/lib/utils/agent-logger";

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

  // ── Observability: correlate this tool call ────────────────────────────────
  const traceId = req.headers.get("x-trace-id") || newTraceId();
  const toolStartedAt = Date.now();
  try {
    logToolCall({
      traceId,
      tool: parts,
      method: "GET",
      path: `/api/agent-tools/v1/${parts}`,
      query: Object.fromEntries(sp.entries()),
    });
  } catch {
    /* logging must never break the request */
  }

  // Observe the response (status + body) without changing it, then return it.
  const observe = async (res: NextResponse): Promise<NextResponse> => {
    try {
      const data = await res.clone().json().catch(() => undefined);
      logToolResponse({
        traceId,
        tool: parts,
        status: res.status,
        durationMs: Date.now() - toolStartedAt,
        data,
      });
    } catch {
      /* swallow */
    }
    return res;
  };

  await connectToDatabase();

  // Original handler body preserved verbatim inside handleGet(); we only observe
  // its returned response so logging stays additive.
  const handleGet = async (): Promise<NextResponse> => {
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

      const invTotal = docs.length;
      const invBooked = docs.filter((d) => d.status === "booked").length;
      const blocked = docs.filter((d) => d.status === "blocked").length;
      const prices = docs.filter((d) => d.currentPrice).map((d) => Number(d.currentPrice));

      // InventoryMaster (the Hostaway calendar mirror) is frequently un-synced for a
      // listing, leaving 0 rows or 0 booked days even when reservations exist. Mirror
      // the UI endpoint (/api/calendar-metrics): derive booked nights from the
      // Reservation collection so the agent sees the SAME occupancy the dashboard
      // shows. We take max(inventory, reservation-derived) so a partially-synced
      // calendar still wins when it has more data.
      const windowStart = new Date(dateFrom);
      const windowEnd = new Date(dateTo);
      const windowDays = Math.max(
        1,
        Math.round((windowEnd.getTime() - windowStart.getTime()) / 86400000) + 1
      );

      const resv = await Reservation.find({
        orgId: oid(orgId),
        listingId: listing._id,
        status: { $ne: "cancelled" },
        checkIn: { $lte: dateTo },
        checkOut: { $gte: dateFrom },
      }).lean() as any[];

      // Unique booked nights within [dateFrom, dateTo] (checkOut is exclusive).
      const bookedNights = new Set<string>();
      let resRevenue = 0;
      for (const r of resv) {
        const ci = r.checkIn > dateFrom ? r.checkIn : dateFrom;
        const co = r.checkOut < dateTo ? r.checkOut : dateTo;
        let cur = new Date(ci);
        const end = new Date(co);
        let nightsInWindow = 0;
        while (cur < end) {
          bookedNights.add(cur.toISOString().split("T")[0]);
          nightsInWindow++;
          cur = new Date(cur.getTime() + 86400000);
        }
        // Pro-rate reservation revenue to the nights that fall inside the window.
        const totalNights = Number(r.nights) || 0;
        const price = Number(r.totalPrice ?? r.price ?? 0);
        if (totalNights > 0 && nightsInWindow > 0) {
          resRevenue += (price / totalNights) * nightsInWindow;
        } else if (nightsInWindow > 0) {
          resRevenue += price;
        }
      }

      const resBooked = bookedNights.size;
      const total = invTotal > 0 ? invTotal : windowDays;
      const booked = Math.max(invBooked, resBooked);
      const bookable = Math.max(total - blocked, 0);

      const invRevenue = docs
        .filter((d) => d.status === "booked")
        .reduce((s, d) => s + Number(d.currentPrice || 0), 0);
      const totalRevenue = Math.max(invRevenue, resRevenue);

      // ADR: prefer inventory prices; fall back to reservation-derived ADR.
      const invAdr = prices.length
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : 0;
      const resAdr = resBooked > 0 ? resRevenue / resBooked : 0;
      const avgNightlyRate = invAdr > 0 ? invAdr : resAdr;

      return NextResponse.json({
        totalDays: total,
        bookedDays: booked,
        blockedDays: blocked,
        bookableDays: bookable,
        occupancyPct: bookable > 0 ? Math.round((booked / bookable) * 1000) / 10 : 0,
        avgNightlyRate: Math.round(avgNightlyRate * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        // Transparency for the agent + debugging: where each number came from.
        source: invBooked > 0 ? "inventory" : (resBooked > 0 ? "reservations" : "empty"),
        reservationsConsidered: resv.length,
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

    // ── GET /get-property-data ────────────────────────────────────────────────
    // Maya calls this when a guest asks about amenities, house rules, pool/gym/parking,
    // pet policy, etc. The Listing model only stores `amenities` today; everything else
    // is returned as null with a note so the agent knows not to invent answers.
    if (parts === "get-property-data" || parts === "property-data") {
      const listingId = sp.get("listingId") || "";
      const field = sp.get("field") || "all";

      if (!listingId || !Types.ObjectId.isValid(listingId)) {
        return NextResponse.json({
          status: "error",
          error: { code: "VALIDATION_ERROR", message: "Valid listingId required" },
        }, { status: 400 });
      }

      const listing = await Listing.findById(oid(listingId)).lean() as any;
      if (!listing) {
        return NextResponse.json({
          status: "error",
          error: { code: "NOT_FOUND", message: "Listing not found" },
        }, { status: 404 });
      }

      const buildField = (f: string): { field: string; value: any; note?: string } => {
        switch (f) {
          case "amenities":
            return { field: "amenities", value: listing.amenities || [] };
          case "house_rules":
          case "pool_info":
          case "gym_info":
          case "parking_info":
          case "pet_policy":
          case "noise_policy":
          case "checkout_procedure":
          case "wifi_info":
            return {
              field: f,
              value: null,
              note: `'${f}' is not configured on this listing. Ask the property manager to add it.`,
            };
          default:
            return { field: f, value: null, note: `Unknown field '${f}'` };
        }
      };

      if (field === "all") {
        return NextResponse.json({
          status: "success",
          data: {
            field: "all",
            value: {
              amenities: listing.amenities || [],
              house_rules: null,
              pool_info: null,
              gym_info: null,
              parking_info: null,
              pet_policy: null,
              noise_policy: null,
              checkout_procedure: null,
              wifi_info: null,
            },
            note: "Only 'amenities' is configured. Other fields are not yet stored on this listing.",
          },
          metadata: {
            requestId: `req_${Date.now().toString(36)}`,
            timestamp: new Date().toISOString(),
          },
        });
      }

      const result = buildField(field);
      return NextResponse.json({
        status: "success",
        data: result,
        metadata: {
          requestId: `req_${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // ── GET /read-thread ──────────────────────────────────────────────────────
    // Maya (Guest Reply Agent) calls this first to fetch full thread context.
    // Joins GuestThread → Listing → Reservation and returns the envelope shape
    // defined in guest-reply-tools.json (ReadThreadResponse / ThreadData).
    if (parts === "read-thread") {
      const threadId = sp.get("threadId") || "";

      if (!threadId || threadId === "session_context" || threadId === "{{thread_id}}" || threadId === "string") {
        return NextResponse.json({
          status: "error",
          error: "Missing or unresolved threadId. The agent must pass the literal thread_id value from the prompt, not the placeholder string.",
        }, { status: 400 });
      }

      // Accept either a GuestThread ObjectId or a Hostaway conversationId.
      // Webhook stores Hostaway conv ID in GuestThread.reservationId, so we
      // fall back to that lookup when the value is not a valid ObjectId.
      let thread: any = null;
      if (Types.ObjectId.isValid(threadId)) {
        thread = await GuestThread.findById(oid(threadId)).lean();
      }
      if (!thread) {
        thread = await GuestThread.findOne({ reservationId: String(threadId) })
          .sort({ lastActivityAt: -1 })
          .lean();
      }
      if (!thread) {
        return NextResponse.json({
          status: "error",
          error: `Thread not found for id '${threadId}'. Pass either the GuestThread _id or the Hostaway conversationId.`,
        }, { status: 404 });
      }

      const [listing, reservation, conversation] = await Promise.all([
        thread.listingId ? Listing.findById(thread.listingId).lean() as Promise<any> : Promise.resolve(null),
        thread.reservationId
          ? Reservation.findOne({
              $or: [
                { hostawayReservationId: thread.reservationId },
                ...(Types.ObjectId.isValid(thread.reservationId) ? [{ _id: oid(thread.reservationId) }] : []),
              ],
            }).lean() as Promise<any>
          : Promise.resolve(null),
        thread.reservationId
          ? HostawayConversation.findOne({ hostawayConversationId: thread.reservationId }).lean() as Promise<any>
          : Promise.resolve(null),
      ]);

      // Channel-state mapping: GuestThread.commsState (active|paused|syncing|disabled)
      // → ReadThread.commsState (active|paused|blocked).
      const commsStateMap: Record<string, "active" | "paused" | "blocked"> = {
        active: "active",
        paused: "paused",
        syncing: "paused",
        disabled: "blocked",
      };
      const commsState = commsStateMap[thread.commsState] || "active";

      // Merge messages from both GuestThread and HostawayConversation, sorted oldest → newest.
      const threadMsgs = (thread.messages || []).map((m: any) => ({
        direction: m.direction,
        content: m.content,
        sender: m.direction === "inbound" ? "guest" : "host",
        handledBy: m.handledBy === "reservation_agent" ? "ai" : m.handledBy === "system" ? "ai" : m.handledBy,
        createdAt: m.createdAt,
      }));
      const convMsgs = ((conversation?.messages as any[]) || []).map((m) => ({
        direction: m.sender === "guest" ? "inbound" : "outbound",
        content: m.text,
        sender: m.sender,
        handledBy: "human",
        createdAt: m.timestamp,
      }));
      const allMsgs = [...threadMsgs, ...convMsgs]
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        .slice(-10);

      return NextResponse.json({
        status: "success",
        data: {
          threadId: String(thread._id),
          commsState,
          hostawayConversationId: thread.reservationId || null,
          guestName: conversation?.guestName || reservation?.guestName || "Guest",
          channel: thread.channel || conversation?.channelName || "hostaway",
          reservation: reservation ? {
            reservationId: String(reservation._id),
            checkIn: reservation.checkIn,
            checkOut: reservation.checkOut,
            nights: reservation.nights,
            totalPrice: Number(reservation.totalPrice || 0),
            status: reservation.status,
          } : null,
          property: listing ? {
            listingId: String(listing._id),
            name: listing.name,
            area: listing.area,
            address: listing.address || null,
          } : null,
          // Access codes are not stored on the Listing model yet — return null so
          // the agent knows it cannot send these and must ask the PM to configure them.
          accessCodes: {
            doorCode: null,
            buildingCode: null,
            wifiName: null,
            wifiPassword: null,
            parkingSpace: null,
            additionalInstructions: null,
          },
          houseRules: null,
          messages: allMsgs,
        },
        metadata: {
          source: "guest_thread",
          fetchedAt: new Date().toISOString(),
        },
      });
    }

    // ── Aria Concierge cached-data tools ──────────────────────────────────────
    //
    // These six endpoints serve pre-computed analyst outputs from the AgentCache
    // collection. They are dumb DB lookups — no LLM calls, no external APIs. The
    // Aria Concierge agent (Lyzr ID 6a09d9428e3a6bafa13d8284) calls these to
    // answer property-manager questions without re-running the five worker agents.
    //
    // All six take: orgId, listingId, dateFrom, dateTo.
    // Cache TTL: 4 hours (enforced via expiresAt TTL index on the collection).

    const ARIA_AGENT_TOOLS: Record<string, AgentName> = {
      "get-property-analysis": "property",
      "get-booking-intelligence": "booking",
      "get-market-research": "market_research",
      "get-price-guard-report": "price_guard",
      "get-anomaly-report": "anomaly",
    };

    // ── GET /get-cache-status ─────────────────────────────────────────────────
    if (parts === "get-cache-status") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";

      if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(listingId)) {
        return NextResponse.json({
          status: "error",
          error: { code: "VALIDATION_ERROR", message: "Valid orgId and listingId required" },
        }, { status: 400 });
      }

      const rows = await AgentCache.find({
        orgId: oid(orgId),
        listingId: oid(listingId),
        dateFrom,
        dateTo,
      }).lean() as any[];

      const now = Date.now();
      const fourHrsMs = 4 * 60 * 60 * 1000;
      const allAgents: AgentName[] = ["property", "booking", "market_research", "price_guard", "anomaly"];

      const perAgent = allAgents.map((a) => {
        const row = rows.find((r: any) => r.agentName === a);
        if (!row) return { agent: a, available: false, status: "missing", ageMinutes: null };
        const ageMs = now - new Date(row.computedAt).getTime();
        const ageMinutes = Math.round(ageMs / 60000);
        const stale = ageMs > fourHrsMs;
        return {
          agent: a,
          available: row.status === "complete",
          status: row.status === "failed" ? "failed" : stale ? "stale" : "fresh",
          ageMinutes,
        };
      });

      const freshCount = perAgent.filter((p) => p.status === "fresh").length;
      const cacheState = freshCount === 5 ? "warm" : freshCount === 0 ? "cold" : "partial";

      return NextResponse.json({
        status: "success",
        data: {
          cache_state: cacheState,
          listing_id: listingId,
          date_from: dateFrom,
          date_to: dateTo,
          agents: perAgent,
          fresh_count: freshCount,
        },
        metadata: {
          requestId: `req_${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // ── GET /get-{agent}-{report} — five readers, identical shape ────────────
    if (parts in ARIA_AGENT_TOOLS) {
      const agentName = ARIA_AGENT_TOOLS[parts];
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";

      if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(listingId)) {
        return NextResponse.json({
          status: "error",
          error: { code: "VALIDATION_ERROR", message: "Valid orgId and listingId required" },
        }, { status: 400 });
      }

      const row = await AgentCache.findOne({
        orgId: oid(orgId),
        listingId: oid(listingId),
        dateFrom,
        dateTo,
        agentName,
      }).lean() as any;

      if (!row) {
        return NextResponse.json({
          status: "error",
          error: {
            code: "CACHE_MISS",
            message: `No cached '${agentName}' report for this listing/window. Click 'Refresh Intelligence' to warm the cache.`,
          },
        }, { status: 404 });
      }

      if (row.status === "failed") {
        return NextResponse.json({
          status: "error",
          error: {
            code: "AGENT_FAILED",
            message: row.errorMessage || `'${agentName}' agent failed during precompute.`,
          },
        }, { status: 422 });
      }

      const ageMs = Date.now() - new Date(row.computedAt).getTime();
      const ageMinutes = Math.round(ageMs / 60000);

      return NextResponse.json({
        status: "success",
        data: row.output,
        metadata: {
          requestId: `req_${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          computed_at: row.computedAt,
          age_minutes: ageMinutes,
          cache_state: ageMs > 4 * 60 * 60 * 1000 ? "stale" : "fresh",
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // v3 service tools — served from existing Mongo data (real) or safe stubs.
    // Market Research + Anomaly Detector call these. Params come from session
    // context (orgId, listingId, dateFrom, dateTo) exactly like the PMS tools.
    // ════════════════════════════════════════════════════════════════════════

    // ── comps_get_state → reuse comp benchmark data (AirbticsCache → BenchmarkData)
    if (parts === "comps_get_state") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const bedrooms = parseInt(sp.get("bedrooms") || "1");
      const marketId = sp.get("marketId") || "2286";
      const listing = await resolveListing(orgId, listingId);
      const cacheKey = `comp_listings:${marketId}:${bedrooms}br`;
      const cache = await AirbticsCache.findOne({ cacheKey, expiresAt: { $gt: new Date() } }).lean() as any;
      if (cache?.data) {
        const d = cache.data;
        return NextResponse.json({
          source: "airbtics_cache", comp_set_size: d.compCount || (d.comps?.length ?? 0),
          median: d.p50Adr, p25: d.p25Adr, p75: d.p75Adr,
          wow_change_pct: 0, movers: [], by_target_date: [], comps: (d.comps || []).slice(0, 15),
        });
      }
      const b = listing ? await BenchmarkData.findOne({ orgId: oid(orgId), listingId: listing._id }).sort({ updatedAt: -1 }).lean() as any : null;
      if (b) return NextResponse.json({ source: "benchmark_data", median: b.p50Rate, p25: b.p25Rate, p75: b.p75Rate, wow_change_pct: 0, movers: [], by_target_date: [], comps: [] });
      return NextResponse.json({ source: "none", median: null, p25: null, p75: null, wow_change_pct: 0, movers: [], by_target_date: [], comps: [], note: "No comp data cached. Run 'Run Aria' / comp sync to populate." });
    }

    // ── events_get_validated → reuse MarketEvent data
    if (parts === "events_get_validated") {
      const orgId = sp.get("orgId") || "";
      const dateFrom = sp.get("dateFrom") || "";
      const dateTo = sp.get("dateTo") || "";
      const minConfidence = parseFloat(sp.get("min_confidence") || "0.6");
      const docs = await MarketEvent.find({ orgId: oid(orgId), isActive: true, endDate: { $gte: dateFrom }, startDate: { $lte: dateTo } }).sort({ startDate: 1 }).lean() as any[];
      const events = docs.map((e) => ({
        name: e.name, date: e.startDate, end_date: e.endDate,
        confidence: typeof e.confidence === "number" ? e.confidence : 0.7,
        expected_premium_band: e.upliftPct ? `${Math.round(Number(e.upliftPct))}%` : null,
        impact: e.impactLevel, source: e.source,
      })).filter((e) => e.confidence >= minConfidence);
      return NextResponse.json({ count: events.length, min_confidence: minConfidence, events });
    }

    // ── guest_signals_get_summary → reuse GuestSummary data
    if (parts === "guest_signals_get_summary") {
      const orgId = sp.get("orgId") || "";
      const listingId = sp.get("listingId") || "";
      const listing = await resolveListing(orgId, listingId);
      const summary = listing ? await GuestSummary.findOne({ orgId: oid(orgId), listingId: listing._id }).sort({ updatedAt: -1 }).lean() as any : null;
      if (!summary) return NextResponse.json({ sentiment_score: null, complaint_categories: {}, recurring_themes: [], positive_themes: [], thread_count: 0, source: "none" });
      return NextResponse.json({
        sentiment_score: summary.sentiment ?? null,
        complaint_categories: {},
        recurring_themes: summary.themes || [],
        positive_themes: [],
        thread_count: summary.totalConversations || 0,
        source: "guest_summary",
      });
    }

    // ── regime_classify → neutral stub (no regime model deployed yet)
    if (parts === "regime_classify") {
      return NextResponse.json({
        city: sp.get("city") || "dubai", regime_score: 0.0, regime_label: "calm",
        trend: "stable", confidence: 0.5, per_source_market: {}, feature_contributions: [],
        note: "stub: no regime classifier deployed — neutral default so pricing is not distorted",
      });
    }

    // ── source_market_get_modifier → neutral stub (no segment model deployed yet)
    if (parts === "source_market_get_modifier") {
      return NextResponse.json({ modifier: 1.0, breakdown: [], note: "stub: no source-market model deployed — neutral 1.0 modifier" });
    }

    // ── elasticity_predict / exploration_select → stub (PriceGuard runs on v2 for now)
    if (parts === "elasticity_predict") {
      return NextResponse.json({ predictions: [], model_version: "none", note: "stub: elasticity model not deployed. PriceGuard runs on the v2 guardrail agent for now." });
    }
    if (parts === "exploration_select") {
      return NextResponse.json({ is_exploration: false, chosen_price: null, note: "stub: no exploration policy deployed" });
    }

    // ── audit_log_decision → lightweight stub: accept and return an id
    if (parts === "audit_log_decision") {
      const id = `dec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      return NextResponse.json({ status: "logged", audit_decision_id: id });
    }

    // ── Fallback: 404 ─────────────────────────────────────────────────────────
    console.warn(`[agent-tools] Unknown path: /${parts}`);
    return NextResponse.json({ error: `Unknown tool endpoint: /${parts}` }, { status: 404 });

  } catch (err: any) {
    console.error(`[agent-tools] /${parts} error:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
  };

  return observe(await handleGet());
}

// ── POST handlers for Guest Reply agent write operations ───────────────────────

async function resolveThreadByAnyId(idOrConvId: string): Promise<any | null> {
  if (!idOrConvId || idOrConvId === "session_context" || idOrConvId === "{{thread_id}}" || idOrConvId === "string") {
    return null;
  }
  let thread: any = null;
  if (Types.ObjectId.isValid(idOrConvId)) {
    thread = await GuestThread.findById(oid(idOrConvId)).lean();
  }
  if (!thread) {
    thread = await GuestThread.findOne({ reservationId: String(idOrConvId) })
      .sort({ lastActivityAt: -1 })
      .lean();
  }
  return thread;
}

function envelope(data: any) {
  return {
    status: "success",
    data,
    metadata: {
      requestId: `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    },
  };
}

function errorEnvelope(code: string, message: string) {
  return { status: "error", error: { code, message } };
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const { path } = await props.params;
  const parts = path.join("/").replace(/^v1\//, "");

  console.log(`[agent-tools POST] /${parts}`);

  // ── Observability: correlate this tool call ────────────────────────────────
  const traceId = req.headers.get("x-trace-id") || newTraceId();
  const toolStartedAt = Date.now();

  const observe = async (res: NextResponse): Promise<NextResponse> => {
    try {
      const data = await res.clone().json().catch(() => undefined);
      logToolResponse({
        traceId,
        tool: parts,
        status: res.status,
        durationMs: Date.now() - toolStartedAt,
        data,
      });
    } catch {
      /* swallow */
    }
    return res;
  };

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return observe(NextResponse.json(errorEnvelope("VALIDATION_ERROR", "Request body must be JSON"), { status: 400 }));
  }

  try {
    logToolCall({
      traceId,
      tool: parts,
      method: "POST",
      path: `/api/agent-tools/v1/${parts}`,
      body,
    });
  } catch {
    /* logging must never break the request */
  }

  await connectToDatabase();

  // Original handler body preserved verbatim inside handlePost(); we only observe
  // its returned response so logging stays additive.
  const handlePost = async (): Promise<NextResponse> => {
  try {
    // ── POST /send-guest-message ──────────────────────────────────────────────
    if (parts === "send-guest-message") {
      const { threadId, message } = body;
      if (!threadId || !message) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "threadId and message are required"), { status: 400 });
      }
      const thread = await resolveThreadByAnyId(String(threadId));
      if (!thread) {
        return NextResponse.json(errorEnvelope("NOT_FOUND", `Thread '${threadId}' not found`), { status: 404 });
      }
      if (thread.commsState === "paused" || thread.commsState === "disabled") {
        return NextResponse.json(errorEnvelope("COMMS_PAUSED", "Comms paused by manager — draft only, do not send."), { status: 422 });
      }

      const newMsg = {
        messageId: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        direction: "outbound" as const,
        content: String(message),
        handledBy: "reservation_agent" as const,
        discloseAi: true,
        status: "sent" as const,
        createdAt: new Date(),
        sentAt: new Date(),
      };
      await GuestThread.updateOne(
        { _id: thread._id },
        { $push: { messages: newMsg }, $set: { lastActivityAt: new Date() } }
      );

      return NextResponse.json(envelope({
        sent: true,
        hostawayMessageId: null,
        deliveredAt: new Date().toISOString(),
      }));
    }

    // ── POST /create-ops-ticket ───────────────────────────────────────────────
    if (parts === "create-ops-ticket") {
      const { listingId, category, description, priority, threadId } = body;
      if (!listingId || !category || !description || !priority) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "listingId, category, description, priority are required"), { status: 400 });
      }
      if (!Types.ObjectId.isValid(listingId)) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "Invalid listingId format"), { status: 400 });
      }
      const listing = await Listing.findById(oid(listingId)).lean() as any;
      if (!listing) {
        return NextResponse.json(errorEnvelope("NOT_FOUND", "Listing not found"), { status: 404 });
      }

      // Map OpenAPI priority → schema severity (different enum names)
      const severityMap: Record<string, "critical" | "high" | "medium" | "low"> = {
        urgent: "critical",
        high: "high",
        medium: "medium",
        low: "low",
      };
      const severity = severityMap[String(priority)] || "medium";
      const slaHours = severity === "critical" ? 2 : severity === "high" ? 8 : severity === "medium" ? 24 : 72;

      // Map OpenAPI category → schema category
      const categoryMap: Record<string, "maintenance" | "housekeeping" | "access" | "noise" | "amenity_fault" | "other"> = {
        maintenance: "maintenance",
        cleaning: "housekeeping",
        appliance: "amenity_fault",
        plumbing: "maintenance",
        electrical: "maintenance",
        other: "other",
      };
      const mappedCategory = categoryMap[String(category)] || "other";

      const ticket = await OpsTicket.create({
        orgId: listing.orgId,
        listingId: listing._id,
        threadId: threadId ? String(threadId) : undefined,
        category: mappedCategory,
        description: String(description),
        severity,
        slaHours,
        status: "open",
        createdBy: "reservation_agent",
      });

      // Link back to thread if provided
      if (threadId) {
        const thread = await resolveThreadByAnyId(String(threadId));
        if (thread) {
          await GuestThread.updateOne(
            { _id: thread._id },
            { $push: { linkedTicketIds: String(ticket._id) }, $set: { lastActivityAt: new Date() } }
          );
        }
      }

      return NextResponse.json(envelope({
        ticketId: String(ticket._id),
        priority,
        estimatedResponseMinutes: slaHours * 60,
      }));
    }

    // ── POST /escalate-thread ─────────────────────────────────────────────────
    if (parts === "escalate-thread") {
      const { threadId, reason, notes } = body;
      if (!threadId || !reason) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "threadId and reason are required"), { status: 400 });
      }
      const thread = await resolveThreadByAnyId(String(threadId));
      if (!thread) {
        return NextResponse.json(errorEnvelope("NOT_FOUND", `Thread '${threadId}' not found`), { status: 404 });
      }

      const holdingMsg = {
        messageId: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        direction: "outbound" as const,
        content: "Thank you for reaching out. A member of our team will follow up with you personally as soon as possible.",
        handledBy: "reservation_agent" as const,
        discloseAi: true,
        status: "sent" as const,
        createdAt: new Date(),
        sentAt: new Date(),
      };

      await GuestThread.updateOne(
        { _id: thread._id },
        {
          $set: {
            status: "urgent",
            commsState: "paused",
            assignedTo: "manager_queue",
            lastActivityAt: new Date(),
            closureReason: notes ? `${reason}: ${notes}` : reason,
          },
          $push: { messages: holdingMsg },
        }
      );

      return NextResponse.json(envelope({
        escalated: true,
        managerNotified: true,
        holdingMessageSent: true,
      }));
    }

    // ── POST /send-access-details ─────────────────────────────────────────────
    if (parts === "send-access-details") {
      const { threadId } = body;
      if (!threadId) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "threadId is required"), { status: 400 });
      }
      const thread = await resolveThreadByAnyId(String(threadId));
      if (!thread) {
        return NextResponse.json(errorEnvelope("NOT_FOUND", `Thread '${threadId}' not found`), { status: 404 });
      }
      if (thread.commsState === "paused" || thread.commsState === "disabled") {
        return NextResponse.json(errorEnvelope("COMMS_PAUSED", "Comms paused — cannot send access details"), { status: 422 });
      }

      // Access codes aren't stored on the Listing model yet — surface that gap
      // explicitly rather than inventing values.
      return NextResponse.json(envelope({
        sent: false,
        fieldsIncluded: [],
        note: "Access codes are not configured for this listing. Ask the property manager to add doorCode/wifiName/wifiPassword to the listing record.",
      }));
    }

    // ── POST /send-upsell-offer ───────────────────────────────────────────────
    if (parts === "send-upsell-offer") {
      const { threadId, offerType } = body;
      if (!threadId || !offerType) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", "threadId and offerType are required"), { status: 400 });
      }
      const thread = await resolveThreadByAnyId(String(threadId));
      if (!thread) {
        return NextResponse.json(errorEnvelope("NOT_FOUND", `Thread '${threadId}' not found`), { status: 404 });
      }
      if (thread.commsState === "paused" || thread.commsState === "disabled") {
        return NextResponse.json(errorEnvelope("COMMS_PAUSED", "Comms paused — cannot send upsell"), { status: 422 });
      }

      const offers: Record<string, { text: string; price: number }> = {
        early_check_in: { text: "We can offer early check-in at 1:30 PM for AED 150. Would you like to confirm?", price: 150 },
        late_check_out: { text: "Late check-out until 2 PM is available for AED 200. Want me to book it?", price: 200 },
        extension: { text: "I'd be happy to check availability for extending your stay. Which dates were you thinking?", price: 0 },
      };
      const offer = offers[String(offerType)];
      if (!offer) {
        return NextResponse.json(errorEnvelope("VALIDATION_ERROR", `Unknown offerType '${offerType}'`), { status: 400 });
      }

      const newMsg = {
        messageId: `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        direction: "outbound" as const,
        content: offer.text,
        handledBy: "reservation_agent" as const,
        discloseAi: true,
        status: "sent" as const,
        createdAt: new Date(),
        sentAt: new Date(),
      };
      await GuestThread.updateOne(
        { _id: thread._id },
        { $push: { messages: newMsg }, $set: { lastActivityAt: new Date() } }
      );

      return NextResponse.json(envelope({
        offerSent: true,
        offerType: String(offerType),
        priceQuoted: offer.price || null,
        availability: true,
      }));
    }

    console.warn(`[agent-tools POST] Unknown path: /${parts}`);
    return NextResponse.json(errorEnvelope("NOT_FOUND", `Unknown tool endpoint: /${parts}`), { status: 404 });
  } catch (err: any) {
    console.error(`[agent-tools POST] /${parts} error:`, err);
    return NextResponse.json(errorEnvelope("INTERNAL_ERROR", err.message || "Server error"), { status: 500 });
  }
  };

  return observe(await handlePost());
}
