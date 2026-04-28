import { getEnv } from "@/lib/env";

const BASE = 'https://crap0y5bx5.execute-api.us-east-2.amazonaws.com/prod';

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = getEnv("AIRBTICS_API_KEY");
  if (!key) {
    throw new Error("AIRBTICS_API_KEY is not defined");
  }

  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': key },
    next: { revalidate: 0 } // we handle caching ourselves
  });
  
  if (!res.ok) {
    throw new Error(`Airbtics ${res.status}: ${path} - ${await res.text()}`);
  }
  return res.json();
}

export const airbtics = {
  // One-time setup
  searchMarket: (query: string, countryCode: string) =>
    get<any>('/markets/search', { query, country_code: countryCode }),

  // Core market intelligence — used in pipeline
  getMarketSummary: (marketId: string, bedrooms: string) =>
    get<any>('/markets/summary', { market_id: marketId, bedrooms }),

  getMarketMetrics: (marketId: string, bedrooms: string, months = '12') =>
    get<any>('/markets/metrics/all', { market_id: marketId, bedrooms, number_of_months: months }),

  getFuturePacing: (marketId: string, bedrooms: string) =>
    get<any>('/markets/metrics/future-pacing', { market_id: marketId, bedrooms }),

  // Comp set builder
  searchListingsByBounds: async (bounds: { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number }, bedrooms: number) => {
    const key = getEnv("AIRBTICS_API_KEY");
    const res = await fetch(`${BASE}/listings/search/bounds`, {
      method: 'POST',
      headers: { 'x-api-key': key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bounds, bedrooms, page: 1 })
    });
    if (!res.ok) {
      throw new Error(`Airbtics ${res.status}: /listings/search/bounds - ${await res.text()}`);
    }
    return res.json();
  },

  // Onboarding revenue projection (call once per property)
  generateRevenueReport: async (lat: number, lng: number, bedrooms: number) => {
    const key = getEnv("AIRBTICS_API_KEY");
    const res = await fetch(`${BASE}/report/all`, {
      method: 'POST',
      headers: { 'x-api-key': key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lng, bedrooms })
    });
    if (!res.ok) {
        throw new Error(`Airbtics ${res.status}: /report/all - ${await res.text()}`);
    }
    return res.json();
  },

  getReport: (reportId: string) =>
    get<any>('/report', { report_id: reportId }),
};
