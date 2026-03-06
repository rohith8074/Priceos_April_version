import { NextRequest, NextResponse } from "next/server";
import { MANAGER_AGENT_ID } from "@/lib/agents/constants";
import { db } from "@/lib/db";
import { chatMessages, inventoryMaster, reservations, marketEvents, benchmarkData, guestSummaries, listings } from "@/lib/db/schema";
import { and, eq, lte, gte, avg, sql } from "drizzle-orm";

/**
 * POST /api/chat
 *
 * Unified chat API that:
 *   1. Fetches ALL property data fresh from Neon DB
 *   2. Syncs it to Lyzr Global Context (agents read from there only)
 *   3. Sends the raw user message to Lyzr — NO inline prompt injection
 */

const LYZR_API_URL = process.env.LYZR_API_URL!;
const LYZR_API_KEY = process.env.LYZR_API_KEY!;
const AGENT_ID = process.env.AGENT_ID || MANAGER_AGENT_ID;

interface ChatContext {
  type: "portfolio" | "property";
  propertyId?: number;
  propertyName?: string;
  /** Calendar metrics as computed by GET /api/calendar-metrics in the UI.
   *  When present, these are used as-is in the Global Context so the agent
   *  sees the EXACT same numbers the UI displays. */
  metrics?: {
    occupancy: number;
    bookedDays: number;
    availableDays: number;
    blockedDays: number;
    totalDays: number;
    bookableDays: number;
    avgPrice: number;
  };
}

interface ChatRequest {
  message: string;
  context: ChatContext;
  sessionId?: string;
  dateRange?: { from: string; to: string };
  isChatActive?: boolean;
}

