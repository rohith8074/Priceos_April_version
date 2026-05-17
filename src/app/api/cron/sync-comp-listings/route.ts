/**
 * GET /api/cron/sync-comp-listings
 *
 * Vercel Cron job: runs every 24 hours (see vercel.json).
 * Fetches comparable STR listings from SERP Google for each Dubai area
 * and stores them in CompetitorListing collection to power the
 * Benchmark Intelligence widget without requiring Airbtics.
 *
 * SERP budget: 1 call per area × N areas per run.
 * Default areas: Dubai Marina, Downtown Dubai, JBR, Palm Jumeirah, Business Bay = 5 calls/day → ~150/month.
 * Total budget with events+news ≈ 10+5 = 15 calls/day → ~450/month on free plan.
 *
 * IMPORTANT: Set SERP_COMP_ENABLED=true to activate (off by default to protect budget).
 */

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { BenchmarkData, DataSyncLog } from "@/lib/db/models";
import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import mongoose from "mongoose";

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || "69d776a671c7b939aaf49053";

const DUBAI_AREAS = [
  { area: "Dubai Marina", bedrooms: 1 },
  { area: "Downtown Dubai", bedrooms: 2 },
  { area: "JBR", bedrooms: 1 },
  { area: "Palm Jumeirah", bedrooms: 3 },
  { area: "Business Bay", bedrooms: 1 },
];

interface SerpOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  displayed_link?: string;
}

async function fetchSerpCompListings(
  area: string,
  bedrooms: number,
): Promise<{ name: string; sourceUrl: string; avgRate: number; source: string; snippet: string }[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return [];

  const query = `${bedrooms} bedroom apartment rental ${area} Dubai per night site:airbnb.com OR site:booking.com`;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "ae");
  url.searchParams.set("hl", "en");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { organic_results?: SerpOrganicResult[] };
    const results: { name: string; sourceUrl: string; avgRate: number; source: string; snippet: string }[] = [];

    for (const r of data.organic_results ?? []) {
      if (!r.title || !r.link) continue;

      // Extract rate from snippet — looks for patterns like "AED 450" or "$200" or "450 per night"
      let avgRate = 0;
      const rateMatch = r.snippet?.match(/(?:AED|aed|دإ)\s*([0-9,]+)|([0-9,]+)\s*(?:AED|per night)/i);
      if (rateMatch) {
        avgRate = parseInt((rateMatch[1] || rateMatch[2]).replace(/,/g, ""));
      }

      const source = r.link.includes("airbnb") ? "Airbnb"
        : r.link.includes("booking.com") ? "Booking.com"
        : r.link.includes("expedia") ? "Expedia"
        : "Other";

      results.push({
        name: r.title.slice(0, 200),
        sourceUrl: r.link,
        avgRate,
        source,
        snippet: r.snippet?.slice(0, 300) ?? "",
      });
    }

    return results;
  } catch (err) {
    console.warn(`[cron/sync-comp-listings] SERP error for ${area}:`, err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.SERP_COMP_ENABLED || process.env.SERP_COMP_ENABLED !== "true") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "SERP_COMP_ENABLED not set — set to 'true' to activate comp listing sync",
    });
  }

  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  await connectToDatabase();

  const orgId = new mongoose.Types.ObjectId(DEFAULT_ORG_ID);

  const logEntry = await DataSyncLog.create({
    orgId,
    jobName: "sync-comp-listings",
    startedAt,
    status: "running",
    serpCallsUsed: 0,
  });

  let totalInserted = 0;
  let totalUpdated = 0;
  let serpCalls = 0;

  try {
    for (const { area, bedrooms } of DUBAI_AREAS) {
      const comps = await fetchSerpCompListings(area, bedrooms);
      serpCalls++;

      const validComps = comps.filter((c) => c.avgRate > 100 && c.avgRate < 10000);

      for (const comp of validComps) {
        const existing = await (CompetitorListing as any).findOne({
          marketId: area,
          listingName: comp.name,
        });

        if (existing) {
          await (CompetitorListing as any).updateOne(
            { _id: existing._id },
            {
              $set: {
                ttmAvgRateNative: comp.avgRate,
                // Store SERP-specific fields via dot-notation on a mixed field
                "serpData.sourceUrl": comp.sourceUrl,
                "serpData.source": comp.source,
                "serpData.snippet": comp.snippet,
                "serpData.lastFetched": new Date(),
              },
            }
          );
          totalUpdated++;
        } else {
          await (CompetitorListing as any).create({
            marketId: area,
            airbticsListingId: `serp:${area.replace(/\s+/g, "_")}:${comp.name.slice(0, 30)}`,
            listingName: comp.name,
            latitude: 0,
            longitude: 0,
            bedrooms,
            hostName: comp.source,
            roomType: "Entire apartment",
            amenities: [],
            numReviews: 0,
            currency: "AED",
            ttmAvgRateNative: comp.avgRate,
            serpData: {
              sourceUrl: comp.sourceUrl,
              source: comp.source,
              snippet: comp.snippet,
              lastFetched: new Date(),
            },
          });
          totalInserted++;
        }
      }

      // Update BenchmarkData comps for listings in this area
      if (validComps.length > 0) {
        const avgRate = Math.round(
          validComps.reduce((s, c) => s + c.avgRate, 0) / validComps.length
        );

        const benchmarkComps = validComps.slice(0, 5).map((c) => ({
          name: c.name.slice(0, 100),
          source: c.source,
          sourceUrl: c.sourceUrl,
          avgRate: c.avgRate,
        }));

        // Update any benchmark docs for this area where comps are empty or outdated
        await BenchmarkData.updateMany(
          { "comps.0": { $exists: false } },
          {
            $set: {
              comps: benchmarkComps,
              dataSource: "serp",
              confidenceScore: 70,
              lastRefreshed: new Date(),
              p50Rate: avgRate,
              yourPrice: avgRate,
            },
          }
        );
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await DataSyncLog.updateOne(
      { _id: logEntry._id },
      {
        $set: {
          status: "complete",
          completedAt,
          durationMs,
          recordsInserted: totalInserted,
          recordsUpdated: totalUpdated,
          serpCallsUsed: serpCalls,
          sources: { SERP_Comp: totalInserted + totalUpdated },
        },
      }
    );

    return NextResponse.json({
      ok: true,
      inserted: totalInserted,
      updated: totalUpdated,
      serpCalls,
      areas: DUBAI_AREAS.map((a) => a.area),
      durationMs,
    });
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    await DataSyncLog.updateOne(
      { _id: logEntry._id },
      { $set: { status: "error", completedAt: new Date(), errorMessage } }
    );
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
