import {
    connectDB,
    ChatMessage,
    InventoryMaster,
    Reservation,
    MarketEvent,
    BenchmarkData,
    Listing,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { chatRequestSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { CRO_ROUTER_AGENT_ID } from "@/lib/agents/constants";
import { callLyzrAgent, extractJson } from "@/lib/lyzr/client";
import mongoose from "mongoose";

const AGENT_ID = process.env.AGENT_ID || CRO_ROUTER_AGENT_ID;

export async function POST(req: Request) {
    const ip = getClientIp(req);

    const rateCheck = checkRateLimit(`ai-chat:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI chat limit reached. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body: any = await req.json();
        const validation = chatRequestSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat request", 400, formatZodErrors(validation.error));
        }

        const { message, context, sessionId, dateRange } = validation.data;

        await connectDB();

        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        const lyzrSessionId = sessionId || (
            context.type === "portfolio"
                ? "portfolio-session"
                : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`
        );

        const isSystemMsg = message.startsWith("[SYSTEM]");

        // Check if data injection is needed
        const prevDataMsgs = await ChatMessage.find({
            orgId,
            sessionId: lyzrSessionId,
            role: "user",
            content: { $not: /^\[SYSTEM\]/ },
        }).limit(1).lean();

        const needsDataInjection = prevDataMsgs.length === 0 && !isSystemMsg;

        let propertyDataPayload: any = null;

        if (needsDataInjection && context.type === "property" && context.propertyId) {
            const pid = new mongoose.Types.ObjectId(String(context.propertyId));
            const dateFrom = dateRange?.from || '1970-01-01';
            const dateTo = dateRange?.to || '9999-12-31';

            const [listing, , benchmarkDoc] = await Promise.all([
                Listing.findById(pid).lean(),
                MarketEvent.find({ listingId: pid, endDate: { $gte: dateFrom }, startDate: { $lte: dateTo } }).limit(50).lean(),
                BenchmarkData.findOne({ listingId: pid, dateTo: { $gte: dateFrom }, dateFrom: { $lte: dateTo } }).lean(),
                Reservation.find({ listingId: pid, checkOut: { $gte: dateFrom }, checkIn: { $lte: dateTo } }).lean(),
                InventoryMaster.find({ listingId: pid, date: { $gte: dateFrom, $lte: dateTo } }).lean(),
            ]);

            const [calResult] = await InventoryMaster.aggregate([
                { $match: { listingId: pid, date: { $gte: dateFrom, $lte: dateTo } } },
                {
                    $group: {
                        _id: null,
                        totalDays: { $sum: 1 },
                        bookedDays: { $sum: { $cond: [{ $in: ["$status", ["booked", "reserved"]] }, 1, 0] } },
                        availableDays: { $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] } },
                        blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                        avgPrice: { $avg: "$currentPrice" },
                    },
                },
            ]);

            const uiMetrics = context.metrics;
            const totalDays = uiMetrics?.totalDays ?? Number(calResult?.totalDays || 0);
            const bookedDays = uiMetrics?.bookedDays ?? Number(calResult?.bookedDays || 0);
            const blockedDays = uiMetrics?.blockedDays ?? Number(calResult?.blockedDays || 0);
            const bookableDays = uiMetrics?.bookableDays ?? (totalDays - blockedDays);
            const occupancy = uiMetrics?.occupancy ?? (bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0);
            const avgCalPrice = uiMetrics?.avgPrice ?? Number(calResult?.avgPrice || listing?.price || 0);

            propertyDataPayload = {
                today: new Date().toISOString().split('T')[0],
                analysis_window: { from: dateFrom, to: dateTo },
                property: {
                    listingId: pid.toString(),
                    name: listing?.name || context.propertyName || "Property",
                    bedrooms: listing?.bedroomsNumber || 1,
                    current_price: Number(listing?.price || 0),
                    floor_price: Number(listing?.priceFloor || 0),
                    ceiling_price: Number(listing?.priceCeiling || 0),
                },
                metrics: {
                    occupancy_pct: occupancy,
                    booked_nights: bookedDays,
                    avg_nightly_rate: avgCalPrice,
                },
                benchmark: benchmarkDoc
                    ? { verdict: benchmarkDoc.verdict, percentile: benchmarkDoc.percentile, p50: benchmarkDoc.p50Rate }
                    : null,
            };
        }

        // ── Portfolio context injection ─────────────────────────────────────────
        // When the user is in portfolio mode, aggregate ALL listings so the agent
        // has real numbers instead of working blind.
        if (needsDataInjection && context.type === "portfolio") {
            const dateFrom = dateRange?.from || new Date().toISOString().split('T')[0];
            const plus29 = new Date();
            plus29.setDate(plus29.getDate() + 29);
            const dateTo = dateRange?.to || plus29.toISOString().split('T')[0];

            const allListings = await Listing.find({ isActive: true })
                .select("_id name area bedroomsNumber price priceFloor priceCeiling currencyCode")
                .lean();

            const statsResult = await InventoryMaster.aggregate([
                { $match: { date: { $gte: dateFrom, $lte: dateTo } } },
                {
                    $group: {
                        _id: "$listingId",
                        totalDays: { $sum: 1 },
                        bookedDays: { $sum: { $cond: [{ $in: ["$status", ["booked", "reserved"]] }, 1, 0] } },
                        blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
                        totalRevenue: { $sum: { $cond: [{ $in: ["$status", ["booked", "reserved"]] }, "$currentPrice", 0] } },
                        avgPrice: { $avg: "$currentPrice" },
                    },
                },
            ]);

            const properties = allListings.map((l: any) => {
                const stat = statsResult.find((s: any) => s._id.toString() === l._id.toString());
                const bookable = stat ? stat.totalDays - stat.blockedDays : 0;
                const occupancy = bookable > 0 ? Math.round((stat!.bookedDays / bookable) * 100) : 0;
                return {
                    id: l._id.toString(),
                    name: l.name,
                    area: l.area,
                    bedrooms: l.bedroomsNumber,
                    base_price: Number(l.price),
                    floor_price: Number(l.priceFloor),
                    ceiling_price: Number(l.priceCeiling),
                    currency: l.currencyCode || "AED",
                    occupancy_pct: occupancy,
                    booked_nights: stat?.bookedDays ?? 0,
                    revenue_in_window: Number((stat?.totalRevenue ?? 0).toFixed(2)),
                    avg_nightly_rate: stat?.avgPrice ? Math.round(Number(stat.avgPrice)) : Number(l.price),
                };
            });

            const totalRevenue = properties.reduce((s, p) => s + p.revenue_in_window, 0);
            const avgOccupancy = properties.length
                ? Math.round(properties.reduce((s, p) => s + p.occupancy_pct, 0) / properties.length)
                : 0;

            propertyDataPayload = {
                today: new Date().toISOString().split('T')[0],
                analysis_window: { from: dateFrom, to: dateTo },
                portfolio_summary: {
                    total_properties: allListings.length,
                    avg_occupancy_pct: avgOccupancy,
                    total_revenue_in_window: totalRevenue.toFixed(2),
                },
                properties,
            };
        }

        // Save user message
        await ChatMessage.create({
            orgId,
            sessionId: lyzrSessionId,
            role: "user",
            content: message,
            context: {
                type: context.type,
                propertyId: context.propertyId
                    ? new mongoose.Types.ObjectId(String(context.propertyId))
                    : undefined,
            },
            metadata: { context, dateRange },
        });

        let anchoredMessage = message;
        if (!isSystemMsg && propertyDataPayload) {
            anchoredMessage = `[SYSTEM: CURRENT PROPERTY DATA]\n${JSON.stringify(propertyDataPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
        }

        const lyzrResult = await callLyzrAgent({
            agentId: AGENT_ID,
            message: anchoredMessage,
            userId: "priceos-user",
            sessionId: lyzrSessionId,
        });

        if (!lyzrResult.ok) {
            return apiError("AI_SERVICE_ERROR", lyzrResult.error || "Failed to connect to Lyzr Agent", 502);
        }

        const agentReply = lyzrResult.response;
        const parsedJson = lyzrResult.parsedJson as any;

        // Apply Guardrails
        // For property mode: use the single property's floor/ceiling.
        // For portfolio mode: enforce per-proposal using each property's floor/ceiling from the
        // properties array, falling back to portfolio-level 0 (no cap) when not found.
        const floorPrice = Number(propertyDataPayload?.property?.floor_price || 0);
        const ceilingPrice = Number(propertyDataPayload?.property?.ceiling_price || 0);
        let proposals = parsedJson?.proposals || null;
        if (proposals && Array.isArray(proposals)) {
            if (context.type === "portfolio" && propertyDataPayload?.properties) {
                // Build a quick lookup: listingId → { floor, ceiling }
                const guardrailMap = new Map<string, { floor: number; ceiling: number }>(
                    (propertyDataPayload.properties as any[]).map((p: any) => [
                        p.id,
                        { floor: Number(p.floor_price || 0), ceiling: Number(p.ceiling_price || 0) },
                    ])
                );
                proposals = proposals.map((p: any) => {
                    const g = guardrailMap.get(String(p.listing_id || p.listingId || ""));
                    return g ? enforceGuardrails([p], g.floor, g.ceiling)[0] : p;
                });
            } else if (floorPrice > 0 || ceilingPrice > 0) {
                proposals = enforceGuardrails(proposals, floorPrice, ceilingPrice);
            }
        }

        // Save assistant reply
        await ChatMessage.create({
            orgId,
            sessionId: lyzrSessionId,
            role: "assistant",
            content: agentReply,
            context: {
                type: context.type,
                propertyId: context.propertyId
                    ? new mongoose.Types.ObjectId(String(context.propertyId))
                    : undefined,
            },
            metadata: { context, dateRange, proposals },
        });

        return apiSuccess({ message: agentReply, proposals });

    } catch (error: any) {
        console.error("❌ [v1/ai/chat POST] Error:", error);
        return apiError("INTERNAL_ERROR", error.message || "Failed to process chat", 500);
    }
}


function enforceGuardrails(proposals: any[], floor: number, ceiling: number): any[] {
    return proposals.map(p => {
        let price = Number(p.proposed_price || 0);
        if (floor > 0 && price < floor) price = floor;
        if (ceiling > 0 && price > ceiling) price = ceiling;
        return { ...p, proposed_price: price, guard_verdict: "APPROVED" };
    });
}
