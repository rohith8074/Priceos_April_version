import { CompetitorListing } from "@/lib/db/models/competitor_listing";
import { DataSyncLog } from "@/lib/db/models";
import { Types } from "mongoose";

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

/**
 * Per-widget 4-hour staleness check. Each widget uses its own jobName so
 * refreshes don't share state.
 *
 * Returns `true` only when the most recent "complete" sync within 4 hours
 * actually produced records — empty syncs are ignored so users can keep
 * retrying without a 4-hour lockout when SERP returned nothing.
 */
export async function isCacheFresh(orgId: Types.ObjectId, jobName: string): Promise<boolean> {
  const last = await DataSyncLog.findOne({
    orgId,
    jobName,
    status: "complete",
  }).sort({ startedAt: -1 }).lean() as any;

  if (!last) return false;
  const withinWindow = Date.now() - new Date(last.startedAt).getTime() < FOUR_HOURS_MS;
  const hadData = (last.recordsInserted ?? 0) + (last.recordsUpdated ?? 0) > 0;
  return withinWindow && hadData;
}

/**
 * Record a completed SERP fetch so the next call within 4 hours short-circuits.
 */
export async function markCacheFresh(
  orgId: Types.ObjectId,
  jobName: string,
  meta: { recordsInserted?: number; recordsUpdated?: number; sources?: Record<string, number> } = {}
): Promise<void> {
  const now = new Date();
  await DataSyncLog.create({
    orgId,
    jobName,
    startedAt: now,
    completedAt: now,
    status: "complete",
    recordsInserted: meta.recordsInserted ?? 0,
    recordsUpdated: meta.recordsUpdated ?? 0,
    sources: meta.sources ?? {},
    serpCallsUsed: 1,
  });
}

export interface SerpComp {
  name: string;
  sourceUrl: string;
  avgRate: number;
  source: "Airbnb" | "Booking.com" | "Expedia" | "Vrbo" | "Other";
  snippet: string;
}

interface SerpOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  displayed_link?: string;
}

const RATE_REGEX = /(?:AED|aed|دإ)\s*([0-9,]+)|([0-9,]+)\s*(?:AED|per night)/i;

function badgeFor(link: string): SerpComp["source"] {
  if (link.includes("airbnb")) return "Airbnb";
  if (link.includes("booking.com")) return "Booking.com";
  if (link.includes("expedia")) return "Expedia";
  if (link.includes("vrbo")) return "Vrbo";
  return "Other";
}

/**
 * Fetch comparable short-term rental listings for a Dubai area + bedroom count
 * from SERP Google search. Parses nightly rates from result snippets.
 *
 * Returns an empty array if SERP_API_KEY is unset, the API fails, or no rates
 * can be extracted. Callers should treat empty == "no data" and surface the
 * empty state to the user rather than synthesizing values.
 */
export type SerpDiagnosticCode =
  | "ok"
  | "no_api_key"
  | "http_error"
  | "api_error"
  | "no_organic_results"
  | "no_parseable_rates"
  | "fetch_error";

export interface SerpDiagnostic {
  code: SerpDiagnosticCode;
  message: string;
  query?: string;
  organicCount?: number;
  parseableRates?: number;
  elapsedMs?: number;
}

export interface SerpFetchResult {
  comps: SerpComp[];
  diagnostic: SerpDiagnostic;
}

/**
 * Verbose variant: returns both the comps and a structured diagnostic
 * describing what happened — useful for surfacing empty results in the UI
 * with an actionable reason instead of a silent "no data".
 */
