/**
 * GET /api/cron/sync-news
 *
 * Vercel Cron job: runs every 6 hours (see vercel.json).
 * Fetches Dubai tourism demand news via SERP Google News and stores
 * normalised results as MarketEvent records (source="serp") with
 * sourceUrl so the UI can link directly to the article.
 *
 * SERP budget: 1 call per run → ~4 calls/day → ~120/month.
 * Combined with sync-events (~6/day), total ≈ 10/day → ~300/month.
 * Adjust schedules to stay within the 250/month free limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { MarketEvent, DemandSignal, DataSyncLog } from "@/lib/db/models";
import { fetchSerpDubaiNews } from "@/lib/events/event-feed-syncer";
import mongoose from "mongoose";

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || "69d776a671c7b939aaf49053";

const NEWS_QUERIES = [
  "Dubai tourism demand 2025 2026",
  "Dubai events festival concerts 2025",
];

function classifySentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  if (/surge|record|boom|growth|strong|high demand|sold out|packed/.test(lower)) return "positive";
  if (/decline|drop|slow|cancel|ban|crisis|conflict|war|risk/.test(lower)) return "negative";
  return "neutral";
}

function classifyCategory(text: string): "tourism" | "events" | "infrastructure" | "geopolitical" | "economic" | "general" {
  const lower = text.toLowerCase();
  if (/festival|concert|expo|gitex|event|show/.test(lower)) return "events";
  if (/airport|metro|hotel|resort|attraction/.test(lower)) return "infrastructure";
  if (/war|sanction|tension|conflict|political/.test(lower)) return "geopolitical";
  if (/gdp|oil|economy|trade|market|recession/.test(lower)) return "economic";
  if (/tourist|visitor|travel|tourism|arrival/.test(lower)) return "tourism";
  return "general";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  await connectToDatabase();

  const orgId = new mongoose.Types.ObjectId(DEFAULT_ORG_ID);

  const logEntry = await DataSyncLog.create({
    orgId,
    jobName: "sync-news",
    startedAt,
    status: "running",
    serpCallsUsed: 0,
  });

  let inserted = 0;
  let skipped = 0;
  let serpCalls = 0;

  try {
    for (const query of NEWS_QUERIES) {
      const articles = await fetchSerpDubaiNews(query);
      serpCalls++;

      for (const article of articles) {
        if (!article.sourceUrl) continue;

        // Upsert into DemandSignal collection (deduplicated by sourceUrl)
        const existing = await DemandSignal.findOne({ sourceUrl: article.sourceUrl });
        if (existing) {
          skipped++;
          continue;
        }

        let publishedAt: Date;
        try {
          publishedAt = new Date(article.startDate);
          if (isNaN(publishedAt.getTime())) publishedAt = new Date();
        } catch {
          publishedAt = new Date();
        }

        const sentiment = classifySentiment(article.name + " " + article.description);
        const category = classifyCategory(article.name + " " + article.description);
        const demandScore = sentiment === "positive" ? 65 : sentiment === "negative" ? 30 : 50;

        await DemandSignal.create({
          orgId,
          headline: article.name,
          summary: article.description ?? "",
          sourceUrl: article.sourceUrl,
          sourceName: "SERP News",
          publishedAt,
          area: article.area ?? "Dubai",
          sentiment,
          demandScore,
          category,
          fetchedAt: new Date(),
        });

        // Also save as a MarketEvent so it appears in the market events table
        await MarketEvent.findOneAndUpdate(
          { orgId, name: article.name, startDate: article.startDate },
          {
            $setOnInsert: {
              orgId,
              name: article.name,
              startDate: article.startDate,
              endDate: article.endDate,
              area: article.area ?? "Dubai",
              areas: [article.area ?? "Dubai"],
              impactLevel: article.impactLevel,
              upliftPct: article.upliftPct,
              description: article.description,
              source: "serp",
              sourceUrl: article.sourceUrl,
              category: article.category ?? "News",
              isActive: true,
            },
          },
          { upsert: true }
        );

        inserted++;
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
          recordsInserted: inserted,
          recordsSkipped: skipped,
          serpCallsUsed: serpCalls,
          sources: { SERP_News: inserted + skipped },
        },
      }
    );

    return NextResponse.json({ ok: true, inserted, skipped, serpCalls, durationMs });
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    await DataSyncLog.updateOne(
      { _id: logEntry._id },
      { $set: { status: "error", completedAt: new Date(), errorMessage } }
    );
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
