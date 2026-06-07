/**
 * Precompute Orchestrator
 *
 * Runs the five worker agents STRICTLY SEQUENTIALLY. Each agent receives:
 *   - raw DB data (listing profile, calendar, reservations, market events)
 *     pre-fetched once at the top of the run — eliminates the agents' need to
 *     call live tools, which was causing PropertyAnalyst to hit Lyzr's
 *     max-tool-call limit
 *   - the full structured-output JSON of every prior agent in the pipeline,
 *     injected as labelled [UPSTREAM_*] blocks in the prompt
 *
 * Execution order:
 *   1. PropertyAnalyst    — receives raw data
 *   2. BookingIntelligence — receives raw data + PropertyAnalyst
 *   3. MarketResearch      — receives raw data + Property + Booking
 *   4. PriceGuard          — receives raw data + Property + Booking + Market
 *   5. AnomalyDetector     — receives raw data + all four prior outputs
 *
 * Each agent's strict JSON output is upserted into the AgentCache collection
 * keyed by (orgId, listingId, dateFrom, dateTo, agentName) immediately after
 * the call completes. TTL: 4 hours (enforced via AgentCache.expiresAt TTL
 * index). The Aria Concierge agent later reads from this cache via its tools.
 *
 * Each step updates the PrecomputeJob document so the frontend can poll
 * GET /api/precompute-property/:jobId for progressive status.
 */

import { Types } from "mongoose";
import { callLyzrAgent, extractJson } from "@/lib/services/lyzr";
import { AgentCache, type AgentName } from "@/lib/db/models/agent_cache";
import { PrecomputeJob } from "@/lib/db/models/precompute_job";
import { Listing, InventoryMaster, Reservation, MarketEvent } from "@/lib/db/models";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const AGENT_ENV_VAR: Record<AgentName, string[]> = {
  property:        ["LYZR_PROPERTY_AGENT_ID"],
  booking:         ["LYZR_BOOKING_AGENT_ID"],
  market_research: ["LYZR_MARKET_RESEARCH_AGENT_ID"],
  // PriceGuard reuses the existing "Floor/Ceiling" guardrail agent if no
  // dedicated PriceGuard agent ID is configured.
  price_guard:     ["LYZR_PRICE_GUARD_AGENT_ID", "Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values"],
  anomaly:         ["LYZR_ANOMALY_AGENT_ID"],
};

