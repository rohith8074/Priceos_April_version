/**
 * Event Feed Syncer
 *
 * Fetches events from 3rd-party sources (Eventbrite, DTCM, Dubai Calendar RSS)
 * and upserts them into the MarketEvent collection.
 *
 * Architecture:
 *   All external APIs → EventFeedSyncer → MarketEvent (MongoDB)
 *                                              ↓
 *                                    buildAgentContext() → Lyzr agents
 *
 * Agents never call these APIs directly — they read the pre-normalised
 * MarketEvent collection via the context injection pipeline.
 *
 * Required env vars (all optional — sources are skipped if not set):
 *   EVENTBRITE_API_KEY    — Eventbrite private token
 *   DTCM_API_KEY          — Dubai Tourism developer API key (if available)
 *   DUBAI_CALENDAR_RSS    — RSS feed URL override (default: public feed)
 *   TIMEOUT_DUBAI_RSS     — RSS feed URL override
 */

import { connectDB, MarketEvent } from "@/lib/db";
import mongoose from "mongoose";
import https from "node:https";
import { format, parseISO, addDays } from "date-fns";

// ─────────────────────────────────────────────────────────
// Normalised event shape (internal)
// ─────────────────────────────────────────────────────────

export interface NormalisedEvent {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  location: string;
  area: string;      // Dubai neighbourhood or "Dubai"
  impactLevel: "high" | "medium" | "low";
  upliftPct: number;
  description: string;
  source: "eventbrite" | "ticketmaster" | "dtcm" | "ai_detected" | "manual" | "market_template" | "serp" | "perplexity";
  externalId?: string; // source-specific ID for deduplication
  sourceUrl?: string;  // direct link to event page / news article
  attendeeCount?: number;
  category?: string;
  venue?: string;
}

// ─────────────────────────────────────────────────────────
// Impact classification helper
// ─────────────────────────────────────────────────────────

/**
 * Classify expected hotel/STR demand impact based on event category
 * and an estimate of expected attendance.
 */
function classifyImpact(
  category: string,
  attendanceEstimate?: number
): { impactLevel: "high" | "medium" | "low"; upliftPct: number } {
  const HIGH_IMPACT_KEYWORDS = [
    "formula", "f1", "expo", "gitex", "world cup", "cup final",
    "grand prix", "fashion week", "art dubai", "dubai airshow",
    "ufc", "boxing", "concert", "festival", "new year",
  ];
  const LOW_IMPACT_KEYWORDS = ["webinar", "workshop", "networking", "seminar"];

  const lower = category.toLowerCase();

  if (HIGH_IMPACT_KEYWORDS.some((k) => lower.includes(k))) {
    return { impactLevel: "high", upliftPct: 30 };
  }
  if (LOW_IMPACT_KEYWORDS.some((k) => lower.includes(k))) {
    return { impactLevel: "low", upliftPct: 5 };
  }
  if (attendanceEstimate && attendanceEstimate > 10_000) {
    return { impactLevel: "high", upliftPct: 25 };
  }
  if (attendanceEstimate && attendanceEstimate > 2_000) {
    return { impactLevel: "medium", upliftPct: 15 };
  }

  return { impactLevel: "medium", upliftPct: 12 };
}

// ─────────────────────────────────────────────────────────
// Source 1: Eventbrite
// ─────────────────────────────────────────────────────────
// Docs: https://www.eventbrite.com/platform/api#/introduction/authentication
// Rate limit: 2,000 requests per day (free tier)
// Required env: EVENTBRITE_API_KEY

interface EventbriteVenue {
  address?: { city?: string; localized_area_display?: string };
}
interface EventbriteEvent {
  id: string;
  name: { text: string };
  description?: { text?: string };
  start: { local: string };
  end: { local: string };
  category?: { name?: string };
  venue?: EventbriteVenue;
  capacity?: number;
}