export async function fetchSerpCompsWithDiagnostics(
  area: string,
  bedrooms: number
): Promise<SerpFetchResult> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.warn(`[serp-comps] SERP_API_KEY is not set — returning empty result for ${area} ${bedrooms}BR`);
    return {
      comps: [],
      diagnostic: { code: "no_api_key", message: "SERP_API_KEY is not configured on the server" },
    };
  }

  const query = `${bedrooms} bedroom apartment rental ${area} Dubai per night site:airbnb.com OR site:booking.com`;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "ae");
  url.searchParams.set("hl", "en");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", apiKey);

  console.log(`[serp-comps] Fetching for ${area} ${bedrooms}BR — query="${query}"`);

  try {
    const t0 = Date.now();
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    const elapsed = Date.now() - t0;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[serp-comps] SERP returned HTTP ${res.status} in ${elapsed}ms. Body: ${body.slice(0, 200)}`);
      return {
        comps: [],
        diagnostic: {
          code: "http_error",
          message: `SERP returned HTTP ${res.status}: ${body.slice(0, 120)}`,
          query,
          elapsedMs: elapsed,
        },
      };
    }

    const data = (await res.json()) as { organic_results?: SerpOrganicResult[]; error?: string };
    if (data.error) {
      console.warn(`[serp-comps] SERP API error: ${data.error}`);
      return {
        comps: [],
        diagnostic: { code: "api_error", message: `SERP API: ${data.error}`, query, elapsedMs: elapsed },
      };
    }

    const organicCount = data.organic_results?.length ?? 0;
    const out: SerpComp[] = [];
    let droppedNoRate = 0;

    for (const r of data.organic_results ?? []) {
      if (!r.title || !r.link) continue;

      const match = r.snippet?.match(RATE_REGEX);
      if (!match) {
        droppedNoRate++;
        continue;
      }
      const rate = parseInt((match[1] || match[2]).replace(/,/g, ""), 10);
      if (!Number.isFinite(rate) || rate < 100 || rate > 10_000) {
        droppedNoRate++;
        continue;
      }

      out.push({
        name: r.title.slice(0, 200),
        sourceUrl: r.link,
        avgRate: rate,
        source: badgeFor(r.link),
        snippet: r.snippet?.slice(0, 300) ?? "",
      });
    }

    console.log(
      `[serp-comps] ${area} ${bedrooms}BR — SERP returned ${organicCount} organic results in ${elapsed}ms, ` +
      `${out.length} had parseable rates, ${droppedNoRate} had no rate in snippet`
    );

    if (organicCount === 0) {
      return {
        comps: [],
        diagnostic: {
          code: "no_organic_results",
          message: `SERP returned 0 organic results for "${query}". Try a more general area name.`,
          query,
          organicCount: 0,
          parseableRates: 0,
          elapsedMs: elapsed,
        },
      };
    }

    if (out.length === 0) {
      return {
        comps: [],
        diagnostic: {
          code: "no_parseable_rates",
          message: `SERP returned ${organicCount} results but none had a parseable nightly rate in the snippet. Listing sites often hide prices behind JS.`,
          query,
          organicCount,
          parseableRates: 0,
          elapsedMs: elapsed,
        },
      };
    }

    return {
      comps: out,
      diagnostic: {
        code: "ok",
        message: `SERP returned ${organicCount} results, ${out.length} with parseable rates.`,
        query,
        organicCount,
        parseableRates: out.length,
        elapsedMs: elapsed,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[serp-comps] fetch error for ${area} ${bedrooms}BR:`, err);
    return { comps: [], diagnostic: { code: "fetch_error", message: msg } };
  }
}

/**
 * Backwards-compatible thin wrapper — callers that only need the comp array
 * can keep using this. New code that wants to show users *why* a fetch was
 * empty should call fetchSerpCompsWithDiagnostics instead.
 */
export async function fetchSerpCompsForProperty(
  area: string,
  bedrooms: number
): Promise<SerpComp[]> {
  const { comps } = await fetchSerpCompsWithDiagnostics(area, bedrooms);
  return comps;
}

/**
 * Persist SERP comps to the CompetitorListing collection.
 * Uses upsert keyed by (marketId, listingName) so re-runs don't duplicate.
 */
export async function upsertSerpComps(
  area: string,
  bedrooms: number,
  comps: SerpComp[]
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const comp of comps) {
    const existing = await (CompetitorListing as any).findOne({
      marketId: area,
      listingName: comp.name,
    });

    const payload = {
      ttmAvgRateNative: comp.avgRate,
      hostName: comp.source,
      serpData: {
        sourceUrl: comp.sourceUrl,
        source: comp.source,
        snippet: comp.snippet,
        lastFetched: new Date(),
      },
    };

    if (existing) {
      await (CompetitorListing as any).updateOne({ _id: existing._id }, { $set: payload });
      updated++;
    } else {
      await (CompetitorListing as any).create({
        marketId: area,
        airbticsListingId: `serp:${area.replace(/\s+/g, "_")}:${comp.name.slice(0, 30)}`,
        listingName: comp.name,
        latitude: 0,
        longitude: 0,
        bedrooms,
        roomType: "Entire apartment",
        amenities: [],
        numReviews: 0,
        currency: "AED",
        ...payload,
      });
      inserted++;
    }
  }

  return { inserted, updated };
}
