import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models";
import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import {
  fetchSerpCompsWithDiagnostics,
  upsertSerpComps,
  isCacheFresh,
  markCacheFresh,
  type SerpDiagnostic,
} from "@/lib/services/serp-comps";
import { Types } from "mongoose";

const benchmarkJobName = (listingId: string) => `serp-benchmark-${listingId}`;

// Real SERP-sourced comps only. No synthetic fallback — when SERP cache is empty
// the widget shows its "No benchmark data yet" state.

const SOURCE_BADGE_FOR = (host: string): string => {
  if (host.includes("airbnb")) return "Airbnb";
  if (host.includes("booking")) return "Booking.com";
  if (host.includes("expedia")) return "Expedia";
  if (host.includes("vrbo")) return "Vrbo";
  return "Other";
};

const percentile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * (q / 100)));
  return sorted[idx];
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    // forceRefresh=1 from the widget's refresh button bypasses the 4-hr cache
    // and always calls SERP. Page loads (no param) respect the cache.
    const forceRefresh = searchParams.get("forceRefresh") === "1" || searchParams.get("forceRefresh") === "true";

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ success: true, hasData: false, summary: null, comps: [], diagnostic: { code: "no_api_key", message: "Invalid or missing listingId" } });
    }

    await connectToDatabase();

    const listing = await Listing.findById(listingId).lean() as any;
    if (!listing) {
      return NextResponse.json({ success: true, hasData: false, summary: null, comps: [], diagnostic: { code: "no_api_key", message: "Listing not found" } });
    }

    const area = listing.area || listing.city || null;
    const bedrooms = listing.bedroomsNumber || listing.bedrooms || 1;
    if (!area) {
      return NextResponse.json({
        success: true,
        hasData: false,
        summary: null,
        comps: [],
        diagnostic: { code: "no_api_key", message: "This listing has no 'area' field set. Add an area on the property to enable SERP lookup." },
      });
    }

    // 4-hr cache gate: refresh SERP comps for this listing if stale.
    // Only mark the cache fresh when SERP actually returned data — if SERP
    // returns empty, leave the cache stale so the user's next refresh click
    // retries (otherwise an empty result would lock out retries for 4hrs).
    // forceRefresh=1 (refresh button click) bypasses the cache entirely.
    const orgId = listing.orgId as Types.ObjectId;
    const cacheKey = benchmarkJobName(listingId);
    const fresh = forceRefresh ? false : await isCacheFresh(orgId, cacheKey);
    let lastDiagnostic: SerpDiagnostic | null = null;
    console.log(`[benchmark] listingId=${listingId} area="${area}" bedrooms=${bedrooms} cacheFresh=${fresh} forceRefresh=${forceRefresh}`);
    if (!fresh) {
      const { comps: newComps, diagnostic } = await fetchSerpCompsWithDiagnostics(area, bedrooms);
      lastDiagnostic = diagnostic;
      if (newComps.length > 0) {
        const r = await upsertSerpComps(area, bedrooms, newComps);
        await markCacheFresh(orgId, cacheKey, {
          recordsInserted: r.inserted,
          recordsUpdated: r.updated,
          sources: { SERP_Benchmark: r.inserted + r.updated },
        });
        console.log(`[benchmark] Persisted ${r.inserted} new + ${r.updated} updated comps`);
      } else {
        console.log(`[benchmark] SERP returned no usable comps (${diagnostic.code}) — leaving cache stale so next refresh retries`);
      }
    } else {
      console.log(`[benchmark] Skipping SERP call (cache fresh within 4hrs). Pass forceRefresh=1 to force.`);
    }

    // Pull only SERP-sourced comps for this area + bedroom count
    const serpComps = await (CompetitorListing as any).find({
      marketId: area,
      bedrooms,
      airbticsListingId: { $regex: "^serp:" },
      ttmAvgRateNative: { $gt: 0 },
    }).lean();

    if (serpComps.length === 0) {
      return NextResponse.json({
        success: true,
        hasData: false,
        summary: null,
        comps: [],
        diagnostic: lastDiagnostic ?? { code: "ok", message: "Cache fresh but DB has no comps for this area + bedroom count." },
      });
    }

    const rates = serpComps
      .map((c: any) => Number(c.ttmAvgRateNative))
      .filter((r: number) => r > 0)
      .sort((a: number, b: number) => a - b);

    const p25 = percentile(rates, 25);
    const p50 = percentile(rates, 50);
    const p75 = percentile(rates, 75);
    const p90 = percentile(rates, 90);

    const yourPrice = Number(listing.price || 0);
    const rank = rates.filter((r: number) => r < yourPrice).length;
    const pct = rates.length > 0 ? Math.round((rank / rates.length) * 100) : 0;

    let verdict: "UNDERPRICED" | "FAIR" | "SLIGHTLY_ABOVE" | "OVERPRICED" = "FAIR";
    if (yourPrice && yourPrice < p25) verdict = "UNDERPRICED";
    else if (yourPrice && yourPrice > p90) verdict = "OVERPRICED";
    else if (yourPrice && yourPrice > p75) verdict = "SLIGHTLY_ABOVE";

    const summary = {
      id: 0,
      listingId: 0,
      dateFrom: dateFrom || new Date().toISOString().split("T")[0],
      dateTo: dateTo || new Date().toISOString().split("T")[0],
      p25Rate: String(p25),
      p50Rate: String(p50),
      p75Rate: String(p75),
      p90Rate: String(p90),
      avgWeekday: String(p50),
      avgWeekend: String(Math.round(p50 * 1.15)),
      yourPrice: yourPrice ? String(yourPrice) : null,
      percentile: pct,
      verdict,
      rateTrend: null,
      trendPct: null,
      recommendedWeekday: String(p50),
      recommendedWeekend: String(Math.round(p50 * 1.15)),
      recommendedEvent: String(Math.max(p75, Math.round(p50 * 1.4))),
      reasoning: `Benchmark derived from ${rates.length} live SERP-sourced comparable listings in ${area} (${bedrooms}BR).`,
      source: "serp",
    };

    const comps = serpComps.slice(0, 20).map((c: any) => {
      const url = c.serpData?.sourceUrl as string | undefined;
      const sourceLabel = url ? SOURCE_BADGE_FOR(url) : (c.hostName || "Other");
      return {
        name: c.listingName,
        source: sourceLabel,
        sourceUrl: url ?? null,
        rating: c.ratingOverall ?? null,
        reviews: c.numReviews ?? null,
        avgRate: Number(c.ttmAvgRateNative),
        weekdayRate: null,
        weekendRate: null,
        minRate: null,
        maxRate: null,
      };
    });

    return NextResponse.json({ success: true, hasData: true, summary, comps });
  } catch (err: any) {
    console.error("[GET /api/benchmark]", err);
    return NextResponse.json({ success: true, hasData: false, summary: null, comps: [] });
  }
}