async function fetchEventbriteEvents(
  daysAhead = 90,
  city = "Dubai"
): Promise<NormalisedEvent[]> {
  const apiKey = process.env.EVENTBRITE_API_KEY;
  if (!apiKey) {
    console.log("[EventFeedSyncer] EVENTBRITE_API_KEY not set — skipping Eventbrite");
    return [];
  }

  const startDate = new Date();
  const endDate = addDays(startDate, daysAhead);
  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
  url.searchParams.set("location.address", city);
  url.searchParams.set("location.within", "50km");
  url.searchParams.set("start_date.range_start", startStr);
  url.searchParams.set("start_date.range_end", endStr);
  url.searchParams.set("expand", "venue,category");
  url.searchParams.set("page_size", "100");

  const events: NormalisedEvent[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 5) {
    // cap at 5 pages = 500 events max
    url.searchParams.set("page", String(page));

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // 10-second timeout
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        console.error(`[EventFeedSyncer] Eventbrite page ${page} failed: ${res.status}`);
        break;
      }

      const data = (await res.json()) as {
        events: EventbriteEvent[];
        pagination: { has_more_items: boolean };
      };

      for (const ev of data.events ?? []) {
        const category = ev.category?.name ?? "General";
        const { impactLevel, upliftPct } = classifyImpact(category, ev.capacity);
        const area =
          ev.venue?.address?.localized_area_display ||
          ev.venue?.address?.city ||
          "Dubai";

        events.push({
          name: ev.name.text,
          startDate: format(parseISO(ev.start.local), "yyyy-MM-dd"),
          endDate: format(parseISO(ev.end.local), "yyyy-MM-dd"),
          location: `Dubai — ${area}`,
          area,
          impactLevel,
          upliftPct,
          description: ev.description?.text?.slice(0, 500) ?? category,
          source: "eventbrite",
          externalId: `eventbrite:${ev.id}`,
        });
      }

      hasMore = data.pagination?.has_more_items ?? false;
      page++;
    } catch (err) {
      console.error("[EventFeedSyncer] Eventbrite fetch error:", err);
      break;
    }
  }

  console.log(`[EventFeedSyncer] Eventbrite: fetched ${events.length} events`);
  return events;
}

// ─────────────────────────────────────────────────────────
// Source 2: DTCM (Dubai Tourism)
// ─────────────────────────────────────────────────────────
// DTCM exposes a public events API at visitdubai.com.
// If DTCM_API_KEY is set we use the official endpoint;
// otherwise we fall back to a curated static list of
// annual recurring DTCM events (always accurate for annual festivals).