function resolveAgentId(agent: AgentName): string {
  const candidates = AGENT_ENV_VAR[agent];
  for (const key of candidates) {
    const v = process.env[key];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(`No Lyzr agent ID configured for '${agent}'. Set one of: ${candidates.join(", ")}`);
}

interface PrecomputeInput {
  orgId: string;
  listingId: string;
  dateFrom: string;
  dateTo: string;
}

function makeSessionId(input: PrecomputeInput, agent: AgentName): string {
  const ts = Date.now().toString(36);
  return `precompute-${input.listingId}-${agent}-${ts}`;
}

interface RawData {
  listing: any;
  inventory: any[];
  reservations: any[];
  market_events: any[];
  derived_metrics: DerivedMetrics;
}

interface DerivedMetrics {
  totalDays: number;
  bookedDays: number;
  blockedDays: number;
  bookableDays: number;
  occupancyPct: number;
  avgNightlyRate: number;
  totalRevenue: number;
  source: "inventory" | "reservations" | "empty";
}

/**
 * Single source of truth for occupancy/revenue, mirroring the UI's
 * /api/calendar-metrics. InventoryMaster (the Hostaway calendar mirror) is often
 * un-synced, so we derive booked nights from reservations and take the max of the
 * two — otherwise agents see 0% occupancy while the dashboard shows ~52%.
 */
function deriveMetrics(
  inventory: any[],
  reservations: any[],
  dateFrom: string,
  dateTo: string,
  listing: any
): DerivedMetrics {
  const invTotal = inventory.length;
  const invBooked = inventory.filter((d) => d.status === "booked").length;
  const blocked = inventory.filter((d) => d.status === "blocked").length;
  const prices = inventory.filter((d) => d.currentPrice).map((d) => Number(d.currentPrice));

  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  const bookedNights = new Set<string>();
  let resRevenue = 0;
  for (const r of reservations) {
    const ci = r.checkIn > dateFrom ? r.checkIn : dateFrom;
    const co = r.checkOut < dateTo ? r.checkOut : dateTo;
    let cur = new Date(ci);
    const e = new Date(co);
    let nightsInWindow = 0;
    while (cur < e) {
      bookedNights.add(cur.toISOString().split("T")[0]);
      nightsInWindow++;
      cur = new Date(cur.getTime() + 86400000);
    }
    const totalNights = Number(r.nights) || 0;
    const price = Number(r.totalPrice ?? r.price ?? 0);
    if (totalNights > 0 && nightsInWindow > 0) resRevenue += (price / totalNights) * nightsInWindow;
    else if (nightsInWindow > 0) resRevenue += price;
  }

  const resBooked = bookedNights.size;
  const total = invTotal > 0 ? invTotal : windowDays;
  const booked = Math.max(invBooked, resBooked);
  const bookable = Math.max(total - blocked, 0);
  const invRevenue = inventory
    .filter((d) => d.status === "booked")
    .reduce((s, d) => s + Number(d.currentPrice || 0), 0);
  const totalRevenue = Math.max(invRevenue, resRevenue);
  const invAdr = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const resAdr = resBooked > 0 ? resRevenue / resBooked : 0;
  const avgNightlyRate = invAdr > 0 ? invAdr : (resAdr > 0 ? resAdr : Number(listing?.price || 0));

  return {
    totalDays: total,
    bookedDays: booked,
    blockedDays: blocked,
    bookableDays: bookable,
    occupancyPct: bookable > 0 ? Math.round((booked / bookable) * 1000) / 10 : 0,
    avgNightlyRate: Math.round(avgNightlyRate * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    source: invBooked > 0 ? "inventory" : (resBooked > 0 ? "reservations" : "empty"),
  };
}

/**
 * Pre-fetch all the raw DB data the worker agents need so they can synthesise
 * their JSON from the prompt directly — no tool calls required. Avoids the
 * Lyzr max-tool-call limit that PropertyAnalyst was hitting (1.71m, 165k
 * input tokens looping on tool calls).
 */
async function fetchRawData(input: PrecomputeInput): Promise<RawData> {
  const orgOid = new Types.ObjectId(input.orgId);
  const listingOid = new Types.ObjectId(input.listingId);

  const [listing, inventory, reservations, market_events] = await Promise.all([
    Listing.findById(listingOid).lean() as any,
    InventoryMaster.find({
      listingId: listingOid,
      date: { $gte: input.dateFrom, $lte: input.dateTo },
    }).sort({ date: 1 }).lean() as any,
    Reservation.find({
      listingId: listingOid,
      status: { $ne: "cancelled" },
      checkIn: { $lte: input.dateTo },
      checkOut: { $gte: input.dateFrom },
    }).sort({ checkIn: 1 }).lean() as any,
    MarketEvent.find({
      orgId: orgOid,
      isActive: true,
      endDate: { $gte: input.dateFrom },
      startDate: { $lte: input.dateTo },
    }).sort({ startDate: 1 }).lean() as any,
  ]);

  const derived_metrics = deriveMetrics(
    inventory ?? [],
    reservations ?? [],
    input.dateFrom,
    input.dateTo,
    listing
  );

  return { listing, inventory, reservations, market_events, derived_metrics };
}

function makePrompt(
  input: PrecomputeInput,
  agent: AgentName,
  upstream: Partial<Record<AgentName, any>>,
  propertyName: string,
  rawData: RawData
): string {
  // Each worker agent receives ALL data it needs in the prompt:
  //   - raw DB rows (listing, inventory, reservations, market events) — so it
  //     doesn't need to call live data tools and risk hitting Lyzr's tool-call
  //     limit
  //   - the full structured-output JSON of every prior agent in the chain
  const head = [
    `org_id: ${input.orgId}`,
    `listing_id: ${input.listingId}`,
    `property_name: ${propertyName}`,
    `date_from: ${input.dateFrom}`,
    `date_to: ${input.dateTo}`,
    "",
    "[RAW_LISTING_PROFILE]",
    JSON.stringify(rawData.listing ?? {}),
    "",
    "[RAW_CALENDAR_INVENTORY]",
    JSON.stringify(rawData.inventory ?? []),
    "",
    "[RAW_RESERVATIONS]",
    JSON.stringify(rawData.reservations ?? []),
    "",
    "[RAW_MARKET_EVENTS]",
    JSON.stringify(rawData.market_events ?? []),
    "",
    "[DERIVED_METRICS]  ← AUTHORITATIVE. Use these exact occupancy/revenue numbers.",
    "These are computed from reservations when the calendar (RAW_CALENDAR_INVENTORY)",
    "is empty/un-synced, and they match the dashboard the user sees. Do NOT recompute",
    "occupancy as 0 from an empty calendar — trust these values.",
    JSON.stringify(rawData.derived_metrics ?? {}),
    "",
  ];

  // Inject every prior agent's output in sequence. Empty objects mean that
  // upstream agent failed — downstream should fill its fields with empty
  // arrays / nulls and explain in data_warnings[].
  const chain: { name: AgentName; label: string }[] = [
    { name: "property",        label: "[UPSTREAM_PROPERTY_ANALYSIS]" },
    { name: "booking",         label: "[UPSTREAM_BOOKING_INTELLIGENCE]" },
    { name: "market_research", label: "[UPSTREAM_MARKET_RESEARCH]" },
    { name: "price_guard",     label: "[UPSTREAM_PRICE_GUARD]" },
  ];
  for (const { name, label } of chain) {
    if (name === agent) break; // include only agents that ran before this one
    head.push(label, JSON.stringify(upstream[name] ?? {}), "");
  }

  head.push(
    "INSTRUCTION:",
    "All data you need to produce your structured-output JSON is provided above in the [RAW_*] and [UPSTREAM_*] blocks.",
    "CRITICAL: DO NOT CALL ANY TOOLS. Do not explain your actions. Do not write phrases like 'No tools necessary' or 'Proceeding with...'.",
    "If a field has no source data, return empty arrays [], zero numbers 0, or null as appropriate.",
    "Your entire response MUST be a single, raw JSON object starting with `{` and ending with `}`. No markdown fences, no preamble, no commentary."
  );

  return head.join("\n");
}

/**
 * Calls one Lyzr agent and writes its output to AgentCache. Updates the
 * matching agentState in the PrecomputeJob doc as it transitions
 * pending → running → complete/failed.
 */
async function runAgent(
  jobId: string,
  input: PrecomputeInput,
  agent: AgentName,
  upstream: Partial<Record<AgentName, any>>,
  propertyName: string,
  rawData: RawData
): Promise<{ ok: boolean; output: any | null; errorMessage?: string }> {
  const sessionId = makeSessionId(input, agent);
  const lyzrJobId = sessionId; // Lyzr's chat endpoint is request/response — sessionId doubles as the call identifier

  await PrecomputeJob.updateOne(
    { jobId, "agentStates.agentName": agent },
    {
      $set: {
        "agentStates.$.status": "running",
        "agentStates.$.startedAt": new Date(),
        "agentStates.$.lyzrSessionId": sessionId,
        "agentStates.$.lyzrJobId": lyzrJobId,
      },
    }
  );

  let agentId: string;
  try {
    agentId = resolveAgentId(agent);
  } catch (err: any) {
    await markAgentFailed(jobId, agent, err.message);
    return { ok: false, output: null, errorMessage: err.message };
  }

  const prompt = makePrompt(input, agent, upstream, propertyName, rawData);
  console.log(`[precompute ${jobId}] calling ${agent} (Lyzr ${agentId}, session ${sessionId})`);

  const result = await callLyzrAgent(agentId, prompt, input.orgId, sessionId);

  if (!result.ok) {
    await markAgentFailed(jobId, agent, result.error ?? "Lyzr call failed");
    return { ok: false, output: null, errorMessage: result.error };
  }

  // Parse JSON — try the helper's result first, fall back to extractJson.
  // If both fail, log the FULL response so we can diagnose the agent's prose
  // and persist a stub output so downstream agents have something to read.
  let output = result.parsedJson;
  if (!output) {
    output = extractJson(result.response);
  }
  if (!output) {
    const fullResp = result.response ?? "";
    console.warn(
      `[precompute ${jobId}] ${agent} returned non-JSON. Full response (${fullResp.length} chars):\n` +
      `────────────────────────────────────────────────────\n${fullResp}\n────────────────────────────────────────────────────`
    );

    // Persist a stub output containing the raw response so this failure is
    // observable in AgentCache (and downstream agents see at least an empty
    // structure with data_warnings rather than nothing).
    const now = new Date();
    const stub: any = {
      data_warnings: [
        `Agent '${agent}' returned conversational text instead of JSON. Raw response: ${fullResp.slice(0, 500)}`,
      ],
    };
    await AgentCache.findOneAndUpdate(
      {
        orgId: new Types.ObjectId(input.orgId),
        listingId: new Types.ObjectId(input.listingId),
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        agentName: agent,
      },
      {
        $set: {
          output: stub,
          computedAt: now,
          expiresAt: new Date(now.getTime() + FOUR_HOURS_MS),
          lyzrSessionId: sessionId,
          lyzrJobId,
          status: "failed",
          errorMessage: fullResp.slice(0, 2000),
        },
      },
      { upsert: true, new: true }
    );

    const msg = `Agent '${agent}' returned non-JSON output. First 300 chars: ${fullResp.slice(0, 300)}`;
    await markAgentFailed(jobId, agent, msg);
    return { ok: false, output: null, errorMessage: msg };
  }

  // Persist to AgentCache (upsert keyed by org+listing+scope+agent)
  const now = new Date();
  await AgentCache.findOneAndUpdate(
    {
      orgId: new Types.ObjectId(input.orgId),
      listingId: new Types.ObjectId(input.listingId),
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      agentName: agent,
    },
    {
      $set: {
        output,
        computedAt: now,
        expiresAt: new Date(now.getTime() + FOUR_HOURS_MS),
        lyzrSessionId: sessionId,
        lyzrJobId,
        status: "complete",
        errorMessage: undefined,
      },
    },
    { upsert: true, new: true }
  );

  await PrecomputeJob.updateOne(
    { jobId, "agentStates.agentName": agent },
    {
      $set: {
        "agentStates.$.status": "complete",
        "agentStates.$.completedAt": new Date(),
      },
    }
  );

  console.log(`[precompute ${jobId}] ${agent} complete`);
  return { ok: true, output };
}

async function markAgentFailed(jobId: string, agent: AgentName, errorMessage: string): Promise<void> {
  console.warn(`[precompute ${jobId}] ${agent} failed: ${errorMessage}`);
  await PrecomputeJob.updateOne(
    { jobId, "agentStates.agentName": agent },
    {
      $set: {
        "agentStates.$.status": "failed",
        "agentStates.$.completedAt": new Date(),
        "agentStates.$.errorMessage": errorMessage,
      },
    }
  );
}

/**
 * Check whether the AgentCache already has fresh outputs for all five agents
 * in this scope. Used to short-circuit "Refresh Intelligence" clicks that hit
 * within the 4-hour window with the same property + date range.
 */
export async function isFullyCached(input: PrecomputeInput): Promise<boolean> {
  const rows = await AgentCache.find({
    orgId: new Types.ObjectId(input.orgId),
    listingId: new Types.ObjectId(input.listingId),
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    status: "complete",
  }).lean() as any[];

  if (rows.length < 5) return false;
  const now = Date.now();
  return rows.every((r) => now - new Date(r.computedAt).getTime() < FOUR_HOURS_MS);
}

/**
 * Main orchestration entrypoint. Runs in the background after the HTTP route
 * returns the jobId. Updates PrecomputeJob progressively.
 */
export async function runPrecompute(jobId: string, input: PrecomputeInput): Promise<void> {
  try {
    // Pre-fetch every raw DB record the worker agents need so they can build
    // their JSON from prompt context alone — no live tool calls, no hitting
    // Lyzr's max-tool-call limit.
    console.log(`[precompute ${jobId}] Pre-fetching raw DB data (listing + inventory + reservations + events)`);
    const rawData = await fetchRawData(input);
    const propertyName = rawData.listing?.name ?? "Unknown Property";

    console.log(
      `[precompute ${jobId}] Raw data: ${rawData.inventory.length} inventory rows, ` +
      `${rawData.reservations.length} reservations, ${rawData.market_events.length} market events`
    );

    // Run agents strictly sequentially. Each agent's output is saved to
    // AgentCache before the next agent runs, so any tool that reads from
    // AgentCache (e.g. Aria Concierge's tools) sees the latest data.
    const upstream: Partial<Record<AgentName, any>> = {};

    // ── 1/5: PropertyAnalyst ──────────────────────────────────────────────
    console.log(`[precompute ${jobId}] Step 1/5: PropertyAnalyst`);
    const property = await runAgent(jobId, input, "property", upstream, propertyName, rawData);
    if (property.ok) upstream.property = property.output;

    // ── 2/5: BookingIntelligence ──────────────────────────────────────────
    console.log(`[precompute ${jobId}] Step 2/5: BookingIntelligence (with PropertyAnalyst output)`);
    const booking = await runAgent(jobId, input, "booking", upstream, propertyName, rawData);
    if (booking.ok) upstream.booking = booking.output;

    // ── 3/5: MarketResearch ───────────────────────────────────────────────
    console.log(`[precompute ${jobId}] Step 3/5: MarketResearch (with Property + Booking outputs)`);
    const market = await runAgent(jobId, input, "market_research", upstream, propertyName, rawData);
    if (market.ok) upstream.market_research = market.output;

    // ── 4/5: PriceGuard ───────────────────────────────────────────────────
    console.log(`[precompute ${jobId}] Step 4/5: PriceGuard (with Property + Booking + Market outputs)`);
    const pg = await runAgent(jobId, input, "price_guard", upstream, propertyName, rawData);
    if (pg.ok) upstream.price_guard = pg.output;

    // ── 5/5: AnomalyDetector ──────────────────────────────────────────────
    console.log(`[precompute ${jobId}] Step 5/5: AnomalyDetector (with all 4 upstream outputs)`);
    await runAgent(jobId, input, "anomaly", upstream, propertyName, rawData);

    // ── Final status roll-up ──────────────────────────────────────────────
    const finalJob = await PrecomputeJob.findOne({ jobId }).lean() as any;
    if (!finalJob) {
      console.warn(`[precompute ${jobId}] job document disappeared mid-run`);
      return;
    }

    const allComplete = finalJob.agentStates.every((s: any) => s.status === "complete");
    const anyFailed = finalJob.agentStates.some((s: any) => s.status === "failed");
    const overallStatus =
      allComplete ? "complete" :
      anyFailed && finalJob.agentStates.some((s: any) => s.status === "complete") ? "partial" :
      anyFailed ? "failed" :
      "complete";

    await PrecomputeJob.updateOne(
      { jobId },
      { $set: { overallStatus, completedAt: new Date() } }
    );

    console.log(`[precompute ${jobId}] done — status=${overallStatus}`);
  } catch (err: any) {
    console.error(`[precompute ${jobId}] orchestrator crashed:`, err);
    await PrecomputeJob.updateOne(
      { jobId },
      {
        $set: {
          overallStatus: "failed",
          completedAt: new Date(),
        },
      }
    ).catch(() => {});
  }
}
