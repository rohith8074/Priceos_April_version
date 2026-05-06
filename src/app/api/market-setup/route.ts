import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, MarketEvent, BenchmarkData, InventoryMaster } from "@/lib/db/models";
import { callLyzrAgent, extractJson } from "@/lib/lyzr/client";
import { Types } from "mongoose";

const MARKETING_AGENT_ID = process.env.Marketing_Agent_ID || "699993adb8bd4d3aac102a81";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function buildMarketingPrompt(
  propertyName: string,
  area: string,
  bedrooms: number,
  basePrice: number,
  priceFloor: number,
  priceCeiling: number,
  from: string,
  to: string
): string {
  return `You are a Dubai short-term rental market research agent. Provide market intelligence for the property below.

PROPERTY:
- Name: ${propertyName}
- Area: ${area}, Dubai
- Bedrooms: ${bedrooms}
- Current Nightly Rate: AED ${basePrice}
- Price Floor: AED ${priceFloor}
- Price Ceiling: AED ${priceCeiling}
- Analysis Window: ${from} to ${to}

Return ONLY a valid JSON object — no markdown, no explanation, just raw JSON — with this exact structure:

{
  "events": [
    {
      "name": "Event name",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "impactLevel": "high",
      "upliftPct": 20,
      "description": "Why this affects demand",
      "area": "${area}"
    }
  ],
  "benchmark": {
    "p25Rate": 0,
    "p50Rate": 0,
    "p75Rate": 0,
    "p90Rate": 0,
    "avgWeekday": 0,
    "avgWeekend": 0,
    "recommendedWeekday": 0,
    "recommendedWeekend": 0,
    "recommendedEvent": 0,
    "rateTrend": "rising",
    "trendPct": 0,
    "verdict": "FAIR",
    "percentile": 50,
    "reasoning": "Brief market positioning note",
    "comps": [
      {
        "name": "Comparable property name near ${area}",
        "source": "Airbnb",
        "rating": 4.8,
        "reviews": 30,
        "avgRate": 0
      }
    ]
  }
}

Rules:
1. Fill ALL numeric fields with real AED values for a ${bedrooms}BR in ${area} for ${from} to ${to}
2. Provide 2-5 real upcoming Dubai events or holidays in the date range
3. Provide 3 real comparable ${bedrooms}BR properties in ${area} or nearby
4. verdict must be one of: UNDERPRICED, FAIR, SLIGHTLY_ABOVE, OVERPRICED
5. rateTrend must be one of: rising, stable, falling
6. impactLevel must be one of: high, medium, low`;
}