const DTCM_ANNUAL_EVENTS: Omit<NormalisedEvent, "source">[] = [
  {
    name: "Dubai Shopping Festival",
    startDate: "2026-12-26",
    endDate: "2027-01-31",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "high",
    upliftPct: 35,
    description: "Annual shopping festival with entertainment, fireworks, and retail deals attracting 3M+ visitors.",
    externalId: "dtcm:dsf-2026",
  },
  {
    name: "Dubai Food Festival",
    startDate: "2026-02-20",
    endDate: "2026-03-08",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "medium",
    upliftPct: 15,
    description: "Citywide food festival featuring pop-ups, restaurant deals, and culinary events.",
    externalId: "dtcm:dff-2026",
  },
  {
    name: "Art Dubai",
    startDate: "2026-03-18",
    endDate: "2026-03-22",
    location: "Madinat Jumeirah, Dubai",
    area: "Jumeirah",
    impactLevel: "high",
    upliftPct: 28,
    description: "International contemporary art fair. Attracts 35,000+ art buyers and collectors.",
    externalId: "dtcm:artdubai-2026",
  },
  {
    name: "Dubai Airshow",
    startDate: "2027-11-17",
    endDate: "2027-11-21",
    location: "Dubai World Central (DWC)",
    area: "Dubai",
    impactLevel: "high",
    upliftPct: 40,
    description: "Biennial aerospace trade show — 85,000+ industry delegates.",
    externalId: "dtcm:airshow-2027",
  },
  {
    name: "Ramadan",
    startDate: "2026-02-17",
    endDate: "2026-03-18",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "low",
    upliftPct: -10,
    description: "Reduced tourist arrivals; demand shifts to domestic leisure. Prices typically soften.",
    externalId: "dtcm:ramadan-2026",
  },
  {
    name: "Eid Al Fitr",
    startDate: "2026-03-19",
    endDate: "2026-03-23",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "high",
    upliftPct: 30,
    description: "National holiday — domestic + GCC travel spike.",
    externalId: "dtcm:eid-alfitr-2026",
  },
  {
    name: "Eid Al Adha 2026",
    startDate: "2026-06-06",
    endDate: "2026-06-10",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "high",
    upliftPct: 35,
    description: "Eid Al Adha national holiday — major GCC family travel surge, staycations spike across Dubai.",
    externalId: "dtcm:eid-aladha-2026",
  },
  {
    name: "Dubai Summer Surprises 2026",
    startDate: "2026-06-15",
    endDate: "2026-09-05",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "medium",
    upliftPct: 12,
    description: "Annual summer retail and entertainment festival. Drives domestic and GCC staycation demand despite low tourist season.",
    externalId: "dtcm:dss-2026",
  },
  {
    name: "GITEX Global 2026",
    startDate: "2026-10-13",
    endDate: "2026-10-17",
    location: "Dubai World Trade Centre",
    area: "DWTC",
    impactLevel: "high",
    upliftPct: 40,
    description: "GITEX Global 2026 — world's largest tech event, 100,000+ delegates. Drives demand across DIFC, Marina, and Business Bay.",
    externalId: "dtcm:gitex-2026",
  },
  {
    name: "UAE National Day 2026",
    startDate: "2026-12-02",
    endDate: "2026-12-03",
    location: "Dubai",
    area: "Dubai",
    impactLevel: "high",
    upliftPct: 30,
    description: "UAE 55th National Day — public holiday with fireworks, events, and strong domestic travel demand.",
    externalId: "dtcm:uae-national-day-2026",
  },
];

async function fetchDTCMEvents(): Promise<NormalisedEvent[]> {
  const apiKey = process.env.DTCM_API_KEY;

  // If official API key provided, call Visit Dubai API
  if (apiKey) {
    try {
      const res = await fetch(
        "https://api.visitdubai.com/v1/events?limit=200&language=en",
        {
          headers: { "X-Api-Key": apiKey },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as {
          data: Array<{
            id: string;
            title: string;
            startDate: string;
            endDate: string;
            location?: string;
            category?: string;
            description?: string;
          }>;
        };

        return (data.data ?? []).map((ev) => {
          const { impactLevel, upliftPct } = classifyImpact(ev.category ?? "");
          return {
            name: ev.title,
            startDate: ev.startDate.slice(0, 10),
            endDate: ev.endDate.slice(0, 10),
            location: ev.location ?? "Dubai",
            area: ev.location ?? "Dubai",
            impactLevel,
            upliftPct,
            description: ev.description?.slice(0, 500) ?? "",
            source: "dtcm" as const,
            externalId: `dtcm:${ev.id}`,
          };
        });
      }
    } catch (err) {
      console.warn("[EventFeedSyncer] DTCM API error, falling back to static list:", err);
    }
  }

  // Fallback: curated annual event list
  console.log("[EventFeedSyncer] Using DTCM static annual event list");
  return DTCM_ANNUAL_EVENTS.map((e) => ({ ...e, source: "dtcm" as const }));
}

// ─────────────────────────────────────────────────────────
// Source 3: Dubai Calendar / Time Out Dubai RSS
// ─────────────────────────────────────────────────────────
// Both sites expose RSS feeds. We parse the feed XML
// and normalise into NormalisedEvent.

function parseRssDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return format(d, "yyyy-MM-dd");
  } catch {
    return format(new Date(), "yyyy-MM-dd");
  }
}

function extractTagText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i")) ||
    xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

