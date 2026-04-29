import { connectDB } from "@/lib/db";
import { AirbticsCache } from "@/lib/db/models/AirbticsCache";
import { airbtics } from "./client";

export interface AirbticsMarketContext {
  marketId: string;
  bedrooms: number;
  summary: any;
  pacing: any[];
  marketMetrics: any;
  timestamp: string;
}

// Memory cache dictionary for fast pipeline execution across 100s of listings
const MEMORY_CACHE = new Map<string, { expiresAt: number; data: any }>();

async function getCached<T>(
  key: string,
  ttlHours: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // 1. Check in-memory cache (ultra-fast)
  const memCached = MEMORY_CACHE.get(key);
  if (memCached && Date.now() < memCached.expiresAt) {
    return memCached.data as T;
  }

  // 2. Check Database cache (avoids costly API calls if another Vercel instance fetched it)
  await connectDB();
  const dbCached = await AirbticsCache.findOne({ cacheKey: key }).lean();
  if (dbCached && dbCached.expiresAt.getTime() > Date.now()) {
    // Populate memory cache
    MEMORY_CACHE.set(key, {
      expiresAt: dbCached.expiresAt.getTime(),
      data: dbCached.data,
    });
    return dbCached.data as T;
  }

  // 3. Fetch from Airbtics API
  console.log(`[Airbtics] Cache MISS for ${key} - Fetching from API...`);
  const data = await fetcher();

  // 4. Save to DB Cache & Memory Cache
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  
  await AirbticsCache.findOneAndUpdate(
    { cacheKey: key },
    { cacheKey: key, data, expiresAt },
    { upsert: true, returnDocument: "after" }
  );

  MEMORY_CACHE.set(key, { expiresAt: expiresAt.getTime(), data });
  
  return data;
}

/**
 * Generic cache helper — lets other modules (e.g. market-setup route) reuse
 * the same DB+memory cache infrastructure without duplicating logic.
 */
export async function getCachedData<T>(
  key: string,
  ttlHours: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return getCached(key, ttlHours, fetcher);
}

/**
 * Write a value directly into the cache without fetching.
 * Used to mark "we just ran X, skip it for the next N hours".
 */
export async function setCachedData(key: string, ttlHours: number, data: unknown): Promise<void> {
  await connectDB();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await AirbticsCache.findOneAndUpdate(
    { cacheKey: key },
    { cacheKey: key, data, expiresAt },
    { upsert: true }
  );
  MEMORY_CACHE.set(key, { expiresAt: expiresAt.getTime(), data });
}

/**
 * Returns cached data only — null if not in cache or expired.
 * Used to check "has this already been done recently?" without fetching.
 */
export async function peekCachedData<T>(key: string): Promise<T | null> {
  const mem = MEMORY_CACHE.get(key);
  if (mem && Date.now() < mem.expiresAt) return mem.data as T;

  await connectDB();
  const db = await AirbticsCache.findOne({ cacheKey: key }).lean();
  if (db && db.expiresAt.getTime() > Date.now()) {
    MEMORY_CACHE.set(key, { expiresAt: db.expiresAt.getTime(), data: db.data });
    return db.data as T;
  }
  return null;
}

/**
 * Generates or fetches the consolidated market intelligence for the Pricing Pipeline.
 * Enforces caching automatically.
 */
export async function getMarketContext(
  marketId: string,
  bedrooms: number
): Promise<AirbticsMarketContext> {
  const bdrStr = bedrooms.toString();
  
  // Market Summary: High TTL (24h) - very slow moving metrics
  const summaryKey = `airbtics:summary:${marketId}:${bdrStr}`;
  const summaryPromise = getCached(summaryKey, 24, () =>
    airbtics.getMarketSummary(marketId, bdrStr)
  );

  // Market Metrics (Percentiles): Medium TTL (12h) - slow moving metrics
  const metricsKey = `airbtics:metrics:${marketId}:${bdrStr}`;
  const metricsPromise = getCached(metricsKey, 12, () =>
    airbtics.getMarketMetrics(marketId, bdrStr, '12')
  );

  // Future Booking Pacing: Low TTL (6h) - fast moving demand signal
  const pacingKey = `airbtics:pacing:${marketId}:${bdrStr}`;
  const pacingPromise = getCached(pacingKey, 6, () =>
    airbtics.getFuturePacing(marketId, bdrStr)
  );

  // Await all securely
  const [summary, marketMetrics, pacing] = await Promise.all([
    summaryPromise,
    metricsPromise,
    pacingPromise,
  ]);

  return {
    marketId,
    bedrooms,
    summary,
    pacing: pacing?.data || [], // Handle Airbtics output format
    marketMetrics,
    timestamp: new Date().toISOString(),
  };
}
