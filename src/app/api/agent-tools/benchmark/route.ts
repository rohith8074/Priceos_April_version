import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models";
import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import { Types } from "mongoose";

// Agent-tool variant of /api/benchmark — same SERP-only data source.
// Returns { source: "none" } when no SERP comps available; no synthetic fallback.

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

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ source: "none" }, { status: 200 });
    }

    await connectToDatabase();

    const listing = await Listing.findById(listingId).lean() as any;
    if (!listing) {
      return NextResponse.json({ source: "none" }, { status: 200 });
    }

    const area = listing.area || listing.city || null;
    const bedrooms = listing.bedroomsNumber || listing.bedrooms || 1;
    if (!area) {
      return NextResponse.json({ source: "none" }, { status: 200 });
    }

    const serpComps = await (CompetitorListing as any).find({
      marketId: area,
      bedrooms,
      airbticsListingId: { $regex: "^serp:" },
      ttmAvgRateNative: { $gt: 0 },
    }).lean();

    if (serpComps.length === 0) {
      return NextResponse.json({ source: "none" }, { status: 200 });
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

    const formattedComps = serpComps.slice(0, 20).map((c: any) => {
      const url = c.serpData?.sourceUrl as string | undefined;
      return {
        name: c.listingName,
        source: url ? SOURCE_BADGE_FOR(url) : (c.hostName || "Other"),
        sourceUrl: url ?? null,
        rating: c.ratingOverall ?? null,
        reviews: c.numReviews ?? null,
        avgRate: Number(c.ttmAvgRateNative),
      };
    });

    return NextResponse.json({
      listingId,
      source: "serp",
      p25,
      p50,
      p75,
      p90,
      avgWeekday: p50,
      avgWeekend: Math.round(p50 * 1.15),
      yourPrice,
      percentile: pct,
      verdict,
      rateTrend: null,
      trendPct: null,
      recommendedWeekday: p50,
      recommendedWeekend: Math.round(p50 * 1.15),
      recommendedEvent: Math.max(p75, Math.round(p50 * 1.4)),
      reasoning: `Benchmark derived from ${rates.length} live SERP-sourced comparable listings in ${area} (${bedrooms}BR).`,
      comps: formattedComps,
    }, { status: 200 });
  } catch (err: any) {
    console.error("[api/agent-tools/benchmark] GET error", err);
    return NextResponse.json({ source: "none" }, { status: 200 });
  }
}