// Fetches raw text from an RSS URL.
// Falls back to Node's https module (SNI-lenient) when the server returns
// ERR_SSL_TLSV1_UNRECOGNIZED_NAME — a server-side TLS misconfiguration that
// causes Node's default fetch/undici to abort before getting any data.
async function fetchRssText(feedUrl: string, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause;
    if (cause?.code !== "ERR_SSL_TLSV1_UNRECOGNIZED_NAME") throw err;

    // Server has SNI misconfiguration — retry with lenient TLS (read-only, public data)
    return new Promise<string>((resolve, reject) => {
      const parsed = new URL(feedUrl);
      const req = https.get(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + (parsed.search || ""),
          headers: { "User-Agent": "Mozilla/5.0 PriceOS-EventSyncer/1.0" },
          timeout: timeoutMs,
          rejectUnauthorized: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        }
      );
      req.on("timeout", () => req.destroy(new Error("RSS fetch timed out")));
      req.on("error", reject);
    });
  }
}

async function fetchRssFeed(
  feedUrl: string,
  sourceName: string
): Promise<NormalisedEvent[]> {
  try {
    const xml = await fetchRssText(feedUrl, 8_000);
    // Split on <item> elements
    const items = xml.split(/<item[\s>]/i).slice(1);
    const events: NormalisedEvent[] = [];

    for (const item of items) {
      const title = extractTagText(item, "title");
      const description = extractTagText(item, "description");
      const pubDate = extractTagText(item, "pubDate");
      const category = extractTagText(item, "category") || "General";

      if (!title) continue;

      const dateStr = parseRssDate(pubDate);
      const { impactLevel, upliftPct } = classifyImpact(category);

      events.push({
        name: title,
        startDate: dateStr,
        endDate: dateStr, // RSS rarely has endDate; default to same day
        location: "Dubai",
        area: "Dubai",
        impactLevel,
        upliftPct,
        description: description.replace(/<[^>]+>/g, "").slice(0, 500),
        source: "ai_detected",
        externalId: `rss:${sourceName}:${title.slice(0, 50)}`,
      });
    }

    console.log(`[EventFeedSyncer] ${sourceName} RSS: parsed ${events.length} events`);
    return events;
  } catch {
    // RSS feeds are supplementary — SERP is the primary source. Failures are non-fatal.
    return [];
  }
}

// ─────────────────────────────────────────────────────────
// Main Syncer
// ─────────────────────────────────────────────────────────

export interface SyncResult {
  inserted: number;
  updated: number;
  skipped: number;
  sources: Record<string, number>;
  errors: string[];
  /** True when SERP returned a rate-limit/quota error — caller should fall back. */
  serpRateLimited?: boolean;
}

// ─────────────────────────────────────────────────────────
// Source 4: Ticketmaster Discovery API
// ─────────────────────────────────────────────────────────
// Docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// Rate limit: 5,000 requests/day (free tier)
// Required env: TICKETMASTER_API_KEY

interface TicketmasterEvent {
  id: string;
  name: string;
  dates?: { start?: { localDate?: string } };
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
  _embedded?: { venues?: Array<{ city?: { name?: string }; address?: { line1?: string } }> };
  info?: string;
}

