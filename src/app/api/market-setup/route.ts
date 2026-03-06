import { NextRequest, NextResponse } from "next/server";
import { db, marketEvents, benchmarkData, listings, inventoryMaster, reservations } from "@/lib/db";
import { eq, and, gte, lte, sql, avg } from "drizzle-orm";
import { createInternetResearchAgent } from "@/lib/agents/internet-research-agent";
import { MARKET_RESEARCH_ID, PROPERTY_ANALYST_ID, MARKETING_AGENT_ID, BENCHMARK_AGENT_ID, GUARDRAILS_AGENT_ID } from "@/lib/agents/constants";

export const dynamic = 'force-dynamic';

/**
 * 🛠️ Helper to call a specific Lyzr agent during the background setup process.
 * This ensures the specialized Market Research and Property Analyst agents
 * are involved in the data synthesis phase.
 */
async function callLyzrAgent(agentId: string, message: string) {
    const LYZR_API_KEY = process.env.LYZR_API_KEY;
    const LYZR_API_URL = process.env.LYZR_API_URL || "https://studio.lyzr.ai/inference/chat";

    if (!LYZR_API_KEY) return { text: "", parsedJson: null };

    try {
        const response = await fetch(LYZR_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": LYZR_API_KEY,
            },
            body: JSON.stringify({
                user_id: "priceos-setup-system",
                agent_id: agentId,
                session_id: `setup-${Date.now()}`,
                message: message,
            }),
        });

        if (!response.ok) return { text: "", parsedJson: null };

        const data = await response.json();
        const rawStr = data.response?.message ||
            data.response?.result?.message ||
            data.response ||
            data.message || "";

        // Attempt to extract and parse JSON if the agent returned a block
        let parsedJson = null;
        try {
            const jsonMatch = rawStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedJson = JSON.parse(jsonMatch[0]);
            }
        } catch (e) { /* ignore parse errors */ }

        return { text: rawStr, parsedJson };
    } catch (err) {
        console.error(`[callLyzrAgent] Error calling agent ${agentId}:`, err);
        return { text: "", parsedJson: null };
    }
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    try {
        const body = await req.json();
        const { dateRange, context, userId } = body;
        const listingId = context?.propertyId ? Number(context.propertyId) : null;

        if (!dateRange?.from || !dateRange?.to) {
            return NextResponse.json({ error: "Date range is required" }, { status: 400 });
        }

        if (!listingId) {
            return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
        }

        console.log(`\n[${new Date().toISOString()}] 🚀 STARTING MARKET ANALYSIS FOR LISTING #${listingId}`);
        console.log(`📅 Date Range: ${dateRange.from} to ${dateRange.to}`);

        // 1. Fetch Property Context
        const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
        const area = listing?.area || "Dubai";
        const bedrooms = listing?.bedroomsNumber || 1;

        console.log(`🏠 Property: "${listing?.name || "Unknown"}" in ${area} (${bedrooms}BR)`);

        // 2. ── 🆕 CALL LYZR MARKETING AGENT (AGENT 6) & BENCHMARK AGENT (AGENT 7) IN PARALLEL ──
        console.log(`📡 Invoking Lyzr Marketing Agent (Agent 6) and Benchmark Agent (Agent 7) in parallel...`);
        const currentDate = new Date().toISOString().split('T')[0];

        // Expert Cluster Mapping
        let searchClusters = area;
        if (area.toLowerCase().includes("marina") || area.toLowerCase().includes("jbr")) {
            searchClusters = "Dubai Marina, JBR (Jumeirah Beach Residence), and Bluewaters Island";
        } else if (area.toLowerCase().includes("downtown") || area.toLowerCase().includes("difc")) {
            searchClusters = "Downtown Dubai, DIFC, and Business Bay";
        } else if (area.toLowerCase().includes("palm")) {
            searchClusters = "Palm Jumeirah, West Beach, and Pointe";
        }

        // Build month-aware event hints
        const month = parseInt(dateRange.from.substring(5, 7));
        let eventHints = '';
        if (month >= 1 && month <= 3) eventHints = 'Check for: Dubai Shopping Festival (DSF), Art Dubai, Dubai International Boat Show, Dubai World Cup, Dubai Jazz Festival.';
        else if (month >= 3 && month <= 5) eventHints = 'Check for: Dubai World Cup, Ramadan events, Eid celebrations, Arabian Travel Market.';
        else if (month >= 6 && month <= 8) eventHints = 'Check for: Dubai Summer Surprises (DSS), Eid Al Adha.';
        else if (month >= 9 && month <= 10) eventHints = 'Check for: GITEX Global, Dubai Design Week, Abu Dhabi F1 (spillover).';
        else eventHints = 'Check for: Dubai Airshow, UAE National Day, New Year events, Art Dubai.';

        const marketingPrompt = `
        Today: ${currentDate}. Area cluster: ${searchClusters}.
        Date range: ${dateRange.from} to ${dateRange.to}.
        Property: ${bedrooms}BR in ${area}, base price ${listing?.price || "Unknown"} AED.
        
        EXECUTE YOUR FULL 7-STEP INTELLIGENCE SWEEP:
        
        STEP 1 (CRITICAL): Search for UAE travel advisories, Iran-UAE tensions, Yemen Houthi attacks, Israel-Palestine spillover, flight disruptions, pandemic alerts. If NO threats found, report "No active advisories" as positive news.
        
        STEP 2: UAE public holidays, Ramadan phase (Ramadan 2026 started Feb 18 — determine current phase: early/mid/late/eid_buildup), school holidays.
        
        STEP 3: Major events in ${searchClusters} during ${dateRange.from} to ${dateRange.to}. ${eventHints}
        
        STEP 4: Landmark status in ${searchClusters} (Ain Dubai open? Museum of the Future? Dubai Frame?). Report closures.
        
        STEP 5: Economic signals — Dubai tourism numbers, hotel occupancy trends, INR/GBP/EUR to AED rates, oil prices.
        
        STEP 6: Weather and environment for this period.
        
        STEP 7: Viral/trending news about Dubai tourism.
        
        Return raw JSON ONLY with https:// source URLs. Every news item MUST have sentiment and demand_impact fields.
        `;

        const benchmarkPrompt = `
        Area: ${searchClusters}. Match: ${bedrooms}BR.
        Base price: ${listing?.price || "Unknown"} AED.
        Date range: ${dateRange.from} to ${dateRange.to}.
        
        Find 10-15 comparable properties from Airbnb/Booking.com.
        IMPORTANT: Only include listings you found via real search results with actual URLs.
        If you cannot verify a real URL, mark source_url as null and set rating to null.
        
        Return raw JSON ONLY as per your prompt.
        `;

        const [marketingRes, benchmarkRes] = await Promise.all([
            callLyzrAgent(MARKETING_AGENT_ID || MARKET_RESEARCH_ID, marketingPrompt),
            callLyzrAgent(BENCHMARK_AGENT_ID || PROPERTY_ANALYST_ID, benchmarkPrompt)
        ]);

        const agentMkt = marketingRes.parsedJson || {};
        const agentBench = benchmarkRes.parsedJson || {};

        console.log(`✅ Research complete. Found ${agentMkt?.events?.length || 0} major events and ${agentMkt?.news?.length || 0} news items.`);

        // 3. Transform and Save Market Events (including News & Daily Events)
        const allFindings: any[] = [];

        // Major Events
        if (agentMkt.events && Array.isArray(agentMkt.events)) {
            agentMkt.events.forEach((e: any) => allFindings.push({
                listingId, title: e.title, startDate: e.date_start, endDate: e.date_end,
                eventType: 'event', expectedImpact: e.impact, confidence: Math.round(e.confidence || 80),
                description: e.description, source: e.source, suggestedPremium: String(e.suggested_premium_pct || 0), location: area
            }));
        }

        // Holidays
        if (agentMkt.holidays && Array.isArray(agentMkt.holidays)) {
            agentMkt.holidays.forEach((h: any) => allFindings.push({
                listingId, title: h.name, startDate: h.date_start, endDate: h.date_end,
                eventType: 'holiday', expectedImpact: h.impact, confidence: 90,
                description: `Holiday: ${h.impact}`, source: h.source, suggestedPremium: String(h.premium_pct || 0), location: area
            }));
        }

        // News (NEW)
        if (agentMkt.news && Array.isArray(agentMkt.news)) {
            agentMkt.news.forEach((n: any) => {
                // De-duplicate: If headline is similar to one already added, skip it
                const isDuplicate = allFindings.some(f =>
                    f.eventType === 'news' &&
                    (f.title.toLowerCase().includes(n.headline.toLowerCase()) ||
                        n.headline.toLowerCase().includes(f.title.toLowerCase()))
                );

                if (!isDuplicate) {
                    allFindings.push({
                        listingId, title: n.headline, startDate: n.date || dateRange.from, endDate: n.date || dateRange.from,
                        eventType: 'news', expectedImpact: n.demand_impact?.includes('high') ? 'high' : 'medium',
                        confidence: Math.round(n.confidence || 75), description: n.description, source: n.source,
                        suggestedPremium: String(n.suggested_premium_pct || 0), location: area, sentiment: n.sentiment, demandImpact: n.demand_impact
                    });
                }
            });
        }

        // Daily Events (NEW)
        if (agentMkt.daily_events && Array.isArray(agentMkt.daily_events)) {
            agentMkt.daily_events.forEach((d: any) => allFindings.push({
                listingId, title: d.title, startDate: d.date || dateRange.from, endDate: d.date || dateRange.from,
                eventType: 'daily_event', expectedImpact: d.impact, confidence: 85,
                description: `${d.description}. Expected attendees: ${d.expected_attendees || 'Unknown'}`,
                source: d.source, suggestedPremium: String(d.suggested_premium_pct || 0), location: area
            }));
        }

        if (allFindings.length > 0) {
            console.log(`📥 Refreshing ${allFindings.length} signals/news in 'market_events' table...`);

            // USER REQUESTED: Skip deletion to preserve historical data
            /*
            await db.delete(marketEvents).where(
                and(
                    eq(marketEvents.listingId, listingId),
                    lte(marketEvents.startDate, dateRange.to),
                    gte(marketEvents.endDate, dateRange.from)
                )
            );
            */

            await db.insert(marketEvents).values(allFindings).onConflictDoUpdate({
                target: [marketEvents.listingId, marketEvents.title, marketEvents.startDate],
                set: {
                    endDate: sql`EXCLUDED.end_date`,
                    expectedImpact: sql`EXCLUDED.expected_impact`,
                    confidence: sql`EXCLUDED.confidence`,
                    suggestedPremium: sql`EXCLUDED.suggested_premium`,
                    source: sql`EXCLUDED.source`,
                    description: sql`EXCLUDED.description`,
                    metadata: sql`EXCLUDED.metadata`,
                    sentiment: sql`EXCLUDED.sentiment`,
                    demandImpact: sql`EXCLUDED.demand_impact`
                }
            });
        }

        // 4. Transform and Save Benchmark Data
        const medianRate = agentBench?.rate_distribution?.p50 || Number(listing?.price || 500);
        const benchmark = {
            listingId,
            dateFrom: dateRange.from,
            dateTo: dateRange.to,
            p25Rate: String(agentBench?.rate_distribution?.p25 || Math.round(medianRate * 0.85)),
            p50Rate: String(medianRate),
            p75Rate: String(agentBench?.rate_distribution?.p75 || Math.round(medianRate * 1.15)),
            p90Rate: String(agentBench?.rate_distribution?.p90 || Math.round(medianRate * 1.3)),
            avgWeekday: String(agentBench?.rate_distribution?.avg_weekday || medianRate),
            avgWeekend: String(agentBench?.rate_distribution?.avg_weekend || Math.round(medianRate * 1.25)),
            yourPrice: String(agentBench?.pricing_verdict?.your_price || listing?.price || medianRate),
            percentile: agentBench?.pricing_verdict?.percentile || 50,
            verdict: agentBench?.pricing_verdict?.verdict || "FAIR",
            rateTrend: agentBench?.rate_trend?.direction || "stable",
            trendPct: String(agentBench?.rate_trend?.pct_change || 0),
            recommendedWeekday: String(agentBench?.recommended_rates?.weekday || medianRate),
            recommendedWeekend: String(agentBench?.recommended_rates?.weekend || Math.round(medianRate * 1.2)),
            recommendedEvent: String(agentBench?.recommended_rates?.event_peak || Math.round(medianRate * 1.5)),
            reasoning: agentBench?.recommended_rates?.reasoning || agentMkt?.summary || "Data synthesized from market search.",
            comps: (agentBench?.comps || []).map((c: any) => ({
                ...c,
                avgRate: c.avg_nightly_rate || c.avgRate // Map from agent schema to UI schema
            })).filter((c: any) => c.sourceUrl) // USER REQUEST: Only real clickable listings
        };

        console.log(`📉 Benchmarking complete. Verdict: ${benchmark.verdict}. Median: ${medianRate}`);

        await db.insert(benchmarkData).values(benchmark).onConflictDoUpdate({
            target: [benchmarkData.listingId, benchmarkData.dateFrom, benchmarkData.dateTo],
            set: {
                p25Rate: benchmark.p25Rate,
                p50Rate: benchmark.p50Rate,
                p75Rate: benchmark.p75Rate,
                p90Rate: benchmark.p90Rate,
                avgWeekday: benchmark.avgWeekday,
                avgWeekend: benchmark.avgWeekend,
                yourPrice: benchmark.yourPrice,
                percentile: benchmark.percentile,
                verdict: benchmark.verdict,
                rateTrend: benchmark.rateTrend,
                reasoning: benchmark.reasoning,
                comps: benchmark.comps
            }
        });

        // 5. ── 🆕 CALL LYZR GUARDRAILS AGENT (AGENT 10) IF MISSING ──
        let guardrailsSetByAi = false;
        let generatedGuardrails: any = null;
        if (Number(listing?.priceFloor || 0) === 0 && Number(listing?.priceCeiling || 0) === 0) {
            console.log(`🛡️ Guardrails unset. Invoking Lyzr Guardrails Agent (Agent 10)...`);
            const guardrailsPrompt = `
            Compute suggested_floor and suggested_ceiling for property:
            ${JSON.stringify({ name: listing?.name, bedrooms, personCapacity: listing?.personCapacity }, null, 2)}
            
            Benchmark Data:
            ${JSON.stringify({
                rate_distribution: agentBench?.rate_distribution || { p25: Math.round(medianRate * 0.85), p50: medianRate, p90: Math.round(medianRate * 1.3) },
                pricing_verdict: agentBench?.pricing_verdict,
                comps: agentBench?.comps
            }, null, 2)}
            
            Demand Outlook & News:
            ${JSON.stringify({ trend: agentMkt?.demand_outlook?.trend || "moderate", news: agentMkt?.news }, null, 2)}
            
            Compute values and provide strong reasoning for both, outputting ONLY valid JSON matching your schema.
            `;

            const guardRes = await callLyzrAgent(GUARDRAILS_AGENT_ID || MARKET_RESEARCH_ID, guardrailsPrompt);
            const guardJson = guardRes.parsedJson || {};

            if (guardJson.suggested_floor && guardJson.suggested_ceiling) {
                console.log(`🛡️ Generated auto-guardrails: Floor ${guardJson.suggested_floor}, Ceiling ${guardJson.suggested_ceiling}`);
                await db.update(listings)
                    .set({
                        priceFloor: String(guardJson.suggested_floor),
                        floorReasoning: guardJson.floor_reasoning,
                        priceCeiling: String(guardJson.suggested_ceiling),
                        ceilingReasoning: guardJson.ceiling_reasoning,
                        guardrailsSource: "ai"
                    })
                    .where(eq(listings.id, listingId));
                guardrailsSetByAi = true;
                generatedGuardrails = {
                    floor: guardJson.suggested_floor,
                    ceiling: guardJson.suggested_ceiling,
                    floorReasoning: guardJson.floor_reasoning,
                    ceilingReasoning: guardJson.ceiling_reasoning,
                    source: "ai"
                };
            } else {
                console.warn(`⚠️ Failed to parse guardrails from Agent 10. Proceeding without auto-guardrails.`);
            }
        }

        // 6. Fetch Calendar Metrics for context sync
        console.log(`📊 Fetching calendar metrics for context...`);
        const calMetricsQuery = db
            .select({
                totalDays: sql<number>`COUNT(*)`,
                bookedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} IN ('reserved', 'booked') THEN 1 END)`,
                availableDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'available' THEN 1 END)`,
                blockedDays: sql<number>`COUNT(CASE WHEN ${inventoryMaster.status} = 'blocked' THEN 1 END)`,
                avgPrice: avg(inventoryMaster.currentPrice),
            })
            .from(inventoryMaster)
            .where(
                and(
                    eq(inventoryMaster.listingId, listingId),
                    gte(inventoryMaster.date, dateRange.from),
                    lte(inventoryMaster.date, dateRange.to)
                )
            );

        const calMetrics = await calMetricsQuery;
        const calResult = calMetrics[0];

        // 7. Fetch Revenue data + guest details from reservations
        const resQuery = db
            .select({
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
            .where(
                and(
                    eq(reservations.listingId, listingId),
                    lte(reservations.startDate, dateRange.to),
                    gte(reservations.endDate, dateRange.from)
                )
            );

        const resRows = await resQuery;

        // 7b. Fetch raw inventory rows for daily calendar
        const inventoryQuery = db
            .select()
            .from(inventoryMaster)
            .where(
                and(
                    eq(inventoryMaster.listingId, listingId),
                    gte(inventoryMaster.date, dateRange.from),
                    lte(inventoryMaster.date, dateRange.to)
                )
            )
            .orderBy(inventoryMaster.date);

        const rawInventory = await inventoryQuery;

        // ── TECHNICAL TRACE: Capture SQL queries for transparency ──
        const sqlTrace = [
            { name: "Property Info", sql: db.select().from(listings).where(eq(listings.id, listingId)).toSQL().sql },
            { name: "Calendar Metrics", sql: calMetricsQuery.toSQL().sql },
            { name: "Reservations", sql: resQuery.toSQL().sql },
            { name: "Daily Inventory", sql: inventoryQuery.toSQL().sql }
        ];

        const totalDays = Number(calResult?.totalDays || 0);
        const bookedDays = Number(calResult?.bookedDays || 0);
        const blockedDays = Number(calResult?.blockedDays || 0);
        const bookableDays = totalDays - blockedDays;
        const occupancy = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

        const totalRevenue = resRows.reduce((sum, r) => sum + Number(r.totalPrice || 0), 0);
        const avgDailyRate = resRows.length > 0
            ? resRows.reduce((sum, r) => sum + Number(r.pricePerNight || 0), 0) / resRows.length
            : Number(listing?.price || 0);
        const channelMix: Record<string, number> = {};
        resRows.forEach(r => {
            const ch = r.channelName || "Direct";
            channelMix[ch] = (channelMix[ch] || 0) + 1;
        });

        // 8. 🔄 SKIPPED OVERHEAD: LYZR GLOBAL CONTEXT SYNC
        // We now inject data directly into the chat prompt per-session using JSON,
        // which eliminates race conditions and speeds up Market Analysis significantly!

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✅ ANALYSIS COMPLETE in ${duration}s. Records updated.`);

        return NextResponse.json({
            success: true,
            eventsCount: allFindings.length,
            duration: `${duration}s`,
            sqlTrace: sqlTrace,
            guardrailsSetByAi,
            guardrails: generatedGuardrails
        });
    } catch (error) {
        console.error("❌ Market Analysis failed:", error);
        return NextResponse.json({
            error: "Market Analysis failed",
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
