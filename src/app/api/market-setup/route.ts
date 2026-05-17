import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, BenchmarkData, InventoryMaster, DataSyncLog } from "@/lib/db/models";
import { syncEventFeeds } from "@/lib/events/event-feed-syncer";
import { fetchSerpCompsForProperty, upsertSerpComps } from "@/lib/services/serp-comps";
import { Types } from "mongoose";

// Skip SERP sync if last sync was less than 4 hours ago (SERP budget guard)
const SYNC_STALE_MS = 4 * 60 * 60 * 1000;

const percentile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * (q / 100)));
  return sorted[idx];
};

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

    const listing = await Listing.findOne({ _id: listingOid, orgId: orgOid }).lean() as any;
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const bedrooms = listing.bedroomsNumber ?? listing.bedrooms ?? 1;
    const basePrice = Number(listing.basePrice ?? listing.price ?? 500);
    const area = listing.area || listing.city || "Dubai";

    // ── Stale check: skip SERP sync if a recent complete sync exists ──────────
    const lastSync = await DataSyncLog.findOne({
      orgId: orgOid,
      jobName: "sync-events",
      status: "complete",
    }).sort({ startedAt: -1 }).lean() as any;

    const isFresh = lastSync && (Date.now() - new Date(lastSync.startedAt).getTime() < SYNC_STALE_MS);

    if (isFresh) {
      console.log(`[market-setup] Sync is fresh (last: ${lastSync.startedAt}) — skipping SERP calls`);
      return NextResponse.json({
        ok: true,
        eventsCount: lastSync.recordsInserted + lastSync.recordsUpdated,
        duration: "0.0s",
        cached: true,
        syncSkipped: true,
      });
    }

    // ── Create DataSyncLog entry ──────────────────────────────────────────────
    const syncLog = await DataSyncLog.create({
      orgId: orgOid,
      jobName: "sync-events",
      startedAt: new Date(),
      status: "running",
      recordsInserted: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      serpCallsUsed: 3, // SERP Events + SERP News + SERP Comps = 3 calls
      sources: {},
    });

    // ── Get current avg price from InventoryMaster for yourPrice field ────────
    const invDocs = await InventoryMaster.find({
      listingId: listingOid,
      date: { $gte: from, $lte: to },
    }).lean() as any[];
    const invPrices = invDocs.filter((d) => d.currentPrice > 0).map((d) => Number(d.currentPrice));
    const yourPrice = invPrices.length > 0
      ? Math.round(invPrices.reduce((a, b) => a + b, 0) / invPrices.length)
      : basePrice;

    // ── Run SERP event sync + SERP comp sync in parallel ──────────────────────
    const [syncResult, serpComps] = await Promise.allSettled([
      syncEventFeeds(orgOid, 90, "Dubai"),
      fetchSerpCompsForProperty(area, bedrooms),
    ]);

    // ── Process event sync results ────────────────────────────────────────────
    let eventsInserted = 0;
    let eventsUpdated = 0;
    let syncSources: Record<string, number> = {};
    let syncError: string | undefined;

    if (syncResult.status === "fulfilled") {
      eventsInserted = syncResult.value.inserted;
      eventsUpdated = syncResult.value.updated;
      syncSources = syncResult.value.sources;
      console.log(`[market-setup] Event sync: +${eventsInserted} inserted, ~${eventsUpdated} updated`);
    } else {
      syncError = String(syncResult.reason);
      console.error(`[market-setup] Event sync failed:`, syncResult.reason);
    }

    // ── Persist SERP comps + build BenchmarkData (only when comps exist) ─────
    let compsCount = 0;
    let benchmarkSource: "serp" | "none" = "none";

    if (serpComps.status === "fulfilled" && serpComps.value.length > 0) {
      const comps = serpComps.value;
      compsCount = comps.length;

      await upsertSerpComps(area, bedrooms, comps);

      const rates = comps.map((c) => c.avgRate).sort((a, b) => a - b);
      const p25 = percentile(rates, 25);
      const p50 = percentile(rates, 50);
      const p75 = percentile(rates, 75);
      const p90 = percentile(rates, 90);

      let verdict: string;
      const ratio = yourPrice / p50;
      if (ratio < 0.85) verdict = "UNDERPRICED";
      else if (ratio < 1.05) verdict = "FAIR";
      else if (ratio < 1.20) verdict = "SLIGHTLY_ABOVE";
      else verdict = "OVERPRICED";

      const benchmarkComps = comps.slice(0, 10).map((c) => ({
        name: c.name.slice(0, 100),
        source: c.source,
        sourceUrl: c.sourceUrl,
        avgRate: c.avgRate,
      }));

      await BenchmarkData.findOneAndUpdate(
        { listingId: listingOid, dateFrom: from, dateTo: to },
        {
          $set: {
            orgId: orgOid,
            listingId: listingOid,
            dateFrom: from,
            dateTo: to,
            p25Rate: p25,
            p50Rate: p50,
            p75Rate: p75,
            p90Rate: p90,
            avgWeekday: p50,
            avgWeekend: Math.round(p50 * 1.15),
            yourPrice,
            percentile: Math.round(ratio * 50),
            verdict,
            recommendedWeekday: p50,
            recommendedWeekend: Math.round(p50 * 1.15),
            recommendedEvent: Math.max(p75, Math.round(p50 * 1.4)),
            reasoning: `Benchmark derived from ${rates.length} live SERP-sourced comparable listings in ${area} (${bedrooms}BR). Your price AED ${yourPrice} vs P50 AED ${p50}.`,
            comps: benchmarkComps,
          },
        },
        { upsert: true, new: true }
      );

      benchmarkSource = "serp";
      console.log(`[market-setup] SERP benchmark saved: ${rates.length} comps, P50=${p50}, verdict=${verdict}`);
    } else {
      const reason = serpComps.status === "rejected"
        ? String(serpComps.reason)
        : "SERP returned no usable comp listings";
      console.warn(`[market-setup] SERP comps unavailable: ${reason}`);
      // Intentionally NOT persisting a synthetic benchmark — the widget will
      // show its "No benchmark data yet" state until real SERP data is available.
    }

    // ── Update DataSyncLog as complete ────────────────────────────────────────
    const duration = Date.now() - t0;
    await DataSyncLog.findByIdAndUpdate(syncLog._id, {
      $set: {
        status: syncError ? "error" : "complete",
        completedAt: new Date(),
        recordsInserted: eventsInserted,
        recordsUpdated: eventsUpdated,
        sources: { ...syncSources, SERP_Comps: compsCount },
        durationMs: duration,
        ...(syncError && { errorMessage: syncError }),
      },
    });

    const durationStr = `${(duration / 1000).toFixed(1)}s`;
    console.log(`[market-setup] Done: ${eventsInserted} events, ${compsCount} SERP comps (${durationStr})`);

    return NextResponse.json({
      ok: true,
      eventsCount: eventsInserted + eventsUpdated,
      eventsInserted,
      eventsUpdated,
      compsCount,
      duration: durationStr,
      cached: false,
      syncSkipped: false,
      benchmarkSource,
    });
  } catch (err: any) {
    console.error("[market-setup] Error:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Market setup failed" }, { status: 500 });
  }
}