async function fetchTicketmasterEvents(
  city: string,
  daysAhead = 90
): Promise<NormalisedEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.log("[EventFeedSyncer] TICKETMASTER_API_KEY not set — skipping Ticketmaster");
    return [];
  }

  const startDate = new Date();
  const endDate = addDays(startDate, daysAhead);
  const startStr = startDate.toISOString().slice(0, 19) + "Z";
  const endStr = endDate.toISOString().slice(0, 19) + "Z";

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("city", city);
  url.searchParams.set("startDateTime", startStr);
  url.searchParams.set("endDateTime", endStr);
  url.searchParams.set("size", "100");
  url.searchParams.set("apikey", apiKey);

  const events: NormalisedEvent[] = [];

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[EventFeedSyncer] Ticketmaster ${city} returned ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      _embedded?: { events?: TicketmasterEvent[] };
    };
    const rawEvents = data._embedded?.events ?? [];

    for (const ev of rawEvents) {
      const dateStr = ev.dates?.start?.localDate;
      if (!ev.name || !dateStr) continue;

      const category = ev.classifications?.[0]?.segment?.name ||
        ev.classifications?.[0]?.genre?.name || "General";
      const { impactLevel, upliftPct } = classifyImpact(category);
      const venue = ev._embedded?.venues?.[0];
      const area = venue?.city?.name || city;

      events.push({
        name: ev.name,
        startDate: dateStr,
        endDate: dateStr,
        location: `${city} — ${area}`,
        area,
        impactLevel,
        upliftPct,
        description: ev.info?.slice(0, 500) ?? `${category} event in ${city}`,
        source: "ticketmaster",
        externalId: `ticketmaster:${ev.id}`,
      });
    }

    console.log(`[EventFeedSyncer] Ticketmaster (${city}): fetched ${events.length} events`);
  } catch (err) {
    console.warn(`[EventFeedSyncer] Ticketmaster error for ${city}:`, err);
  }

  return events;
}

// ─────────────────────────────────────────────────────────
// Source 5: SERP API — Google Events engine
// ─────────────────────────────────────────────────────────
// Docs: https://serpapi.com/google-events-api
// Free plan: 250 searches/month (shared across all engines)
// Required env: SERP_API_KEY
// Budget allocation: ~30 calls/month for events (every ~30h)

interface SerpEventResult {
  title: string;
  date?: { start_date?: string; when?: string };
  address?: string[];
  link?: string;
  description?: string;
  ticket_info?: Array<{ source?: string; link?: string }>;
  venue?: { name?: string };
}

async function fetchSerpGoogleEvents(
  query: string,
  daysAhead = 90,
): Promise<NormalisedEvent[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    console.log("[EventFeedSyncer] SERP_API_KEY not set — skipping SERP Google Events");
    return [];
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_events");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "ae");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", apiKey);

  const events: NormalisedEvent[] = [];

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      console.warn(`[EventFeedSyncer] SERP Google Events returned ${res.status}`);
      // 429 (rate limit) / 401 (quota/key) must surface so the caller can fall
      // back to the Lyzr Event Intelligence agent. Throw the sentinel string
      // SERP_RATE_LIMIT so syncEventFeeds records it in result.errors[].
      if (res.status === 429 || res.status === 401) throw new Error("SERP_RATE_LIMIT");
      return [];
    }

    const data = (await res.json()) as { events_results?: SerpEventResult[]; error?: string };
    // SERP returns 200 with an "error" body when out of searches this month.
    if (data.error && /run out|limit|exceeded/i.test(data.error)) throw new Error("SERP_RATE_LIMIT");
    const rawEvents = data.events_results ?? [];
    const cutoff = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

    for (const ev of rawEvents) {
      if (!ev.title) continue;

      // Parse date from "when" string like "Sat, May 17 – Sun, May 18"
      let startDate = format(new Date(), "yyyy-MM-dd");
      let endDate = startDate;

      if (ev.date?.start_date) {
        try {
          startDate = format(new Date(ev.date.start_date), "yyyy-MM-dd");
          endDate = startDate;
        } catch { /* keep today */ }
      } else if (ev.date?.when) {
        // Try to extract first date from "when" string
        const dateMatch = ev.date.when.match(/([A-Z][a-z]+,\s+[A-Z][a-z]+\s+\d+)/);
        if (dateMatch) {
          try {
            startDate = format(new Date(`${dateMatch[1]}, ${new Date().getFullYear()}`), "yyyy-MM-dd");
            endDate = startDate;
          } catch { /* keep today */ }
        }
      }

      // Skip events beyond our lookahead window
      if (startDate > cutoff) continue;

      const location = ev.address?.join(", ") ?? "Dubai";
      const area = ev.address?.[0] ?? "Dubai";
      const category = ev.venue?.name ?? "General";
      const { impactLevel, upliftPct } = classifyImpact(ev.title + " " + category);

      events.push({
        name: ev.title.slice(0, 200),
        startDate,
        endDate,
        location,
        area,
        impactLevel,
        upliftPct,
        description: ev.description?.slice(0, 500) ?? `${category} in Dubai`,
        source: "serp",
        sourceUrl: ev.link ?? ev.ticket_info?.[0]?.link,
        externalId: `serp:events:${ev.title.slice(0, 50)}:${startDate}`,
        category,
        venue: ev.venue?.name,
      });
    }

    console.log(`[EventFeedSyncer] SERP Google Events (${query}): fetched ${events.length} events`);
  } catch (err) {
    console.warn("[EventFeedSyncer] SERP Google Events error:", err);
    // Re-throw rate-limit so syncEventFeeds → caller can trigger the Lyzr fallback.
    if (err instanceof Error && err.message === "SERP_RATE_LIMIT") throw err;
  }

  return events;
}