function syntheticBenchmark(
  listingId: Types.ObjectId,
  orgId: Types.ObjectId,
  basePrice: number,
  from: string,
  to: string
): any {
  const p50 = Math.round(basePrice * 1.0);
  return {
    orgId,
    listingId,
    dateFrom: from,
    dateTo: to,
    p25Rate: Math.round(basePrice * 0.8),
    p50Rate: p50,
    p75Rate: Math.round(basePrice * 1.2),
    p90Rate: Math.round(basePrice * 1.4),
    avgWeekday: Math.round(basePrice * 0.95),
    avgWeekend: Math.round(basePrice * 1.15),
    yourPrice: basePrice,
    percentile: 50,
    verdict: "FAIR",
    rateTrend: "rising",
    trendPct: 4.2,
    recommendedWeekday: Math.round(basePrice),
    recommendedWeekend: Math.round(basePrice * 1.1),
    recommendedEvent: Math.round(basePrice * 1.5),
    reasoning: "Synthetic benchmark — run Aria to fetch live market data.",
    comps: [],
  };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json();
    const { dateRange, context, orgId } = body as {
      dateRange?: { from?: string; to?: string };
      context?: { type?: string; propertyId?: string; propertyName?: string };
      orgId?: string;
    };

    const from = dateRange?.from || new Date().toISOString().split("T")[0];
    const to = dateRange?.to || from;
    const propertyId = context?.propertyId;

    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }
    if (!propertyId || !Types.ObjectId.isValid(propertyId)) {
      return NextResponse.json({ error: "propertyId required" }, { status: 400 });
    }

    await connectToDatabase();

    const orgOid = new Types.ObjectId(orgId);
    const listingOid = new Types.ObjectId(propertyId);

    // Load listing details
    const listing = await Listing.findOne({ _id: listingOid, orgId: orgOid }).lean() as any;
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const area = listing.area || "Dubai Marina";
    const bedrooms = listing.bedroomsNumber ?? listing.bedrooms ?? 1;
    const basePrice = Number(listing.basePrice ?? listing.price ?? 500);
    const priceFloor = Number(listing.priceFloor ?? Math.round(basePrice * 0.7));
    const priceCeiling = Number(listing.priceCeiling ?? Math.round(basePrice * 2));
    const propertyName = listing.name || context?.propertyName || "Property";

    // ── Cache check: skip agent call if fresh BenchmarkData exists ───────────
    const existing = await BenchmarkData.findOne({
      listingId: listingOid,
      dateFrom: { $lte: to },
      dateTo: { $gte: from },
    }).sort({ updatedAt: -1 }).lean() as any;

    if (existing && existing.updatedAt && Date.now() - new Date(existing.updatedAt).getTime() < CACHE_MAX_AGE_MS) {
      const existingEvents = await MarketEvent.countDocuments({
        orgId: orgOid,
        isActive: true,
        startDate: { $lte: to },
        endDate: { $gte: from },
      });
      return NextResponse.json({
        ok: true,
        eventsCount: existingEvents,
        duration: "0.1s",
        cached: true,
        guardrailsSetByAi: false,
      });
    }

    // ── Get current avg price from InventoryMaster (for yourPrice) ──────────
    const invDocs = await InventoryMaster.find({
      listingId: listingOid,
      date: { $gte: from, $lte: to },
    }).lean() as any[];
    const invPrices = invDocs.filter((d) => d.currentPrice > 0).map((d) => Number(d.currentPrice));
    const yourPrice = invPrices.length > 0
      ? Math.round(invPrices.reduce((a, b) => a + b, 0) / invPrices.length)
      : basePrice;

    // ── Call Marketing Agent ─────────────────────────────────────────────────
    console.log(`[market-setup] Calling Marketing Agent for ${propertyName} (${area}) ${from}→${to}`);

    const prompt = buildMarketingPrompt(propertyName, area, bedrooms, yourPrice, priceFloor, priceCeiling, from, to);

    const agentResult = await callLyzrAgent({
      agentId: MARKETING_AGENT_ID,
      message: prompt,
      sessionId: `mkt-${propertyId}-${from}-${to}`,
      userId: orgId,
      timeoutMs: 60_000,
      maxRetries: 1,
    });

    let parsed: any = null;
    if (agentResult.ok && agentResult.response) {
      parsed = extractJson(agentResult.response) as any;
    }

    const duration = `${((Date.now() - t0) / 1000).toFixed(1)}s`;

    // ── Upsert MarketEvent records ───────────────────────────────────────────
    const events: any[] = Array.isArray(parsed?.events) ? parsed.events : [];
    let savedEvents = 0;

    for (const ev of events) {
      if (!ev.name || !ev.startDate || !ev.endDate) continue;
      await MarketEvent.findOneAndUpdate(
        { orgId: orgOid, name: ev.name, startDate: ev.startDate, endDate: ev.endDate },
        {
          $set: {
            orgId: orgOid,
            name: String(ev.name),
            startDate: String(ev.startDate),
            endDate: String(ev.endDate),
            impactLevel: ["high", "medium", "low"].includes(ev.impactLevel) ? ev.impactLevel : "medium",
            upliftPct: Number(ev.upliftPct ?? 10),
            description: String(ev.description ?? ""),
            area: String(ev.area ?? area),
            source: "ai_detected",
            isActive: true,
          },
        },
        { upsert: true, new: true }
      );
      savedEvents++;
    }

    // ── Upsert BenchmarkData ─────────────────────────────────────────────────
    const bm = parsed?.benchmark;
    let benchmarkDoc: any;

    if (bm && typeof bm === "object") {
      const comps = Array.isArray(bm.comps) ? bm.comps.map((c: any) => ({
        name: String(c.name ?? ""),
        source: String(c.source ?? "Airbnb"),
        sourceUrl: c.sourceUrl ?? null,
        rating: c.rating != null ? Number(c.rating) : null,
        reviews: c.reviews != null ? Number(c.reviews) : null,
        avgRate: Number(c.avgRate ?? 0),
        weekdayRate: c.weekdayRate ? Number(c.weekdayRate) : undefined,
        weekendRate: c.weekendRate ? Number(c.weekendRate) : undefined,
      })).filter((c: any) => c.name && c.avgRate > 0) : [];

      const verdictMap: Record<string, string> = { UNDERPRICED: "UNDERPRICED", FAIR: "FAIR", SLIGHTLY_ABOVE: "SLIGHTLY_ABOVE", OVERPRICED: "OVERPRICED" };
      const trendMap: Record<string, string> = { rising: "rising", stable: "stable", falling: "falling" };

      benchmarkDoc = {
        orgId: orgOid,
        listingId: listingOid,
        dateFrom: from,
        dateTo: to,
        p25Rate: Number(bm.p25Rate ?? 0) || Math.round(yourPrice * 0.8),
        p50Rate: Number(bm.p50Rate ?? 0) || yourPrice,
        p75Rate: Number(bm.p75Rate ?? 0) || Math.round(yourPrice * 1.2),
        p90Rate: Number(bm.p90Rate ?? 0) || Math.round(yourPrice * 1.4),
        avgWeekday: Number(bm.avgWeekday ?? 0) || Math.round(yourPrice * 0.95),
        avgWeekend: Number(bm.avgWeekend ?? 0) || Math.round(yourPrice * 1.15),
        yourPrice,
        percentile: Number(bm.percentile ?? 50),
        verdict: verdictMap[bm.verdict] ?? "FAIR",
        rateTrend: trendMap[bm.rateTrend] ?? "stable",
        trendPct: Number(bm.trendPct ?? 0),
        recommendedWeekday: Number(bm.recommendedWeekday ?? 0) || yourPrice,
        recommendedWeekend: Number(bm.recommendedWeekend ?? 0) || Math.round(yourPrice * 1.1),
        recommendedEvent: Number(bm.recommendedEvent ?? 0) || Math.round(yourPrice * 1.5),
        reasoning: String(bm.reasoning ?? ""),
        comps,
      };
    } else {
      // Agent didn't return valid JSON — use synthetic fallback
      console.warn("[market-setup] Agent returned no parseable JSON — using synthetic benchmark");
      benchmarkDoc = syntheticBenchmark(listingOid, orgOid, yourPrice, from, to);
    }

    await BenchmarkData.findOneAndUpdate(
      { listingId: listingOid, dateFrom: from, dateTo: to },
      { $set: benchmarkDoc },
      { upsert: true, new: true }
    );

    console.log(`[market-setup] Done: ${savedEvents} events, benchmark saved (${duration})`);

    return NextResponse.json({
      ok: true,
      eventsCount: savedEvents,
      duration,
      cached: false,
      guardrailsSetByAi: false,
    });
  } catch (err: any) {
    console.error("[market-setup] Error:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Market setup failed" }, { status: 500 });
  }
}
