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
  source: "eventbrite" | "ticketmaster" | "dtcm" | "ai_detected" | "manual" | "market_template";
  externalId?: string; // source-specific ID for deduplication
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

async function fetchRssFeed(
  feedUrl: string,
  sourceName: string
): Promise<NormalisedEvent[]> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.warn(`[EventFeedSyncer] ${sourceName} RSS returned ${res.status}`);
      return [];
    }

    const xml = await res.text();
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
  } catch (err) {
    console.warn(`[EventFeedSyncer] ${sourceName} RSS error:`, err);
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

/**
 * Fetches events from all configured sources and upserts into MarketEvent.
 *
 * @param orgId      - MongoDB ObjectId of the organisation (for multi-tenancy)
 * @param daysAhead  - How far ahead to fetch (default 90 days)
 * @param marketCity - City name from MarketTemplate.eventApiConfig.eventbriteCity
 *                     Defaults to "Dubai" if not provided (backwards-compatible)
 */
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

  // Fetch from all sources in parallel.
  // Dubai gets DTCM + local RSS feeds; all cities get Eventbrite + Ticketmaster.
  const [eventbriteSettled, ticketmasterSettled, localFeedSettled] =
    await Promise.allSettled([
      fetchEventbriteEvents(daysAhead, marketCity),
      fetchTicketmasterEvents(marketCity, daysAhead),
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
    ]);

  const allEvents: NormalisedEvent[] = [];

  for (const [label, settled] of [
    ["Eventbrite", eventbriteSettled],
    ["Ticketmaster", ticketmasterSettled],
    ["LocalFeeds", localFeedSettled],
  ] as [string, PromiseSettledResult<NormalisedEvent[]>][]) {
    if (settled.status === "fulfilled") {
      result.sources[label] = settled.value.length;
      allEvents.push(...settled.value);
    } else {
      result.errors.push(`${label}: ${settled.reason}`);
      result.sources[label] = 0;
    }
  }

  // Deduplicate by externalId within the batch
  const seen = new Set<string>();
  const dedupedEvents = allEvents.filter((ev) => {
    const key = ev.externalId ?? `${ev.name}:${ev.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Upsert into MongoDB
  for (const ev of dedupedEvents) {
    try {
      const filter: Record<string, unknown> = ev.externalId
        ? { orgId, "metadata.externalId": ev.externalId }
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
          upliftPct: Math.max(0, ev.upliftPct), // don't store negative uplift
          description: ev.description,
          source: ev.source,
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