// ─────────────────────────────────────────────────────────
// Source 6: SERP API — Google News engine (demand signals)
// ─────────────────────────────────────────────────────────
// Budget allocation: ~30 calls/month (every ~30h)
// Returns news articles relevant to Dubai tourism demand.
// Results are stored as low-impact market events tagged source="serp".

interface SerpNewsResult {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
  source?: { name?: string };
}

export async function fetchSerpDubaiNews(
  query = "Dubai tourism demand events 2025",
): Promise<NormalisedEvent[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return [];

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", "ae");
  url.searchParams.set("hl", "en");
  url.searchParams.set("api_key", apiKey);

  const events: NormalisedEvent[] = [];

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { news_results?: SerpNewsResult[] };
    const today = format(new Date(), "yyyy-MM-dd");
    // News signals are forward-looking demand indicators — use today as the relevance date
    // so they always fall within the current analysis window (not the past article date).
    const weekAhead = format(addDays(new Date(), 7), "yyyy-MM-dd");

    for (const article of data.news_results ?? []) {
      if (!article.title || !article.link) continue;

      const { impactLevel, upliftPct } = classifyImpact(article.title);

      events.push({
        name: article.title.slice(0, 200),
        startDate: today,
        endDate: weekAhead,
        location: "Dubai",
        area: "Dubai",
        impactLevel,
        upliftPct: Math.max(5, upliftPct * 0.5), // news signals get half weight vs confirmed events
        description: article.snippet?.slice(0, 500) ?? `News signal from ${article.source?.name ?? "Dubai"}`,
        source: "serp",
        sourceUrl: article.link,
        externalId: `serp:news:${article.link.slice(-60)}`,
        category: "News",
      });
    }

    console.log(`[EventFeedSyncer] SERP Google News (${query}): fetched ${events.length} articles`);
  } catch (err) {
    console.warn("[EventFeedSyncer] SERP Google News error:", err);
  }

  return events;
}

/**
 * Fetches events from all configured sources and upserts into MarketEvent.
 *
 * @param orgId      - MongoDB ObjectId of the organisation (for multi-tenancy)
 * @param daysAhead  - How far ahead to fetch (default 90 days)
 * @param marketCity - City name from MarketTemplate.eventApiConfig.eventbriteCity
 *                     Defaults to "Dubai" if not provided (backwards-compatible)
 */