export async function POST(req: NextRequest) {
  const requestTimestamp = new Date().toISOString();
  const startTime = performance.now();

  try {
    const body: ChatRequest = await req.json();
    const { message, context, sessionId, dateRange } = body;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📩 CHAT REQUEST — ${requestTimestamp}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Context:  ${context.type} | Property: ${context.propertyName || '(portfolio)'}`);
    console.log(`  Range:    ${dateRange ? `${dateRange.from} → ${dateRange.to}` : '(none)'}`);
    console.log(`  Message:  "${message}"`);
    console.log(`${'─'.repeat(60)}`);

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!LYZR_API_KEY) {
      return NextResponse.json({ error: "LYZR_API_KEY not configured" }, { status: 500 });
    }
    if (!AGENT_ID) {
      return NextResponse.json({ error: "AGENT_ID not configured" }, { status: 500 });
    }

    // Session is keyed to property + date range — mirrors the frontend buildSessionId logic
    const lyzrSessionId =
      sessionId ||
      (context.type === "portfolio"
        ? "portfolio-session"
        : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`);

    // Check if data has already been injected in this session.
    // We look for a prior message that contains the injection marker.
    // The [SYSTEM] init message does NOT count because it skips injection.
    const isSystemMsg = message.startsWith("[SYSTEM]");
    const prevDataMsgs = await db.select({ id: chatMessages.id })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.sessionId, lyzrSessionId),
        eq(chatMessages.role, "user"),
        sql`${chatMessages.content} NOT LIKE '[SYSTEM]%'`
      ))
      .limit(1);
    const needsDataInjection = prevDataMsgs.length === 0 && !isSystemMsg;

    // ═══════════════════════════════════════════════════════
    // 📦 STEP 1 — Fetch ALL real-time data from Neon DB
    //    We build the payload if this is the first REAL user
    //    message (non-system) that hasn't had data injected yet.
    // ═══════════════════════════════════════════════════════
    let propertyDataPayload: any = null;

    if (needsDataInjection && context.type === "property" && context.propertyId) {
      const pid = context.propertyId;
      const dateFrom = dateRange?.from || '1970-01-01';
      const dateTo = dateRange?.to || '9999-12-31';

      console.log(`\n🔄 [Context Sync] Fetching fresh data for listing #${pid}...`);

      const [
        listingRows,
        events,
        benchmarkRows,
        calMetrics,
        resRows,
        guestSumRows,
        inventoryRows,
      ] = await Promise.all([

        // Q1: Property details
        db.select().from(listings).where(eq(listings.id, pid)).limit(1),

        // Q2: Market events overlapping the date range
        db.select()
          .from(marketEvents)
          .where(and(
            eq(marketEvents.listingId, pid),
            gte(marketEvents.endDate, dateFrom),
            lte(marketEvents.startDate, dateTo)
          ))
          .limit(50),

        // Q3: Benchmark data (latest for this range)
        db.select()
          .from(benchmarkData)
          .where(and(
            eq(benchmarkData.listingId, pid),
            gte(benchmarkData.dateTo, dateFrom),
            lte(benchmarkData.dateFrom, dateTo)
          ))
          .limit(1),

        // Q4: Calendar metrics (occupancy, booked/blocked/available)
        db.select({
          totalDays: sql<number>`COUNT(*)`,
          bookedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} IN ('reserved','booked') THEN 1 END)`,
          availableDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'available' THEN 1 END)`,
          blockedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'blocked' THEN 1 END)`,
          avgPrice: avg(inventoryMaster.currentPrice),
        })
          .from(inventoryMaster)
          .where(and(
            eq(inventoryMaster.listingId, pid),
            gte(inventoryMaster.date, dateFrom),
            lte(inventoryMaster.date, dateTo)
          )),

        // Q5: Revenue & channel mix from reservations
        db.select({
          totalPrice: reservations.totalPrice,
          pricePerNight: reservations.pricePerNight,
          channelName: reservations.channelName,
          guestName: reservations.guestName,
          startDate: reservations.startDate,
          endDate: reservations.endDate,
          numGuests: reservations.numGuests,
          reservationStatus: reservations.reservationStatus,
        })
          .from(reservations)
          .where(and(
            eq(reservations.listingId, pid),
            lte(reservations.startDate, dateTo), // Starts before window ends
            gte(reservations.endDate, dateFrom)   // Ends after window starts
          )),

        // Q6: Guest communication summary
        db.select()
          .from(guestSummaries)
          .where(and(
            eq(guestSummaries.listingId, pid),
            gte(guestSummaries.dateTo, dateFrom),
            lte(guestSummaries.dateFrom, dateTo)
          ))
          .limit(1),

        // Q7: Raw inventory rows for detailed analysis
        db.select()
          .from(inventoryMaster)
          .where(and(
            eq(inventoryMaster.listingId, pid),
            gte(inventoryMaster.date, dateFrom),
            lte(inventoryMaster.date, dateTo)
          ))
          .orderBy(inventoryMaster.date),
      ]);

      // ── Compute derived metrics ──
      const listing = listingRows[0];
      const benchmark = benchmarkRows[0] || null;
      const calResult = calMetrics[0];
      const guestSum = guestSumRows[0] || null;
      const rawInventory = inventoryRows || [];

      // ─────────────────────────────────────────────────────────────────────
      // ✅ SINGLE SOURCE OF TRUTH for occupancy:
      //    Use context.metrics (sent by the UI from GET /api/calendar-metrics)
      //    when available — guarantees agent sees EXACT same numbers as the UI.
      //    Fall back to our own Q4 DB result only when the UI didn't send metrics.
      // ─────────────────────────────────────────────────────────────────────
      const uiMetrics = context.metrics;
      const usingUIMetrics = !!uiMetrics;

      const totalDays = uiMetrics?.totalDays ?? Number(calResult?.totalDays || 0);
      const bookedDays = uiMetrics?.bookedDays ?? Number(calResult?.bookedDays || 0);
      const blockedDays = uiMetrics?.blockedDays ?? Number(calResult?.blockedDays || 0);
      const bookableDays = uiMetrics?.bookableDays ?? (totalDays - blockedDays);
      const occupancy = uiMetrics?.occupancy ?? (bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0);
      const avgCalPrice = uiMetrics?.avgPrice ?? Number(calResult?.avgPrice || listing?.price || 0);

      const totalRevenue = resRows.reduce((s, r) => s + Number(r.totalPrice || 0), 0);
      const avgDailyRate = resRows.length > 0
        ? resRows.reduce((s, r) => s + Number(r.pricePerNight || 0), 0) / resRows.length
        : Number(listing?.price || 0);
      const channelMix: Record<string, number> = {};
      resRows.forEach(r => {
        const ch = r.channelName || "Direct";
        channelMix[ch] = (channelMix[ch] || 0) + 1;
      });

      console.log(`📦 [Context Sync] Metrics source: ${usingUIMetrics ? '✅ UI /calendar-metrics (matches what user sees)' : '⚠️  DB Q4 fallback'}`);
      console.log(`📦 [Context Sync] occ=${occupancy}% | booked=${bookedDays}d | actual_rows=${rawInventory.length} | bookings=${resRows.length}`);
      console.log(`📦 [Context Sync] avgPrice=AED ${avgCalPrice}`);

      // ═══════════════════════════════════════════════════════
      // 📡 STEP 2 — Build Property Data Payload
      //    Instead of syncing to Global Context, we inject this locally!
      // ═══════════════════════════════════════════════════════
      console.log(`📡 [Context Sync] Building JSON payload for direct injection...`);

      propertyDataPayload = {
        // ── Today's date and data freshness ──
        today: new Date().toISOString().split('T')[0],
        market_data_scanned_at: benchmark?.createdAt ? new Date(benchmark.createdAt).toISOString() : new Date().toISOString(),
        // ── The date range the user selected in the UI ──
        analysis_window: {
          from: dateFrom,
          to: dateTo,
        },
        property: {
          listingId: Number(context.propertyId || 0),
          name: listing?.name || context.propertyName || "Unknown Property",
          area: listing?.area || "Dubai",
          city: listing?.city || "Dubai",
          bedrooms: listing?.bedroomsNumber || 1,
          bathrooms: listing?.bathroomsNumber || 1,
          personCapacity: listing?.personCapacity || 0,
          current_price: Number(listing?.price || 0),
          floor_price: Number(listing?.priceFloor || 0),
          ceiling_price: Number(listing?.priceCeiling || 0),
          currency: listing?.currencyCode || "AED",
        },
        metrics: {
          occupancy_pct: occupancy,
          booked_nights: bookedDays,
          bookable_nights: bookableDays,
          blocked_nights: blockedDays,
          total_nights: totalDays,
          avg_nightly_rate: avgCalPrice,
        },
        benchmark: benchmark ? {
          verdict: benchmark.verdict || "FAIR",
          percentile: benchmark.percentile || 50,
          median_market_rate: Number(benchmark.p50Rate || 0),
          p25: Number(benchmark.p25Rate || 0),
          p50: Number(benchmark.p50Rate || 0),
          p75: Number(benchmark.p75Rate || 0),
          p90: Number(benchmark.p90Rate || 0),
          avg_weekday: Number(benchmark.avgWeekday || 0),
          avg_weekend: Number(benchmark.avgWeekend || 0),
          recommended_weekday: Number(benchmark.recommendedWeekday || benchmark.p50Rate || 0),
          recommended_weekend: Number(benchmark.recommendedWeekend || benchmark.p75Rate || 0),
          recommended_event: Number(benchmark.recommendedEvent || benchmark.p90Rate || 0),
          reasoning: benchmark.reasoning || "",
        } : null,
        market_events: events.filter(e => e.eventType === 'event' || e.eventType === 'holiday').map(e => ({
          title: e.title,
          start_date: e.startDate,
          end_date: e.endDate,
          impact: e.expectedImpact || "medium",
          description: e.description || "",
          suggested_premium_pct: e.suggestedPremium ? Number(e.suggestedPremium) : 0,
        })),
        news: events.filter(e => e.eventType === 'news').map(n => ({
          headline: n.title,
          date: n.startDate,
          category: "market",
          sentiment: n.sentiment || "neutral",
          demand_impact: n.demandImpact || "neutral",
          suggested_premium_pct: n.suggestedPremium ? Number(n.suggestedPremium) : 0,
          description: n.description || "",
          source: n.source || "Web"
        })),
        daily_events: events.filter(e => e.eventType === 'daily_event').map(d => ({
          title: d.title,
          date: d.startDate,
          impact: d.expectedImpact || "medium",
          suggested_premium_pct: d.suggestedPremium ? Number(d.suggestedPremium) : 0,
          source: d.source || "Web",
          description: d.description || ""
        })),
        demand_outlook: {
          trend: events.find(e => e.demandTrend)?.demandTrend || "moderate",
          reason: "Aggregated from market intelligence.",
          negative_factors: events.filter(e => e.eventType === 'news' && e.sentiment === 'negative').map(e => e.title),
          positive_factors: events.filter(e => e.eventType === 'news' && e.sentiment === 'positive').map(e => e.title),
        },
        recent_reservations: resRows.map(r => ({
          guestName: r.guestName || "Guest",
          startDate: r.startDate,
          endDate: r.endDate,
          nights: Math.ceil((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / (1000 * 60 * 60 * 24)),
          totalPrice: Number(r.totalPrice || 0),
          channel: r.channelName || "Direct",
        })),
      };

      console.log(`✅ [Context Sync] Payload ready for injection.`);
    }

    // ═══════════════════════════════════════════════════════
    // 📤 STEP 3 — Send RAW user message to Lyzr
    //    We inject the JSON payload directly into the prompt.
    // ═══════════════════════════════════════════════════════


    // Save user message to DB
    try {
      if (message?.trim()) {
        await db.insert(chatMessages).values({
          userId: "user-1",
          sessionId: lyzrSessionId,
          role: "user",
          content: message,
          listingId: context.propertyId || null,
          structured: { context, dateRange },
        });
      }
    } catch (err) {
      console.error("Failed to save user message to DB:", err);
    }

    // ── Property anchor: Inject real-time JSON payload ──
    let anchoredMessage = message;

    if (!isSystemMsg) {
      if (propertyDataPayload) {
        anchoredMessage = `[SYSTEM: CURRENT PROPERTY DATA]\nYou must strictly use the following real-time data to answer the user's query:\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
      } else {
        const propName = context.propertyName || "portfolio";
        anchoredMessage = `[Active Context: ${propName}]\n\n${message}`;
      }
    }

    const payload = {
      user_id: "priceos-user",
      agent_id: AGENT_ID,
      session_id: lyzrSessionId,
      message: anchoredMessage,
    };

    const maskedKey = LYZR_API_KEY.length > 8
      ? `${LYZR_API_KEY.slice(0, 4)}...${LYZR_API_KEY.slice(-4)}`
      : "****";

    console.log(`\n📤 LYZR CHAT REQUEST`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`  Agent:    ${AGENT_ID}  |  Session: ${lyzrSessionId}`);
    console.log(`  API Key:  ${maskedKey}  |  URL: ${LYZR_API_URL}`);
    console.log(`  Message:  "${message}"`);
    console.log(`${'─'.repeat(60)}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": LYZR_API_KEY,
    };

    const response = await fetch(LYZR_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const rawText = await response.text();
      console.error(`\n❌ LYZR API ERROR — ${response.status}: ${rawText.substring(0, 300)}`);
      return NextResponse.json(
        { message: "I'm having trouble connecting to the AI agent. Please try again.", error: `Lyzr API returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const duration = Math.round(performance.now() - startTime);
    const { text: agentReply, parsedJson } = extractAgentMessage(data);

    // ═══════════════════════════════════════════════════════
    // 🛡️ SERVER-SIDE GUARDRAILS (Defense in Depth — Layer 3)
    //    These run IN CODE, not in prompts. Even if every prompt
    //    is deleted, these rules still enforce business logic.
    // ═══════════════════════════════════════════════════════
    const floorPrice = Number(propertyDataPayload?.property?.floor_price || 0);
    const ceilingPrice = Number(propertyDataPayload?.property?.ceiling_price || 0);
    let enforcedProposals = parsedJson?.proposals || null;

    if (enforcedProposals && Array.isArray(enforcedProposals) && (floorPrice > 0 || ceilingPrice > 0)) {
      enforcedProposals = enforceGuardrails(enforcedProposals, floorPrice, ceilingPrice);
      console.log(`🛡️ [Guardrails] Enforced floor=${floorPrice} ceiling=${ceilingPrice} on ${enforcedProposals.length} proposals`);
    }

    // Save assistant reply to DB
    try {
      if (agentReply) {
        await db.insert(chatMessages).values({
          userId: "user-1",
          sessionId: lyzrSessionId,
          role: "assistant",
          content: agentReply,
          listingId: context.propertyId || null,
          structured: { context, dateRange, proposals: enforcedProposals },
        });
        console.log(`\n✅ AGENT REPLY SAVED — ${duration}ms`);
      }
    } catch (err) {
      console.error("Failed to save assistant reply to DB:", err);
    }

    return NextResponse.json({
      message: agentReply || "No message received from agent",
      proposals: enforcedProposals,
    });

  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    console.error(`\n💥 UNHANDLED ERROR — ${duration}ms:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { message: "Sorry, something went wrong. Please try again.", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Extract the agent's text message from the Lyzr response and parse JSON if needed.
 */
function extractAgentMessage(response: any): { text: string; parsedJson: any | null } {
  let rawStr = "";

  // Format 1: Direct response string (common from Lyzr chat endpoint)
  if (typeof response.response === "string") {
    rawStr = response.response;
  }
  // Format 2: Response with nested message
  else if (response.response?.message) {
    rawStr = response.response.message;
  }
  // Format 3: Response with nested result containing message
  else if (response.response?.result?.message) {
    rawStr = response.response.result.message;
  }
  // Format 4: Response with nested result containing text
  else if (response.response?.result?.text) {
    rawStr = response.response.result.text;
  }
  // Format 5: Response with nested result containing answer
  else if (response.response?.result?.answer) {
    rawStr = response.response.result.answer;
  }
  // Format 6: Direct message field
  else if (typeof response.message === "string") {
    rawStr = response.message;
  }
  // Format 7: OpenAI-style choices (from the /chat/completions variant)
  else if (response.choices?.[0]?.message?.content) {
    rawStr = response.choices[0].message.content;
  }
  // Format 8: Direct result string
  else if (typeof response.result === "string") {
    rawStr = response.result;
  }

  if (!rawStr) {
    console.warn(
      "[Chat API] Unknown Lyzr response format:",
      JSON.stringify(response).substring(0, 500)
    );
    return { text: "I received your message but couldn't parse my response. Please try again.", parsedJson: null };
  }

  // Strip markdown json formatting if present
  let cleanStr = rawStr;
  if (cleanStr.startsWith("```json")) {
    cleanStr = cleanStr.replace(/```json\s*/, "").replace(/\s*```$/, "");
  }

  // Try parsing to see if it's the structured CRO router or agent response
  try {
    const parsed = JSON.parse(cleanStr);

    // Log the parsed JSON to the terminal so we can see what the agent actually returned!
    console.log(`\n🤖 LYZR AGENT PARSED JSON:`);
    console.dir(parsed, { depth: null, colors: true });

    // Prefer chat_response from CRO Router
    if (parsed.chat_response) {
      return { text: parsed.chat_response, parsedJson: parsed };
    }

    // Fallback to summary from individual agents (like Property Analyst)
    if (parsed.summary) {
      return { text: parsed.summary, parsedJson: parsed };
    }

    // Fallback: If it's a JSON but has no chat_response or summary, stringify it cleanly
    return { text: "```json\n" + JSON.stringify(parsed, null, 2) + "\n```", parsedJson: parsed };
  } catch (e) {
    // If it's not valid JSON, just return the raw string
    console.log(`\n🤖 LYZR AGENT RAW TEXT:`);
    console.log(rawStr);
    return { text: rawStr, parsedJson: null };
  }
}

