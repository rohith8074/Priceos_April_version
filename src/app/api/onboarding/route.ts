/**
 * PATCH /api/onboarding
 *
 * Saves onboarding wizard progress to MongoDB.
 * When step === "complete":
 *   - Upserts activated listings into the Listing collection (scoped to orgId)
 *   - Seeds realistic InventoryMaster + Reservation demo data so dashboard shows metrics
 *   - Re-issues the JWT with onboardingStep: "complete" so middleware allows dashboard access
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, signAccessToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { connectDB, Organization, Listing, InventoryMaster, Reservation, MarketEvent, PricingRule } from "@/lib/db";
import mongoose from "mongoose";
import { MARKET_RESEARCH_ID, BENCHMARK_AGENT_ID } from "@/lib/agents/constants";

// ── Helper: detect demo mode ────────────────────────────────────────────────────
function isDemoMode(hostawayApiKey: string | undefined, listingIds: string[]): boolean {
  if (!hostawayApiKey) return true;
  const hasDemoListings = listingIds.some(id => String(id).startsWith("demo-"));
  if (hasDemoListings) return true;
  return false;
}

// ── Market currencies ───────────────────────────────────────────────────────────
const MARKET_CURRENCIES: Record<string, string> = {
  UAE_DXB: "AED",
  GBR_LDN: "GBP",
  GBR_LON: "GBP",
  USA_NYC: "USD",
  USA_MIA: "USD",
  USA_NSH: "USD",
  FRA_PAR: "EUR",
  NLD_AMS: "EUR",
  ESP_BCN: "EUR",
  PRT_LIS: "EUR",
  AUS_SYD: "AUD",
};

// ── Strategy mode guardrail multipliers ─────────────────────────────────────────
const STRATEGY_GUARDRAILS: Record<string, { autoApproveThreshold: number; maxChangePctMultiplier: number; floorMultiplier: number }> = {
  conservative: { autoApproveThreshold: 3,  maxChangePctMultiplier: 0.7, floorMultiplier: 0.6 },
  balanced:     { autoApproveThreshold: 5,  maxChangePctMultiplier: 1.0, floorMultiplier: 0.5 },
  aggressive:   { autoApproveThreshold: 10, maxChangePctMultiplier: 1.5, floorMultiplier: 0.4 },
};

// ── Static fallback market templates (all 10 markets) ──────────────────────────
// Used in demo mode OR as fallback when Lyzr agent fails.
const MARKET_TEMPLATES: Record<string, { currency: string; events: any[]; rules: any[] }> = {
  UAE_DXB: {
    currency: "AED",
    events: [
      { name: "Dubai Shopping Festival",  startOffset: 10,  endOffset: 40,  impactLevel: "high",     upliftPct: 30 },
      { name: "Eid Al Fitr",              startOffset: 45,  endOffset: 48,  impactLevel: "high",     upliftPct: 30 },
      { name: "GITEX Global",             startOffset: 120, endOffset: 125, impactLevel: "high",     upliftPct: 35 },
      { name: "Dubai Airshow",            startOffset: 200, endOffset: 205, impactLevel: "critical", upliftPct: 50 },
      { name: "Ramadan",                  startOffset: 55,  endOffset: 85,  impactLevel: "low",      upliftPct: -10 },
      { name: "UAE National Day",         startOffset: 250, endOffset: 252, impactLevel: "high",     upliftPct: 25 },
    ],
    rules: [
      { name: "Weekend Uplift",        ruleType: "DOW",       priority: 1, priceAdjPct: 20,  daysOfWeek: [4, 5] },
      { name: "Last-Minute Discount",  ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
      { name: "Far-out Markup",        ruleType: "LEAD_TIME", priority: 3, priceAdjPct: 5   },
    ],
  },
  GBR_LDN: {
    currency: "GBP",
    events: [
      { name: "Wimbledon",             startOffset: 60,  endOffset: 74,  impactLevel: "high",     upliftPct: 40 },
      { name: "Chelsea Flower Show",   startOffset: 50,  endOffset: 54,  impactLevel: "medium",   upliftPct: 20 },
      { name: "London Marathon",       startOffset: 30,  endOffset: 30,  impactLevel: "medium",   upliftPct: 25 },
      { name: "NYE London",            startOffset: 340, endOffset: 365, impactLevel: "high",     upliftPct: 35 },
    ],
    rules: [
      { name: "Weekend Uplift",        ruleType: "DOW",       priority: 1, priceAdjPct: 15, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount",  ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -12 },
    ],
  },
  // alias for wizard code (uses GBR_LON)
  GBR_LON: {
    currency: "GBP",
    events: [
      { name: "Wimbledon",             startOffset: 60,  endOffset: 74,  impactLevel: "high",   upliftPct: 40 },
      { name: "London Marathon",       startOffset: 30,  endOffset: 30,  impactLevel: "medium", upliftPct: 25 },
      { name: "NYE London",            startOffset: 340, endOffset: 365, impactLevel: "high",   upliftPct: 35 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 15, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -12 },
    ],
  },
  USA_NYC: {
    currency: "USD",
    events: [
      { name: "UN General Assembly",       startOffset: 90,  endOffset: 97,  impactLevel: "critical", upliftPct: 60 },
      { name: "NYC Marathon",              startOffset: 100, endOffset: 100, impactLevel: "high",     upliftPct: 35 },
      { name: "New York Fashion Week",     startOffset: 40,  endOffset: 47,  impactLevel: "high",     upliftPct: 30 },
      { name: "NYE Times Square",          startOffset: 355, endOffset: 365, impactLevel: "critical", upliftPct: 70 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 25, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  FRA_PAR: {
    currency: "EUR",
    events: [
      { name: "Roland Garros (French Open)", startOffset: 60,  endOffset: 73,  impactLevel: "high",   upliftPct: 35 },
      { name: "Paris Fashion Week",          startOffset: 40,  endOffset: 47,  impactLevel: "high",   upliftPct: 30 },
      { name: "Bastille Day",                startOffset: 105, endOffset: 105, impactLevel: "medium", upliftPct: 20 },
      { name: "Christmas Markets Paris",     startOffset: 330, endOffset: 355, impactLevel: "medium", upliftPct: 15 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 15, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  NLD_AMS: {
    currency: "EUR",
    events: [
      { name: "King's Day",           startOffset: 25,  endOffset: 25,  impactLevel: "high",     upliftPct: 50 },
      { name: "Tulip Festival",       startOffset: 15,  endOffset: 45,  impactLevel: "medium",   upliftPct: 25 },
      { name: "Pride Amsterdam",      startOffset: 120, endOffset: 127, impactLevel: "high",     upliftPct: 40 },
      { name: "Amsterdam Dance Event",startOffset: 200, endOffset: 205, impactLevel: "high",     upliftPct: 45 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 20, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  ESP_BCN: {
    currency: "EUR",
    events: [
      { name: "MWC Barcelona",        startOffset: 25,  endOffset: 28,  impactLevel: "critical", upliftPct: 55 },
      { name: "Primavera Sound",      startOffset: 90,  endOffset: 95,  impactLevel: "high",     upliftPct: 35 },
      { name: "Sonar Festival",       startOffset: 105, endOffset: 107, impactLevel: "high",     upliftPct: 30 },
      { name: "La Merce Festival",    startOffset: 175, endOffset: 177, impactLevel: "medium",   upliftPct: 20 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 20, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  USA_MIA: {
    currency: "USD",
    events: [
      { name: "Art Basel Miami",       startOffset: 10,  endOffset: 14,  impactLevel: "critical", upliftPct: 70 },
      { name: "Ultra Music Festival",  startOffset: 80,  endOffset: 82,  impactLevel: "high",     upliftPct: 45 },
      { name: "Miami Open (Tennis)",   startOffset: 70,  endOffset: 83,  impactLevel: "high",     upliftPct: 35 },
      { name: "Spring Break Season",   startOffset: 55,  endOffset: 70,  impactLevel: "high",     upliftPct: 30 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 25, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  PRT_LIS: {
    currency: "EUR",
    events: [
      { name: "Web Summit",           startOffset: 90,  endOffset: 93,  impactLevel: "critical", upliftPct: 60 },
      { name: "NOS Alive Festival",   startOffset: 105, endOffset: 107, impactLevel: "high",     upliftPct: 40 },
      { name: "Santo António Festival",startOffset: 80, endOffset: 80,  impactLevel: "medium",   upliftPct: 25 },
      { name: "Rock in Rio Lisboa",   startOffset: 120, endOffset: 123, impactLevel: "high",     upliftPct: 35 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 18, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  USA_NSH: {
    currency: "USD",
    events: [
      { name: "CMA Music Festival",   startOffset: 90,  endOffset: 93,  impactLevel: "critical", upliftPct: 75 },
      { name: "Nashville Marathon",   startOffset: 30,  endOffset: 30,  impactLevel: "high",     upliftPct: 35 },
      { name: "Nashville NYE",        startOffset: 355, endOffset: 365, impactLevel: "high",     upliftPct: 50 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 30, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
  AUS_SYD: {
    currency: "AUD",
    events: [
      { name: "NYE Sydney Harbour",   startOffset: 355, endOffset: 365, impactLevel: "critical", upliftPct: 80 },
      { name: "Sydney Festival",      startOffset: 10,  endOffset: 30,  impactLevel: "high",     upliftPct: 30 },
      { name: "Vivid Sydney",         startOffset: 100, endOffset: 121, impactLevel: "high",     upliftPct: 35 },
      { name: "Mardi Gras Sydney",    startOffset: 55,  endOffset: 56,  impactLevel: "high",     upliftPct: 40 },
    ],
    rules: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 20, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  },
};

async function seedMarketTemplate(orgId: string, marketCode: string, activatedListingIds: string[]) {
  const template = MARKET_TEMPLATES[marketCode] || MARKET_TEMPLATES["UAE_DXB"];
  const orgObjectId = new mongoose.Types.ObjectId(orgId);
  
  // Seed Events
  if (template.events) {
    for (const evt of template.events) {
      const today = new Date();
      const start = new Date(today); start.setDate(today.getDate() + evt.startOffset);
      const end = new Date(today); end.setDate(today.getDate() + evt.endOffset);
      
      await MarketEvent.updateOne(
        { orgId: orgObjectId, name: evt.name },
        {
          $set: {
            startDate: start.toISOString().split("T")[0],
            endDate: end.toISOString().split("T")[0],
            impactLevel: evt.impactLevel,
            upliftPct: evt.upliftPct,
            isActive: true,
            description: `Auto-seeded from ${marketCode} template`
          }
        },
        { upsert: true }
      );
    }
  }

  // Seed Rules
  if (template.rules && activatedListingIds.length > 0) {
    for (const listingId of activatedListingIds) {
      let listingObjectId: mongoose.Types.ObjectId;

      // Validate or resolve listingId
      if (mongoose.Types.ObjectId.isValid(listingId)) {
        listingObjectId = new mongoose.Types.ObjectId(listingId);
      } else {
        // Try resolving Hostaway ID to MongoDB _id
        const found = await mongoose.model("Listing").findOne({ 
          orgId: orgObjectId, 
          $or: [
            { hostawayId: listingId },
            { hostawayId: String(listingId) }
          ]
        }).select("_id").lean();
        
        if (!found) {
          console.warn(`[Onboarding] Could not resolve listingId "${listingId}" to a MongoDB ObjectId. Skipping rules.`);
          continue;
        }
        listingObjectId = found._id as mongoose.Types.ObjectId;
      }

      for (const rule of template.rules) {
        await PricingRule.updateOne(
          { orgId: orgObjectId, listingId: listingObjectId, name: rule.name },
          {
            $set: {
              ruleType: rule.ruleType,
              priority: rule.priority,
              priceAdjPct: rule.priceAdjPct,
              daysOfWeek: rule.daysOfWeek,
              enabled: true,
            }
          },
          { upsert: true }
        );
      }
    }
  }
}

// ── Server-side Lyzr Agent caller ─────────────────────────────────────────────
// Calls Lyzr Studio API directly from the Node.js server (no Python backend needed
// for onboarding since there is no authenticated browser session at this point).
async function callLyzrAgent(agentId: string, message: string): Promise<string> {
  const LYZR_API_URL = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";
  const LYZR_API_KEY = process.env.LYZR_API_KEY;

  if (!LYZR_API_KEY) {
    throw new Error("LYZR_API_KEY not configured in environment");
  }

  const res = await fetch(LYZR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": LYZR_API_KEY,
    },
    body: JSON.stringify({
      agent_id: agentId,
      message,
      // session per onboarding run to avoid cross-context bleed
      session_id: `onboarding-${agentId}-${Date.now()}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lyzr API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  // Lyzr response: data.response or data.message or data.output
  return data?.response || data?.message || data?.output || JSON.stringify(data);
}

// ── Live Market Data Seeder (Real Hostaway Users via Lyzr Agents) ──────────────
// Calls the Lyzr Market Research Agent (MARKET_RESEARCH_ID) and Benchmark Agent
// (BENCHMARK_AGENT_ID) to pull real-world event intelligence for the selected city.
// Results are parsed and persisted to MongoDB MarketEvent + PricingRule collections.
async function seedLiveMarketData(
  orgId: string,
  marketCode: string,
  activatedListingIds: string[],
  _hostawayApiKey?: string
) {
  const orgObjectId = new mongoose.Types.ObjectId(orgId);
  const today = new Date();
  const sixMonthsLater = new Date(today);
  sixMonthsLater.setDate(today.getDate() + 180);
  const dateFrom = today.toISOString().split("T")[0];
  const dateTo = sixMonthsLater.toISOString().split("T")[0];

  // Map marketCode → human-readable city for the agent prompts
  const CITY_MAP: Record<string, string> = {
    UAE_DXB: "Dubai",
    GBR_LDN: "London",
    USA_NYC: "New York",
    USA_MIA: "Miami",
    USA_NAS: "Nashville",
    FRA_PAR: "Paris",
    NLD_AMS: "Amsterdam",
    ESP_BCN: "Barcelona",
    PRT_LIS: "Lisbon",
    AUS_SYD: "Sydney",
  };
  const city = CITY_MAP[marketCode] || "Dubai";

  console.log(`[Onboarding/Lyzr] 🔴 Invoking Market Research Agent (${MARKET_RESEARCH_ID}) for city: ${city}`);

  try {
    // ── Step 1: Ask Market Research Agent for events in this city ────────────
    const eventsPrompt = `You are onboarding a new property manager in ${city}.

Find all major events, public holidays, conferences, and tourism demand signals for ${city} between ${dateFrom} and ${dateTo} that would affect short-term rental pricing.

Return a JSON array (no markdown, no code blocks) with this exact structure:
[
  {
    "name": "Event Name",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "impactLevel": "critical" | "high" | "moderate",
    "upliftPct": <number 5-60>,
    "description": "Brief description of the event and its effect on accommodation demand"
  }
]

Only return the JSON array. No explanation.`;

    const eventsRaw = await callLyzrAgent(MARKET_RESEARCH_ID, eventsPrompt);
    console.log(`[Onboarding/Lyzr] ✅ Market Research Agent responded (${eventsRaw.length} chars).`);

    // Parse the JSON array from the agent response
    let parsedEvents: any[] = [];
    try {
      // Strip markdown code fences if the agent wrapped in them
      const jsonStr = eventsRaw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (match) parsedEvents = JSON.parse(match[0]);
    } catch (parseErr) {
      console.warn("[Onboarding/Lyzr] Could not parse events JSON from agent, falling back to static.", parseErr);
    }

    // ── Step 2: Save parsed events into MarketEvent collection ───────────────
    if (parsedEvents.length > 0) {
      console.log(`[Onboarding/Lyzr] 💾 Persisting ${parsedEvents.length} events from Lyzr Market Research Agent.`);
      for (const evt of parsedEvents) {
        if (!evt.name || !evt.startDate) continue;
        await MarketEvent.updateOne(
          { orgId: orgObjectId, name: evt.name },
          {
            $set: {
              startDate: evt.startDate,
              endDate: evt.endDate || evt.startDate,
              impactLevel: evt.impactLevel || "moderate",
              upliftPct: Number(evt.upliftPct) || 10,
              isActive: true,
              description: `[Lyzr Market Research Agent] ${evt.description || ""}`,
            },
          },
          { upsert: true }
        );
      }
    } else {
      // Fallback to static template if Lyzr returned unparseable data
      console.warn("[Onboarding/Lyzr] No parseable events from Lyzr — using static fallback template.");
      const staticTemplate = MARKET_TEMPLATES[marketCode] || MARKET_TEMPLATES["UAE_DXB"];
      for (const evt of (staticTemplate.events || [])) {
        const start = new Date(today); start.setDate(today.getDate() + evt.startOffset);
        const end = new Date(today); end.setDate(today.getDate() + evt.endOffset);
        await MarketEvent.updateOne(
          { orgId: orgObjectId, name: evt.name },
          { $set: { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0], impactLevel: evt.impactLevel, upliftPct: evt.upliftPct, isActive: true, description: `Static fallback from ${marketCode} template` } },
          { upsert: true }
        );
      }
    }

    // ── Step 3: Ask Benchmark Agent for market rate context ───────────────────
    console.log(`[Onboarding/Lyzr] 📊 Invoking Benchmark Agent (${BENCHMARK_AGENT_ID}) for ${city} baseline rates.`);
    try {
      const ratesPrompt = `Provide a concise market rate overview for short-term rental properties in ${city} for the period ${dateFrom} to ${dateTo}.
Return a JSON object (no markdown) with:
{
  "weekday_avg": <AED or local currency nightly rate>,
  "weekend_avg": <AED or local currency nightly rate>,
  "occupancy_trend": "increasing" | "stable" | "decreasing",
  "demand_level": "high" | "medium" | "low",
  "notes": "1-2 sentence summary"
}`;
      const ratesRaw = await callLyzrAgent(BENCHMARK_AGENT_ID, ratesPrompt);
      console.log(`[Onboarding/Lyzr] ✅ Benchmark Agent responded: ${ratesRaw.substring(0, 200)}`);
    } catch (benchErr) {
      console.warn("[Onboarding/Lyzr] Benchmark Agent call failed (non-fatal):", benchErr);
    }

  } catch (agentErr) {
    // Non-fatal: always fall back to static so onboarding never breaks
    console.warn("[Onboarding/Lyzr] Lyzr Agent pipeline error — falling back to static template.", agentErr);
    await seedMarketTemplate(orgId, marketCode, activatedListingIds);
  }

  // ── Always seed PricingRules (market-specific guardrails are always needed) ─
  const PRICING_RULES_BY_MARKET: Record<string, any[]> = {
    UAE_DXB: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 20,  daysOfWeek: [4, 5] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
      { name: "Far-out Markup",       ruleType: "LEAD_TIME", priority: 3, priceAdjPct: 5   },
    ],
    GBR_LDN: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 15, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -12 },
    ],
    default: [
      { name: "Weekend Uplift",       ruleType: "DOW",       priority: 1, priceAdjPct: 15, daysOfWeek: [5, 6] },
      { name: "Last-Minute Discount", ruleType: "LEAD_TIME", priority: 2, priceAdjPct: -10 },
    ],
  };

  const rules = PRICING_RULES_BY_MARKET[marketCode] || PRICING_RULES_BY_MARKET["default"];
  for (const listingId of activatedListingIds) {
    if (!mongoose.Types.ObjectId.isValid(listingId)) continue;
    const listingObjectId = new mongoose.Types.ObjectId(listingId);
    for (const rule of rules) {
      await PricingRule.updateOne(
        { orgId: orgObjectId, listingId: listingObjectId, name: rule.name },
        { $set: { ruleType: rule.ruleType, priority: rule.priority, priceAdjPct: rule.priceAdjPct, daysOfWeek: rule.daysOfWeek, enabled: true } },
        { upsert: true }
      );
    }
  }

  console.log(`[Onboarding/Lyzr] ✅ Live Lyzr agent seeding complete for orgId: ${orgId}`);
}

// ── Demo data seeder ──────────────────────────────────────────────────────────
async function seedDemoData(
  orgId: string,
  listingDbIds: mongoose.Types.ObjectId[]
) {
  const orgObjectId = new mongoose.Types.ObjectId(orgId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Base price ranges per listing index (realistic Dubai STR pricing)
  const basePrices = [850, 650, 1200, 3500, 480, 720, 550, 2800];

  const inventoryOps: any[] = [];
  const reservationOps: any[] = [];

  listingDbIds.forEach((listingId, idx) => {
    const basePrice = basePrices[idx % basePrices.length];

    // Seed 90 days of InventoryMaster (calendar) data
    for (let d = 0; d < 90; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dateStr = date.toISOString().split("T")[0];

      // Realistic occupancy: ~65% booked, some blocked
      const rand = Math.random();
      let status: "available" | "booked" | "blocked";
      if (rand < 0.62) status = "booked";
      else if (rand < 0.68) status = "blocked";
      else status = "available";

      // Weekend premium (Thu=4, Fri=5 for Dubai)
      const dayOfWeek = date.getDay();
      const weekendMultiplier = (dayOfWeek === 4 || dayOfWeek === 5) ? 1.25 : 1;
      // Some seasonal variation
      const seasonalMultiplier = (d < 30) ? 1.1 : (d < 60) ? 1.0 : 0.9;
      const price = Math.round(basePrice * weekendMultiplier * seasonalMultiplier);

      inventoryOps.push({
        updateOne: {
          filter: { orgId: orgObjectId, listingId, date: dateStr },
          update: {
            $setOnInsert: {
              orgId: orgObjectId,
              listingId,
              date: dateStr,
              currentPrice: price,
              basePrice: basePrice,
              status,
              minStay: 2,
              maxStay: 30,
            },
          },
          upsert: true,
        },
      });
    }

    // Seed 8 realistic reservations per listing
    const guestNames = [
      "Ahmed Al Mansouri", "Sarah Johnson", "Mohammed Al Rashid",
      "Emma Williams", "Khalid Al Qasimi", "Natasha Ivanova",
      "James Chen", "Fatima Al Hashimi"
    ];
    const channels = ["Airbnb", "Booking.com", "VRBO", "Direct", "Airbnb", "Booking.com", "Direct", "Airbnb"];

    let cursor = 5; // start 5 days from now
    for (let r = 0; r < 5; r++) {
      const stayLength = 3 + Math.floor(Math.random() * 5); // 3-7 nights
      const checkInDate = new Date(today);
      checkInDate.setDate(today.getDate() + cursor);
      const checkOutDate = new Date(checkInDate);
      checkOutDate.setDate(checkInDate.getDate() + stayLength);

      const checkIn = checkInDate.toISOString().split("T")[0];
      const checkOut = checkOutDate.toISOString().split("T")[0];
      const totalPrice = basePrice * stayLength;

      reservationOps.push({
        updateOne: {
          filter: {
            orgId: orgObjectId,
            listingId,
            checkIn,
          },
          update: {
            $setOnInsert: {
              orgId: orgObjectId,
              listingId,
              guestName: guestNames[(idx + r) % guestNames.length],
              checkIn,
              checkOut,
              nights: stayLength,
              guests: 2,
              totalPrice,
              channelName: channels[(idx + r) % channels.length],
              status: "confirmed",
            },
          },
          upsert: true,
        },
      });

      cursor += stayLength + 1 + Math.floor(Math.random() * 3); // gap between bookings
    }
  });

  // Bulk write — non-fatal if data already exists
  try {
    if (inventoryOps.length > 0) await InventoryMaster.bulkWrite(inventoryOps, { ordered: false });
    if (reservationOps.length > 0) await Reservation.bulkWrite(reservationOps, { ordered: false });
    console.log(`[Onboarding] Seeded ${inventoryOps.length} inventory + ${reservationOps.length} reservation records`);
  } catch (err) {
    console.warn("[Onboarding] Demo seed warning (non-fatal):", err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await req.json();
    const { step, selectedListingIds, activatedListingIds, marketCode, listings, strategy } = body;

    await connectDB();

    const updates: Record<string, unknown> = {};

    if (step) updates["onboarding.step"] = step;
    if (selectedListingIds) updates["onboarding.selectedListingIds"] = selectedListingIds;
    if (activatedListingIds) updates["onboarding.activatedListingIds"] = activatedListingIds;
    if (marketCode) updates.marketCode = marketCode;
    if (listings) updates["onboarding.listings"] = listings;

    if (step === "complete") {
      updates["onboarding.completedAt"] = new Date();

      const finalMarketCode = marketCode || "UAE_DXB";
      const currency = MARKET_CURRENCIES[finalMarketCode] || "AED";

      // ── Resolve strategy guardrails ────────────────────────────────────────
      const strategyKey = (strategy && STRATEGY_GUARDRAILS[strategy]) ? strategy : "conservative";
      const strategyOpts = STRATEGY_GUARDRAILS[strategyKey];

      // Read market defaults from MarketTemplate collection, fall back to hardcoded values
      const marketTmpl = await (await import("@/lib/db")).MarketTemplate
        .findOne({ marketCode: finalMarketCode })
        .select("guardrailDefaults")
        .lean();
      const baseGuardrails = marketTmpl?.guardrailDefaults ?? {
        maxSingleDayChangePct: 15,
        autoApproveThreshold: 5,
        absoluteFloorMultiplier: 0.5,
        absoluteCeilingMultiplier: 3.0,
      };

      const appliedGuardrails = {
        maxSingleDayChangePct:    Math.round(baseGuardrails.maxSingleDayChangePct * strategyOpts.maxChangePctMultiplier),
        autoApproveThreshold:     strategyOpts.autoApproveThreshold,
        absoluteFloorMultiplier:  strategyOpts.floorMultiplier,
        absoluteCeilingMultiplier: baseGuardrails.absoluteCeilingMultiplier,
      };

      // Apply to org settings
      updates["settings.guardrails.maxSingleDayChangePct"]    = appliedGuardrails.maxSingleDayChangePct;
      updates["settings.guardrails.autoApproveThreshold"]     = appliedGuardrails.autoApproveThreshold;
      updates["settings.guardrails.absoluteFloorMultiplier"]  = appliedGuardrails.absoluteFloorMultiplier;
      updates["settings.guardrails.absoluteCeilingMultiplier"]= appliedGuardrails.absoluteCeilingMultiplier;
      updates["settings.strategy"] = strategyKey;

      console.log(`[Onboarding] Guardrails applied — strategy: ${strategyKey}, market: ${finalMarketCode}`, appliedGuardrails);

      if (listings && Array.isArray(listings) && listings.length > 0) {
        // Market-specific base price defaults
        const BASE_PRICES: Record<string, { price: number; priceFloor: number; priceCeiling: number }> = {
          AED: { price: 500,  priceFloor: 250,  priceCeiling: 3000 },
          GBP: { price: 150,  priceFloor: 80,   priceCeiling: 800  },
          USD: { price: 200,  priceFloor: 100,  priceCeiling: 1000 },
          EUR: { price: 180,  priceFloor: 90,   priceCeiling: 900  },
          AUD: { price: 250,  priceFloor: 120,  priceCeiling: 1200 },
        };
        const priceDefaults = BASE_PRICES[currency] || BASE_PRICES["USD"];

        const orgSuffix = payload.orgId.toString().slice(-8);
        const ops = listings.map((l: {
          id: string; name: string; bedrooms?: number; city?: string; type?: string;
        }) => ({
          updateOne: {
            filter: {
              hostawayId: `${orgSuffix}_${l.id}`,
              orgId: new mongoose.Types.ObjectId(payload.orgId),
            },
            update: {
              $setOnInsert: {
                hostawayId:      `${orgSuffix}_${l.id}`,
                orgId:           new mongoose.Types.ObjectId(payload.orgId),
                name:            l.name,
                city:            l.city || "",
                area:            l.city || "",
                bedroomsNumber:  l.bedrooms || 0,
                bathroomsNumber: 1,
                propertyTypeId:  0,
                price:           priceDefaults.price,
                priceFloor:      priceDefaults.priceFloor,
                priceCeiling:    priceDefaults.priceCeiling,
                currencyCode:    currency,
                isActive:        true,
              },
            },
            upsert: true,
          },
        }));

        try {
          await Listing.bulkWrite(ops);
        } catch (listingErr) {
          console.warn("[Onboarding] Listing upsert warning:", listingErr);
        }

        const hostawayIds = listings.map((l: { id: string }) => `${orgSuffix}_${l.id}`);
        const seededListings = await Listing.find({
          orgId: new mongoose.Types.ObjectId(payload.orgId),
          hostawayId: { $in: hostawayIds },
        }).select("_id").lean();

        if (seededListings.length > 0) {
          await seedDemoData(
            payload.orgId,
            seededListings.map(l => l._id as mongoose.Types.ObjectId)
          );
        }
      }

      // ── Seed market data: Live Agents vs Demo mode ─────────────────────────
      const orgForMode = await Organization.findById(payload.orgId).select("hostawayApiKey").lean();
      const hostawayKey = orgForMode?.hostawayApiKey;
      const resolvedListingIds = activatedListingIds || selectedListingIds || [];
      const rawListingIds = listings?.map((l: { id: string }) => l.id) ?? resolvedListingIds;
      const demo = isDemoMode(hostawayKey, rawListingIds);

      if (demo) {
        console.log("[Onboarding] 🎮 Demo mode — seeding static market template.");
        await seedMarketTemplate(payload.orgId, finalMarketCode, resolvedListingIds);
      } else {
        console.log("[Onboarding] 🔴 Live mode — invoking Lyzr agents for real market data.");
        await seedLiveMarketData(payload.orgId, finalMarketCode, resolvedListingIds, orgForMode?.hostawayApiKey);
      }
    }

    await Organization.findByIdAndUpdate(payload.orgId, { $set: updates });

    // Re-issue JWT with updated onboardingStep
    const updatedStep = step ?? payload.onboardingStep;
    const newToken = signAccessToken({
      userId: payload.userId,
      orgId: payload.orgId,
      email: payload.email,
      role: payload.role,
      isApproved: payload.isApproved,
      onboardingStep: updatedStep,
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;

  } catch (e: unknown) {
    console.error("[Onboarding] PATCH error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/onboarding
 * Returns current onboarding state for the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    await connectDB();
    const org = await Organization.findById(payload.orgId).select("onboarding marketCode").lean();
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      step: org.onboarding?.step ?? "connect",
      selectedListingIds: org.onboarding?.selectedListingIds ?? [],
      activatedListingIds: org.onboarding?.activatedListingIds ?? [],
      marketCode: org.marketCode,
    });
  } catch (e: unknown) {
    console.error("[Onboarding] GET error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