// Known UAE anchor events with authoritative dates. Any incoming event whose name
// matches one of these has its dates OVERWRITTEN with the verified dates — this is
// how we fix SERP/news scraping that reports wrong festival dates (e.g. Eid).
// Dates are approximate-official; update annually. Eid/Ramadan are astronomical and
// may shift ±1 day on official moon sighting.
const VERIFIED_ANCHORS: { match: RegExp; startDate: string; endDate: string; canonicalName?: string }[] = [
  { match: /eid\s*al\s*adha/i,           startDate: "2026-05-26", endDate: "2026-05-29", canonicalName: "Eid Al Adha 2026" },
  { match: /eid\s*al\s*fitr/i,           startDate: "2026-03-20", endDate: "2026-03-23", canonicalName: "Eid Al Fitr 2026" },
  { match: /ramadan/i,                   startDate: "2026-02-18", endDate: "2026-03-19", canonicalName: "Ramadan 2026" },
  { match: /dubai summer surprises|dss/i, startDate: "2026-06-27", endDate: "2026-08-31", canonicalName: "Dubai Summer Surprises 2026" },
  { match: /dubai shopping festival|dsf/i, startDate: "2026-12-26", endDate: "2027-01-31", canonicalName: "Dubai Shopping Festival" },
  { match: /\bgitex\b/i,                 startDate: "2026-10-12", endDate: "2026-10-16", canonicalName: "GITEX Global 2026" },
  { match: /national day|uae.*national/i, startDate: "2026-12-02", endDate: "2026-12-03", canonicalName: "UAE National Day" },
];

function verifyEventDates(ev: NormalisedEvent): NormalisedEvent | null {
  for (const a of VERIFIED_ANCHORS) {
    if (a.match.test(ev.name)) {
      return {
        ...ev,
        name: a.canonicalName ?? ev.name,
        startDate: a.startDate,
        endDate: a.endDate,
        externalId: ev.externalId ?? `verified:${(a.canonicalName ?? ev.name).toLowerCase().replace(/\s+/g, "-")}`,
        description: ev.description ? `${ev.description} (dates verified)` : "Date-verified anchor event",
      };
    }
  }
  // Non-anchor events: drop ones with an obviously invalid/empty start date.
  if (!ev.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(ev.startDate)) return null;
  return ev;
}