/**
 * 🛡️ Server-side guardrails — enforces business rules in code.
 * This is the LAST line of defense. Even if all prompts are deleted
 * or the LLM ignores instructions, this function guarantees:
 *   1. No proposal is below floor_price
 *   2. No proposal is above ceiling_price
 *   3. No proposal has a swing > ±50%
 *   4. Risk levels are computed deterministically
 */
function enforceGuardrails(
  proposals: any[],
  floorPrice: number,
  ceilingPrice: number
): any[] {
  return proposals.map((p) => {
    const currentPrice = Number(p.current_price || p.currentPrice || 0);
    let proposedPrice = Number(p.proposed_price || p.proposedPrice || 0);
    let verdict = p.guard_verdict || p.guardVerdict || "APPROVED";
    let notes: string[] = [];

    // CLAMP to floor
    if (floorPrice > 0 && proposedPrice < floorPrice) {
      notes.push(`Server clamped ${proposedPrice} → floor ${floorPrice}`);
      proposedPrice = floorPrice;
    }

    // CLAMP to ceiling
    if (ceilingPrice > 0 && proposedPrice > ceilingPrice) {
      notes.push(`Server clamped ${proposedPrice} → ceiling ${ceilingPrice}`);
      proposedPrice = ceilingPrice;
    }

    // Compute change %
    const changePct = currentPrice > 0
      ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100)
      : 0;

    // REJECT if swing > ±50%
    if (Math.abs(changePct) > 50) {
      verdict = "REJECTED";
      notes.push(`Swing ${changePct}% exceeds ±50% limit`);
    }

    // Deterministic risk level
    const absChange = Math.abs(changePct);
    let riskLevel: string;
    if (absChange < 5) riskLevel = "low";
    else if (absChange <= 15) riskLevel = "medium";
    else riskLevel = "high";

    // Return the enforced proposal
    return {
      ...p,
      proposed_price: proposedPrice,
      proposedPrice: proposedPrice,
      change_pct: changePct,
      changePct: changePct,
      risk_level: riskLevel,
      riskLevel: riskLevel,
      guard_verdict: verdict,
      guardVerdict: verdict,
      ...(notes.length > 0 ? { server_notes: notes.join("; ") } : {}),
    };
  });
}
