import { connectDB, Listing, PricingRule, InventoryMaster, EngineRun, BenchmarkData, PropertyGroup } from "@/lib/db";
import mongoose from "mongoose";
import {
    computeDay,
    ListingConfig,
    Rule,
    BookingContext,
} from "./waterfall";

function toNum(val: string | number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toNumOrNull(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return typeof val === "string" ? parseFloat(val) : val;
}

function toIntArray(val: number[] | null | undefined): number[] {
    if (!val) return [1, 1, 1, 1, 1, 1, 1];
    return val;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function dateStr(d: Date): string {
    return d.toISOString().split("T")[0];
}

function average(nums: number[]): number {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

/**
 * Runs the pricing engine for a listing for the next 365 days.
 * Calculations are stored as proposals in InventoryMaster.
 */
export async function runPipeline(
    listingId: mongoose.Types.ObjectId | string,
    _triggerDetail?: string
) {
    await connectDB();

    const lid = typeof listingId === "string"
        ? new mongoose.Types.ObjectId(listingId)
        : listingId;

    const startedAt = new Date();

    try {
        const listing = await Listing.findById(lid).lean();
        if (!listing) {
            throw new Error(`Listing ${listingId} not found`);
        }

        // ── Resolve effective base price from benchmark data ───────────────────
        // Priority: benchmark.recommendedWeekday → benchmark.p50Rate → listing.price (Hostaway)
        // This wires competitor ADR into the engine so pricing is market-anchored, not static.
        const latestBenchmark = await BenchmarkData.findOne({
            orgId: listing.orgId,
            listingId: lid,
        }).sort({ createdAt: -1 }).select("recommendedWeekday recommendedWeekend p50Rate comps createdAt").lean();

        const hostawayPrice = toNum(listing.price); // always the Hostaway/manual fallback
        const oneYearAgo = addDays(new Date(), -365);
        const historicalPrices = await InventoryMaster.find({
            orgId: listing.orgId,
            listingId: lid,
            date: { $gte: dateStr(oneYearAgo), $lte: dateStr(new Date()) },
            currentPrice: { $gt: 0 },
        }).select("currentPrice").lean();
        const oneYearAvgBase = average(
            historicalPrices.map((d: any) => Number(d.currentPrice || 0)).filter((n) => n > 0)
        );

        const basePriceSource: "history_1y" | "benchmark" | "hostaway" =
            oneYearAvgBase > 0 ? "history_1y"
                : ((latestBenchmark?.recommendedWeekday && latestBenchmark.recommendedWeekday > 0) || (latestBenchmark?.p50Rate && latestBenchmark.p50Rate > 0))
                    ? "benchmark"
                    : "hostaway";

        const effectiveBasePrice =
            oneYearAvgBase > 0
                ? oneYearAvgBase
                :
            (latestBenchmark?.recommendedWeekday && latestBenchmark.recommendedWeekday > 0)
                ? latestBenchmark.recommendedWeekday
                : (latestBenchmark?.p50Rate && latestBenchmark.p50Rate > 0)
                    ? latestBenchmark.p50Rate
                    : hostawayPrice;
        const benchmarkCompCount = Array.isArray((latestBenchmark as any)?.comps)
            ? (latestBenchmark as any).comps.length
            : 0;
        const benchmarkFreshnessDays = latestBenchmark?.createdAt
            ? Math.max(0, Math.round((Date.now() - new Date(latestBenchmark.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
            : 365;
        const historySampleSize = historicalPrices.length;
        const historyConfidence = clamp((historySampleSize / 365) * 100, 0, 100);
        const benchmarkConfidence = clamp(
            (benchmarkCompCount >= 8 ? 70 : benchmarkCompCount >= 4 ? 55 : benchmarkCompCount > 0 ? 40 : 25) -
            Math.min(25, benchmarkFreshnessDays * 1.2),
            0,
            100
        );
        const basePriceConfidencePct = Math.round(
            basePriceSource === "history_1y"
                ? historyConfidence
                : basePriceSource === "benchmark"
                    ? benchmarkConfidence
                    : 30
        );
        const effectiveWeekendBase =
            (latestBenchmark?.recommendedWeekend && latestBenchmark.recommendedWeekend > 0)
                ? latestBenchmark.recommendedWeekend
                : 0; // 0 = waterfall will use effectiveBasePrice for weekends too
        const baseDriftPct =
            hostawayPrice > 0 ? ((effectiveBasePrice - hostawayPrice) / hostawayPrice) * 100 : 0;

        if (latestBenchmark || oneYearAvgBase > 0) {
            console.log(
                `[Pipeline] Base price resolved: weekday=${effectiveBasePrice}, ` +
                `weekend=${effectiveWeekendBase || effectiveBasePrice}, hostaway=${hostawayPrice}, drift=${baseDriftPct.toFixed(1)}%`
            );
        }
        if (Math.abs(baseDriftPct) >= 15) {
            console.warn(`[Pipeline] Base price drift alert for listing ${String(listing._id)}: ${baseDriftPct.toFixed(1)}%`);
        }
        await Listing.findByIdAndUpdate(lid, {
            $set: {
                basePriceSource,
                basePriceConfidencePct,
                basePriceSampleSize: basePriceSource === "history_1y" ? historySampleSize : benchmarkCompCount,
                basePriceLastComputedAt: new Date(),
            },
        });

        // Compute rolling occupancy % for the configured lookback window
        const lookbackDays: number = listing.occupancyLookbackDays ?? 30;
        let currentOccupancyPct = 0;
        if (listing.occupancyEnabled) {
            const lookbackStart = addDays(new Date(), -lookbackDays);
            const lookbackStartStr = dateStr(lookbackStart);
            const todayStr = dateStr(new Date());
            const lookbackDocs = await InventoryMaster.find({
                orgId: listing.orgId,
                listingId: lid,
                date: { $gte: lookbackStartStr, $lte: todayStr },
            }).select("status").lean();
            if (lookbackDocs.length > 0) {
                const bookedCount = lookbackDocs.filter((d) => d.status !== "available").length;
                currentOccupancyPct = (bookedCount / lookbackDocs.length) * 100;
            }
        }

        const defaultWindowProfiles = [
            { startDay: 0, endDay: 7, highThresholdPct: 90, highAdjPct: 10, lowThresholdPct: 50, lowAdjPct: -10 },
            { startDay: 8, endDay: 14, highThresholdPct: 85, highAdjPct: 8, lowThresholdPct: 55, lowAdjPct: -8 },
            { startDay: 15, endDay: 30, highThresholdPct: 80, highAdjPct: 6, lowThresholdPct: 60, lowAdjPct: -6 },
        ];
        const occupancyProfiles = Array.isArray(listing.occupancyWindowProfiles) && listing.occupancyWindowProfiles.length > 0
            ? listing.occupancyWindowProfiles
            : defaultWindowProfiles;

        const config: ListingConfig = {
            basePrice: effectiveBasePrice,
            basePriceWeekend: effectiveWeekendBase,
            absoluteMinPrice: toNum(listing.priceFloor),
            absoluteMaxPrice: toNum(listing.priceCeiling),
            defaultMinStay: 1,
            defaultMaxStay: listing.defaultMaxStay ?? 365,
            lowestMinStayAllowed: listing.lowestMinStayAllowed,
            allowedCheckinDays: toIntArray(listing.allowedCheckinDays),
            allowedCheckoutDays: toIntArray(listing.allowedCheckoutDays),
            lastMinuteEnabled: listing.lastMinuteEnabled,
            lastMinuteDaysOut: listing.lastMinuteDaysOut,
            lastMinuteDiscountPct: toNum(listing.lastMinuteDiscountPct),
            lastMinuteMinStay: listing.lastMinuteMinStay ?? null,
            lastMinuteRampEnabled: listing.lastMinuteRampEnabled ?? false,
            lastMinuteRampDays: listing.lastMinuteRampDays ?? 7,
            lastMinuteMaxDiscountPct: toNum(listing.lastMinuteMaxDiscountPct ?? 0),
            lastMinuteMinDiscountPct: toNum(listing.lastMinuteMinDiscountPct ?? 0),
            farOutEnabled: listing.farOutEnabled,
            farOutDaysOut: listing.farOutDaysOut,
            farOutMarkupPct: toNum(listing.farOutMarkupPct),
            farOutMinStay: listing.farOutMinStay ?? null,
            farOutMinPrice: toNum(listing.farOutMinPrice ?? 0),
            dowPricingEnabled: listing.dowPricingEnabled,
            dowDays: toIntArray(listing.dowDays),
            dowPriceAdjPct: toNum(listing.dowPriceAdjPct),
            dowMinStay: listing.dowMinStay ?? null,
            gapPreventionEnabled: listing.gapPreventionEnabled,
            minFragmentThreshold: listing.minFragmentThreshold,
            gapFillEnabled: listing.gapFillEnabled,
            gapFillLengthMin: listing.gapFillLengthMin,
            gapFillLengthMax: listing.gapFillLengthMax,
            gapFillDiscountPct: toNum(listing.gapFillDiscountPct),
            gapFillDiscountWeekdayPct: toNum(listing.gapFillDiscountWeekdayPct ?? 0),
            gapFillDiscountWeekendPct: toNum(listing.gapFillDiscountWeekendPct ?? 0),
            gapFillMaxDaysUntilCheckin: listing.gapFillMaxDaysUntilCheckin ?? 30,
            gapFillOverrideCico: listing.gapFillOverrideCico,
            adjacentAdjustmentEnabled: listing.adjacentAdjustmentEnabled ?? false,
            adjacentAdjustmentPct: toNum(listing.adjacentAdjustmentPct ?? 0),
            adjacentTurnoverCost: toNum(listing.adjacentTurnoverCost ?? 0),
            occupancyEnabled: listing.occupancyEnabled ?? false,
            currentOccupancyPct,
            occupancyTargetPct: listing.occupancyTargetPct ?? 80,
            occupancyHighThresholdPct: listing.occupancyHighThresholdPct ?? 85,
            occupancyHighAdjPct: toNum(listing.occupancyHighAdjPct ?? 8),
            occupancyLowThresholdPct: listing.occupancyLowThresholdPct ?? 60,
            occupancyLowAdjPct: toNum(listing.occupancyLowAdjPct ?? -10),
            occupancyWindowProfiles: occupancyProfiles,
            weekendMinPrice: toNum(listing.weekendMinPrice ?? 0),
            weekendDays: listing.weekendDays ?? [3, 4], // Thu/Fri Dubai default
        };

        // Listing-level rules (highest priority)
        const listingRuleRows = await PricingRule.find({
            listingId: lid,
            scope: { $in: ["listing", null] }, // null for legacy rows that predate scope field
            enabled: true,
        }).sort({ priority: 1 }).lean();

        // Group-level rules — find all groups this listing belongs to, then load their rules
        const groups = await PropertyGroup.find({
            orgId: listing.orgId,
            listingIds: lid,
        }).select("_id listingIds").lean();

        const groupIds = groups.map((g) => g._id);
        const groupRuleRows = groupIds.length > 0
            ? await PricingRule.find({
                groupId: { $in: groupIds },
                scope: "group",
                enabled: true,
              }).sort({ priority: 1 }).lean()
            : [];

        // Merge: group rules take precedence over listing rules.
        // Group rules get a priority offset (-1000) so they sort before listing rules
        // when the waterfall picks the highest-priority matching rule.
        const ruleRows = [
            ...groupRuleRows.map((r) => ({ ...r, priority: (r.priority ?? 0) - 1000 })),
            ...listingRuleRows,
        ];

        const allRules: Rule[] = ruleRows.map((r) => ({
            id: r._id.toString(),
            ruleType: r.ruleType as any,
            name: r.name,
            enabled: r.enabled,
            priority: r.priority,
            startDate: r.startDate ?? null,
            endDate: r.endDate ?? null,
            daysOfWeek: r.daysOfWeek ?? null,
            minNights: r.minNights ?? null,
            priceOverride: toNumOrNull(r.priceOverride),
            priceAdjPct: toNumOrNull(r.priceAdjPct),
            minPriceOverride: toNumOrNull(r.minPriceOverride),
            maxPriceOverride: toNumOrNull(r.maxPriceOverride),
            minStayOverride: r.minStayOverride ?? null,
            isBlocked: r.isBlocked,
            closedToArrival: r.closedToArrival,
            closedToDeparture: r.closedToDeparture,
            suspendLastMinute: r.suspendLastMinute,
            suspendGapFill: r.suspendGapFill,
        }));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = addDays(today, 364);

        const existingInventory = await InventoryMaster.find({
            orgId: listing.orgId,
            listingId: lid,
            date: { $gte: dateStr(today) },
        }).sort({ date: 1 }).lean();

        const bookingMap = new Map<string, { isBooked: boolean }>();
        for (const day of existingInventory) {
            bookingMap.set(day.date, { isBooked: day.status !== "available" });
        }

        const gapMap = computeGaps(today, endDate, bookingMap);
        const occupancyByWindow = new Map<string, number>();
        for (const p of config.occupancyWindowProfiles || []) {
            const windowStart = addDays(today, p.startDay);
            const windowEnd = addDays(today, p.endDay);
            const slice = existingInventory.filter(
                (d) => d.date >= dateStr(windowStart) && d.date <= dateStr(windowEnd)
            );
            if (slice.length > 0) {
                const bookedCount = slice.filter((d) => d.status !== "available").length;
                occupancyByWindow.set(`${p.startDay}-${p.endDay}`, (bookedCount / slice.length) * 100);
            }
        }
        const peerListingIds = Array.from(
            new Set(
                groups.flatMap((g: any) => (g.listingIds || []).map((id: any) => String(id))).filter((id: string) => id !== String(lid))
            )
        ).map((id) => new mongoose.Types.ObjectId(id));
        const peerInventory = peerListingIds.length > 0
            ? await InventoryMaster.find({
                orgId: listing.orgId,
                listingId: { $in: peerListingIds },
                date: { $gte: dateStr(today), $lte: dateStr(addDays(today, 364)) },
              }).select("date status").lean()
            : [];
        const groupOccupancyByWindow = new Map<string, { occupancyPct: number; sampleSize: number }>();
        for (const p of config.occupancyWindowProfiles || []) {
            const windowStart = dateStr(addDays(today, p.startDay));
            const windowEnd = dateStr(addDays(today, p.endDay));
            const slice = peerInventory.filter((d) => d.date >= windowStart && d.date <= windowEnd);
            if (slice.length > 0) {
                const bookedCount = slice.filter((d) => d.status !== "available").length;
                groupOccupancyByWindow.set(`${p.startDay}-${p.endDay}`, {
                    occupancyPct: (bookedCount / slice.length) * 100,
                    sampleSize: slice.length,
                });
            }
        }
        await Listing.findByIdAndUpdate(lid, {
            $set: {
                groupOccupancyProfiles: (config.occupancyWindowProfiles || []).map((p) => {
                    const k = `${p.startDay}-${p.endDay}`;
                    const v = groupOccupancyByWindow.get(k);
                    return {
                        startDay: p.startDay,
                        endDay: p.endDay,
                        occupancyPct: Number((v?.occupancyPct ?? 0).toFixed(2)),
                        sampleSize: v?.sampleSize ?? 0,
                        groupIds: groups.map((g: any) => String(g._id)),
                    };
                }),
            },
        });

        let daysChanged = 0;
        const bulkOps: any[] = [];

        for (let i = 0; i < 365; i++) {
            const currentDate = addDays(today, i);
            const ds = dateStr(currentDate);
            const booking = bookingMap.get(ds);
            const gap = gapMap.get(ds);

            const bookingCtx: BookingContext = {
                isBooked: booking?.isBooked ?? false,
                gapLength: gap?.gapLength ?? null,
                gapStart: gap?.gapStart ?? null,
                gapEnd: gap?.gapEnd ?? null,
                adjacentToBooking:
                    Boolean(bookingMap.get(dateStr(addDays(currentDate, -1)))?.isBooked) ||
                    Boolean(bookingMap.get(dateStr(addDays(currentDate, 1)))?.isBooked),
            };

            const leadTime = i;
            const profile = (config.occupancyWindowProfiles || []).find(
                (p) => leadTime >= p.startDay && leadTime <= p.endDay
            );
            const occupancyForDay = profile
                ? (occupancyByWindow.get(`${profile.startDay}-${profile.endDay}`) ?? currentOccupancyPct)
                : currentOccupancyPct;
            const groupWindow = profile
                ? groupOccupancyByWindow.get(`${profile.startDay}-${profile.endDay}`)
                : undefined;
            const blendedOccupancyForDay =
                listing.useGroupOccupancyProfile !== false && profile && groupWindow
                    ? (
                        occupancyForDay * (1 - (Number(listing.groupOccupancyWeightPct ?? 50) / 100)) +
                        groupWindow.occupancyPct * (Number(listing.groupOccupancyWeightPct ?? 50) / 100)
                    )
                    : occupancyForDay;

            const dayConfig: ListingConfig = { ...config, currentOccupancyPct: blendedOccupancyForDay };
            const result = computeDay(currentDate, today, dayConfig, allRules, bookingCtx);

            bulkOps.push({
                updateOne: {
                    filter: { orgId: listing.orgId, listingId: lid, date: ds },
                    update: {
                        $set: {
                            orgId: listing.orgId,
                            listingId: lid,
                            date: ds,
                            status: bookingCtx.isBooked ? "booked" : "available",
                            currentPrice: effectiveBasePrice,
                            proposedPrice: result.price,
                            reasoning: result.note,
                            proposalStatus: "pending",
                            minStay: result.minimumStay,
                            maxStay: result.maximumStay,
                            closedToArrival: result.closedToArrival === 1,
                            closedToDeparture: result.closedToDeparture === 1,
                        },
                    },
                    upsert: true,
                },
            });

            daysChanged++;
        }

        if (bulkOps.length > 0) {
            const BATCH_SIZE = 100;
            for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
                await InventoryMaster.bulkWrite(bulkOps.slice(i, i + BATCH_SIZE));
            }
        }

        const durationMs = Date.now() - startedAt.getTime();
        const run = await EngineRun.create({
            orgId: listing.orgId,
            listingId: lid,
            startedAt,
            status: "SUCCESS",
            daysChanged,
            durationMs,
        });

        return run;
    } catch (err: any) {
        const durationMs = Date.now() - startedAt.getTime();
        const listing = await Listing.findById(lid).select("orgId").lean();
        await EngineRun.create({
            orgId: listing?.orgId || new mongoose.Types.ObjectId(),
            listingId: lid,
            startedAt,
            status: "FAILED",
            errorMessage: err.message,
            durationMs,
        });
        throw err;
    }
}

interface GapInfo {
    gapLength: number;
    gapStart: string;
    gapEnd: string;
}

function computeGaps(
    startDate: Date,
    endDate: Date,
    bookingMap: Map<string, { isBooked: boolean }>
): Map<string, GapInfo> {
    const gapMap = new Map<string, GapInfo>();
    const totalDays =
        Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const dates: string[] = [];
    const booked: boolean[] = [];

    for (let i = 0; i < totalDays; i++) {
        const d = addDays(startDate, i);
        const ds = dateStr(d);
        dates.push(ds);
        const info = bookingMap.get(ds);
        booked.push(info?.isBooked ?? false);
    }

    let i = 0;
    while (i < totalDays) {
        if (booked[i]) { i++; continue; }

        const gapStartIdx = i;
        const hasBookingBefore = gapStartIdx > 0 && booked[gapStartIdx - 1];

        while (i < totalDays && !booked[i]) { i++; }

        const gapEndIdx = i - 1;
        const hasBookingAfter = i < totalDays && booked[i];

        if (hasBookingBefore && hasBookingAfter) {
            const gapLength = gapEndIdx - gapStartIdx + 1;
            const gapInfo: GapInfo = { gapLength, gapStart: dates[gapStartIdx], gapEnd: dates[gapEndIdx] };
            for (let j = gapStartIdx; j <= gapEndIdx; j++) {
                gapMap.set(dates[j], gapInfo);
            }
        }
    }

    return gapMap;
}