export async function syncEventFeeds(
  orgId: mongoose.Types.ObjectId,
  daysAhead = 90,
  marketCity = "Dubai"
): Promise<SyncResult> {
  await connectDB();

  const result: SyncResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    sources: {},
    errors: [],
  };

  const isDubai = marketCity.toLowerCase() === "dubai";

  // SERP is the primary source for real-time market signals.
  // DTCM static list provides curated annual anchors (GITEX, DSF, Eid, etc.).
  // RSS feeds are supplementary — failures are silently ignored.
  const [
    localFeedSettled,
    serpEventsSettled,
    serpEvents2Settled,
    serpNewsSettled,
    serpRiskSettled,
    ticketmasterSettled,
  ] = await Promise.allSettled([
    // DTCM annual events + RSS feeds (best-effort — failures silently skipped)
    isDubai
      ? Promise.all([
          fetchDTCMEvents(),
          fetchRssFeed(
            process.env.DUBAI_CALENDAR_RSS || "https://www.dubaicalendar.ae/events/feed/",
            "DubaiCalendar"
          ),
          fetchRssFeed(
            process.env.TIMEOUT_DUBAI_RSS || "https://www.timeoutdubai.com/rss/things-to-do",
            "TimeOutDubai"
          ),
        ]).then((arrs) => arrs.flat())
      : Promise.resolve<NormalisedEvent[]>([]),
    // SERP Google Events — broad Dubai events query
    isDubai
      ? fetchSerpGoogleEvents(`events in ${marketCity}`, daysAhead)
      : Promise.resolve<NormalisedEvent[]>([]),
    // SERP Google Events — conferences, exhibitions, festivals (more specific)
    isDubai
      ? fetchSerpGoogleEvents(`${marketCity} conferences exhibitions festivals 2026`, daysAhead)
      : Promise.resolve<NormalisedEvent[]>([]),
    // SERP Google News — demand signals: tourism, travel advisories, hotel demand
    isDubai
      ? fetchSerpDubaiNews(`${marketCity} hotel demand tourism travel 2026`)
      : Promise.resolve<NormalisedEvent[]>([]),
    // SERP Google News — RISK signals: wars, flight cancellations, advisories, closures
    // (these depress demand; captured as negative-impact MarketEvents)
    isDubai
      ? fetchSerpDubaiNews(`${marketCity} flight cancellation travel advisory airport closure conflict warning`)
      : Promise.resolve<NormalisedEvent[]>([]),
    // Ticketmaster Discovery — verified concert/show/event dates (accurate dates)
    fetchTicketmasterEvents(marketCity, daysAhead),
  ]);

  const allEvents: NormalisedEvent[] = [];

  for (const [label, settled] of [
    ["LocalFeeds", localFeedSettled],
    ["SERP_Events", serpEventsSettled],
    ["SERP_Events2", serpEvents2Settled],
    ["SERP_News", serpNewsSettled],
    ["SERP_Risk", serpRiskSettled],
    ["Ticketmaster", ticketmasterSettled],
  ] as [string, PromiseSettledResult<NormalisedEvent[]>][]) {
    if (settled.status === "fulfilled") {
      result.sources[label] = settled.value.length;
      allEvents.push(...settled.value);
    } else {
      result.errors.push(`${label}: ${settled.reason}`);
      result.sources[label] = 0;
      if (String(settled.reason).includes("SERP_RATE_LIMIT")) result.serpRateLimited = true;
    }
  }

  // Purge old orphan SERP docs that were stored without externalId (pre-fix duplicates)
  // These have source=serp but no externalId field — they're unreachable by the dedup filter.
  // Safe to remove: the current sync will re-insert them correctly with externalId.
  await MarketEvent.deleteMany({
    orgId,
    source: "serp",
    externalId: { $exists: false },
  }).catch(() => { /* non-fatal */ });

  // Verify/normalise dates against known UAE anchors (fixes wrong festival dates
  // e.g. Eid, DSS, Ramadan that SERP/news scraping often gets wrong), then dedup.
  const verifiedEvents = allEvents.map(verifyEventDates).filter((e): e is NormalisedEvent => e !== null);
  const seen = new Set<string>();
  const dedupedEvents = verifiedEvents.filter((ev) => {
    const key = ev.externalId ?? `${ev.name}:${ev.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Upsert into MongoDB — use externalId as the dedup key when available
  for (const ev of dedupedEvents) {
    try {
      const filter: Record<string, unknown> = ev.externalId
        ? { orgId, externalId: ev.externalId }
        : { orgId, name: ev.name, startDate: ev.startDate };

      const existing = await MarketEvent.findOne(filter).lean();

      if (existing) {
        await MarketEvent.updateOne(filter, {
          $set: {
            endDate: ev.endDate,
            area: ev.area,
            impactLevel: ev.impactLevel,
            upliftPct: ev.upliftPct,
            description: ev.description,
            ...(ev.sourceUrl && { sourceUrl: ev.sourceUrl }),
            ...(ev.category && { category: ev.category }),
            ...(ev.venue && { venue: ev.venue }),
            ...(ev.attendeeCount && { attendeeCount: ev.attendeeCount }),
            isActive: true,
          },
        });
        result.updated++;
      } else {
        await MarketEvent.create({
          orgId,
          name: ev.name,
          startDate: ev.startDate,
          endDate: ev.endDate,
          area: ev.area,
          areas: [ev.area],
          impactLevel: ev.impactLevel,
          upliftPct: Math.max(0, ev.upliftPct),
          description: ev.description,
          source: ev.source,
          sourceUrl: ev.sourceUrl,
          externalId: ev.externalId,  // stored so re-syncs update not duplicate
          category: ev.category,
          venue: ev.venue,
          attendeeCount: ev.attendeeCount,
          isActive: true,
        });
        result.inserted++;
      }
    } catch (err) {
      result.errors.push(
        `Upsert failed for "${ev.name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.skipped = dedupedEvents.length - result.inserted - result.updated;

  console.log(
    `[EventFeedSyncer] Sync complete — inserted: ${result.inserted}, updated: ${result.updated}, errors: ${result.errors.length}`
  );

  return result;
}
