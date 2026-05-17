import { connectDB, Listing, InventoryMaster, MarketEvent, PricingRule, Reservation } from "@/lib/db";
import { format, addDays } from "date-fns";
import mongoose from "mongoose";

export interface ContextDateRange {
  from: string;
  to: string;
}

/**
 * Build context for a property-level agent (CRO Router, sub-agents).
 * Date-windowed: only includes data within the specified range.
 */
export async function buildAgentContext(
  orgId: string,
  listingId?: string | null,
  dateRange?: ContextDateRange
): Promise<string> {
  // Portfolio-level requests without a listingId use the richer dashboard builder
  if (!listingId) {
    return buildDashboardContext(orgId);
  }

  await connectDB();
  const orgObjectId = new mongoose.Types.ObjectId(orgId);

  const start = dateRange?.from ? new Date(dateRange.from) : new Date();
  const end = dateRange?.to ? new Date(dateRange.to) : addDays(start, 30);
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");
  const dateLabel = `${startStr} to ${endStr}`;

  const listingObjectId = new mongoose.Types.ObjectId(listingId);

  // Fetch all DB data in parallel — was sequential before (wasted 2-5s per query)
  const [listing, calendar, reservations, rules, events] = await Promise.all([
    Listing.findOne({ _id: listingObjectId, orgId: orgObjectId }).lean(),
    InventoryMaster.find({ listingId: listingObjectId, date: { $gte: startStr, $lte: endStr } })
      .sort({ date: 1 }).lean(),
    Reservation.find({
      listingId: listingObjectId,
      status: { $ne: "cancelled" }, // match calendar-metrics: include confirmed + pending + checked_in
      checkIn: { $lte: endStr },
      checkOut: { $gte: startStr },
    }).lean(),
    PricingRule.find({ listingId: listingObjectId, enabled: true }).lean(),
    MarketEvent.find({ orgId: orgObjectId, endDate: { $gte: startStr }, startDate: { $lte: endStr }, isActive: true }).lean(),
  ]);

  if (!listing) {
    throw new Error(`Property ${listingId} not found or access denied.`);
  }

  const missingFields: string[] = [];
  if (!listing.priceFloor) missingFields.push("priceFloor");
  if (!listing.priceCeiling) missingFields.push("priceCeiling");
  if (!listing.area) missingFields.push("area");
  if (!listing.city) missingFields.push("city");

  const property: Record<string, any> = {
    id: listing._id.toString(),
    name: listing.name,
    area: listing.area || "Dubai",
    city: listing.city || "Dubai",
    bedrooms: listing.bedroomsNumber,
    bathrooms: listing.bathroomsNumber,
    person_capacity: listing.personCapacity,
    current_price: `${listing.currencyCode || "AED"} ${listing.price}`,
    floor_price: `${listing.currencyCode || "AED"} ${listing.priceFloor || 0}`,
    ceiling_price: `${listing.currencyCode || "AED"} ${listing.priceCeiling || 0}`,
    amenities: listing.amenities || [],
  };

  if (missingFields.length > 0) {
    property.data_warning = `Missing or zero values for: ${missingFields.join(", ")}. Ask the property manager to complete setup.`;
  }

  // Compact inventory: aggregate metrics + only non-booked days (available/blocked)
  let bookedCount = 0;
  let blockedCount = 0;
  let revenue = 0;
  const nonBookedDays: any[] = [];

  // Build reservation booked-date set first — used both for synthetic calendar overlay
  // and for revenue computation. Same Set-based dedup approach as calendar-metrics.
  const resBookedSet = new Set<string>();
  for (const r of reservations as any[]) {
    let cur = new Date(r.checkIn > startStr ? r.checkIn : startStr);
    const resEnd = new Date(r.checkOut < endStr ? r.checkOut : endStr);
    while (cur < resEnd) {
      resBookedSet.add(format(cur, "yyyy-MM-dd"));
      cur = addDays(cur, 1);
    }
  }

  // Fallback: if InventoryMaster has no records, generate synthetic days.
  // Overlay confirmed reservations so occupancy matches what the calendar shows.
  // Without this overlay, booked days appear as "available" and agent reports 0% occupancy.
  const effectiveCalendar = calendar.length > 0 ? calendar : (() => {
    const syntheticDays: any[] = [];
    let cur = new Date(start);
    while (cur <= end) {
      const dateStr = format(cur, "yyyy-MM-dd");
      const isBooked = resBookedSet.has(dateStr);
      syntheticDays.push({
        date: dateStr,
        status: isBooked ? "booked" : "available",
        // Price is 0 for booked days — revenue is computed from reservation records below
        currentPrice: isBooked ? 0 : (listing.price || 0),
        minStay: null,
      });
      cur = addDays(cur, 1);
    }
    return syntheticDays;
  })();

  const isSyntheticCalendar = calendar.length === 0;

  for (const day of effectiveCalendar) {
    if (day.status === "booked") { bookedCount++; revenue += Number(day.currentPrice); }
    else if (day.status === "blocked") { blockedCount++; }
    else {
      nonBookedDays.push({ date: day.date, price: day.currentPrice, min_stay: day.minStay });
    }
  }

  // For synthetic calendars, revenue from day prices is 0 (we zero them out above).
  // Compute actual revenue from reservation records, prorated to the analysis window.
  if (isSyntheticCalendar && reservations.length > 0) {
    revenue = (reservations as any[]).reduce((sum: number, r: any) => {
      const cin = r.checkIn > startStr ? r.checkIn : startStr;
      const cout = r.checkOut < endStr ? r.checkOut : endStr;
      if (cout <= cin) return sum;
      const windowNights = Math.ceil((new Date(cout).getTime() - new Date(cin).getTime()) / 86_400_000);
      const perNight = (r.nights || 1) > 0 ? (r.totalPrice || 0) / (r.nights || 1) : 0;
      return sum + windowNights * perNight;
    }, 0);
  }

  const totalDays = effectiveCalendar.length;
  const bookableDays = totalDays - blockedCount;

  const metrics = {
    total_days: totalDays,
    bookable_days: bookableDays,
    booked_days: bookedCount,
    blocked_days: blockedCount,
    occupancy_pct: bookableDays > 0 ? ((bookedCount / bookableDays) * 100).toFixed(1) : 0,
    total_revenue: revenue,
    data_note: isSyntheticCalendar
      ? `No Hostaway inventory sync. Occupancy derived from ${reservations.length} reservation record(s); available-day prices use listing base rate. Run sync for real daily rates.`
      : undefined,
  };

  const activeBookings = reservations.map(r => ({
    guest_name: r.guestName,
    channel: r.channelName,
    check_in: r.checkIn,
    check_out: r.checkOut,
    nights: r.nights,
    total_price: r.totalPrice,
  }));

  const pricingRules = rules.map(r => ({
    name: r.name,
    type: r.ruleType,
    priority: r.priority,
    adjust_pct: r.priceAdjPct,
    days_of_week: r.daysOfWeek,
  }));

  // --- [AVAILABLE_DAYS] compact format ---
  // If all days share the same price + min_stay, emit a single range descriptor.
  // Otherwise emit default + only the overrides. Saves ~500 tokens vs 31 raw objects.
  const availableDaysSection = (() => {
    if (nonBookedDays.length === 0) return { count: 0 };
    const prices = new Set(nonBookedDays.map((d: any) => d.price));
    const minStays = new Set(nonBookedDays.map((d: any) => d.min_stay));
    const defaultPrice = nonBookedDays[0].price;
    const defaultMinStay = nonBookedDays[0].min_stay;
    if (prices.size === 1 && minStays.size === 1) {
      return {
        count: nonBookedDays.length,
        range: `${nonBookedDays[0].date} to ${nonBookedDays[nonBookedDays.length - 1].date}`,
        default_price: defaultPrice,
        default_min_stay: defaultMinStay,
        overrides: [],
      };
    }
    const overrides = nonBookedDays
      .filter((d: any) => d.price !== defaultPrice || d.min_stay !== defaultMinStay)
      .map((d: any) => ({ date: d.date, price: d.price, min_stay: d.min_stay }));
    return {
      count: nonBookedDays.length,
      dates: nonBookedDays.map((d: any) => d.date),
      default_price: defaultPrice,
      default_min_stay: defaultMinStay,
      overrides,
    };
  })();

  // --- [MARKET_EVENTS] — only include events from trusted sources ---
  // "ai_detected" events have incorrect upliftPct: 0 (AI-hallucinated duplicates of DTCM entries).
  // "serp"/"perplexity" are news articles, not confirmed events — collapse to digest.
  const TRUSTED_SOURCES = new Set(["dtcm", "manual", "market_template"]);
  const NEWS_SOURCES = new Set(["serp", "perplexity"]);
  const confirmedEvents = events.filter((e: any) => TRUSTED_SOURCES.has(e.source));
  const newsSignals    = events.filter((e: any) => NEWS_SOURCES.has(e.source));

  const confirmedEventsList = confirmedEvents.map((e: any) => ({
    name: e.name,
    start: e.startDate,
    end: e.endDate,
    impact: e.impactLevel,
    premium_pct: e.upliftPct,
  }));

  const newsDigest = newsSignals.length === 0 ? null : (() => {
    const avgUplift = newsSignals.reduce((s: number, e: any) => s + (e.upliftPct || 0), 0) / newsSignals.length;
    const negItems = newsSignals
      .filter((e: any) => (e.upliftPct || 0) < 0)
      .sort((a: any, b: any) => (a.upliftPct || 0) - (b.upliftPct || 0))
      .slice(0, 5)
      .map((e: any) => e.name);
    const posItems = newsSignals
      .filter((e: any) => (e.upliftPct || 0) >= 0)
      .sort((a: any, b: any) => (b.upliftPct || 0) - (a.upliftPct || 0))
      .slice(0, 5)
      .map((e: any) => e.name);
    return {
      article_count: newsSignals.length,
      period: dateLabel,
      dominant_signal: avgUplift < -5 ? "negative" : avgUplift > 5 ? "positive" : "mixed",
      negative_signals: negItems.length ? negItems.join("; ") : null,
      positive_signals: posItems.length ? posItems.join("; ") : null,
      net_adjustment: +(avgUplift / 100).toFixed(2),
    };
  })();

  const marketEventsSection: Record<string, any> = { confirmed_events: confirmedEventsList };
  if (newsDigest) marketEventsSection.news_digest = newsDigest;

  const sections: string[] = [
    `[ANALYSIS_WINDOW]\n${dateLabel}`,
    `[PROPERTY]\n${JSON.stringify(property)}`,
    `[METRICS]\n${JSON.stringify(metrics)}`,
    `[AVAILABLE_DAYS]\n${JSON.stringify(availableDaysSection)}`,
    `[BOOKINGS]\n${JSON.stringify(activeBookings)}`,
    `[PRICING_RULES]\n${JSON.stringify(pricingRules)}`,
    `[MARKET_EVENTS]\n${JSON.stringify(marketEventsSection)}`,
  ];

  return sections.join("\n\n");
}

/**
 * Build rich context for the Dashboard / Portfolio agent.
 * NO date restrictions — aggregates ALL available data so the agent can answer
 * any portfolio question (cancellation rate, revenue trends, channel mix, etc.).
 */
async function buildDashboardContext(orgId: string): Promise<string> {
  await connectDB();
  const orgObjectId = new mongoose.Types.ObjectId(orgId);
  const today = format(new Date(), "yyyy-MM-dd");
  const next30 = format(addDays(new Date(), 30), "yyyy-MM-dd");

  const listings = await Listing.find({ orgId: orgObjectId, isActive: true })
    .select("name city area bedroomsNumber price currencyCode priceFloor priceCeiling")
    .lean();

  const listingIds = listings.map((l) => l._id);

  const [
    allReservations,
    forwardInventory,
    upcomingEvents,
  ] = await Promise.all([
    Reservation.find({ listingId: { $in: listingIds } })
      .select("listingId guestName channelName checkIn checkOut nights totalPrice status")
      .sort({ checkIn: -1 })
      .limit(500)
      .lean(),
    InventoryMaster.aggregate([
      { $match: { listingId: { $in: listingIds }, date: { $gte: today, $lte: next30 } } },
      {
        $group: {
          _id: "$listingId",
          totalDays: { $sum: 1 },
          bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
          blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
          avgPrice: { $avg: "$currentPrice" },
          pendingProposals: { $sum: { $cond: [{ $eq: ["$proposalStatus", "pending"] }, 1, 0] } },
        },
      },
    ]),
    MarketEvent.find({
      orgId: orgObjectId,
      endDate: { $gte: today },
      isActive: true,
    }).sort({ startDate: 1 }).limit(20).lean(),
  ]);

  // Aggregate reservation stats
  const totalReservations = allReservations.length;
  const confirmed = allReservations.filter((r) => r.status === "confirmed" || r.status === "checked_in" || r.status === "checked_out");
  const cancelled = allReservations.filter((r) => r.status === "cancelled");
  const totalRevenue = confirmed.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const cancellationRate = totalReservations > 0
    ? ((cancelled.length / totalReservations) * 100).toFixed(1)
    : "0";

  // Channel breakdown
  const channelMap: Record<string, { revenue: number; count: number }> = {};
  for (const r of confirmed) {
    const ch = r.channelName || "Direct";
    if (!channelMap[ch]) channelMap[ch] = { revenue: 0, count: 0 };
    channelMap[ch].revenue += r.totalPrice || 0;
    channelMap[ch].count++;
  }

  // Per-property stats from forward inventory
  const invMap = new Map(forwardInventory.map((r: any) => [r._id.toString(), r]));

  const propertyStats = listings.map((l: any) => {
    const inv = invMap.get(l._id.toString());
    const totalDays = inv?.totalDays || 0;
    const bookable = totalDays - (inv?.blockedDays || 0);
    const booked = inv?.bookedDays || 0;
    return {
      name: l.name,
      city: l.city,
      base_price: `${l.currencyCode} ${l.price}`,
      forward_30d_occupancy: bookable > 0 ? `${((booked / bookable) * 100).toFixed(0)}%` : "N/A",
      forward_30d_avg_price: inv?.avgPrice ? Math.round(inv.avgPrice) : l.price,
      pending_proposals: inv?.pendingProposals || 0,
    };
  });

  // Average LOS
  const totalNights = confirmed.reduce((s, r) => s + (r.nights || 0), 0);
  const avgLOS = confirmed.length > 0 ? (totalNights / confirmed.length).toFixed(1) : "N/A";

  const portfolio = {
    total_properties: listings.length,
    properties: propertyStats,
  };

  const reservationsSummary = {
    total_reservations: totalReservations,
    confirmed_bookings: confirmed.length,
    cancelled_bookings: cancelled.length,
    cancellation_rate: `${cancellationRate}%`,
    total_revenue: totalRevenue,
    avg_length_of_stay: avgLOS,
    currency: listings[0]?.currencyCode || "AED",
  };

  const channelMix = Object.entries(channelMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([channel, data]) => ({ channel, ...data }));

  // Same digest pattern — only include trusted sources; exclude ai_detected (bad upliftPct data)
  const TRUSTED_SOURCES_DASH = new Set(["dtcm", "manual", "market_template"]);
  const NEWS_SOURCES_DASH = new Set(["serp", "perplexity"]);
  const confirmedUpcoming = upcomingEvents.filter((e: any) => TRUSTED_SOURCES_DASH.has(e.source));
  const newsUpcoming      = upcomingEvents.filter((e: any) => NEWS_SOURCES_DASH.has(e.source));

  const confirmedUpcomingList = confirmedUpcoming.map((e) => ({
    name: e.name,
    start: e.startDate,
    end: e.endDate,
    impact: e.impactLevel,
    premium_pct: e.upliftPct,
  }));

  const dashNewsDigest = newsUpcoming.length === 0 ? null : (() => {
    const avgUplift = newsUpcoming.reduce((s, e) => s + (e.upliftPct || 0), 0) / newsUpcoming.length;
    const negItems = newsUpcoming
      .filter((e) => (e.upliftPct || 0) < 0)
      .sort((a, b) => (a.upliftPct || 0) - (b.upliftPct || 0))
      .slice(0, 5)
      .map((e) => e.name);
    const posItems = newsUpcoming
      .filter((e) => (e.upliftPct || 0) >= 0)
      .sort((a, b) => (b.upliftPct || 0) - (a.upliftPct || 0))
      .slice(0, 5)
      .map((e) => e.name);
    return {
      article_count: newsUpcoming.length,
      dominant_signal: avgUplift < -5 ? "negative" : avgUplift > 5 ? "positive" : "mixed",
      negative_signals: negItems.length ? negItems.join("; ") : null,
      positive_signals: posItems.length ? posItems.join("; ") : null,
      net_adjustment: +(avgUplift / 100).toFixed(2),
    };
  })();

  const upcomingEventsSection: Record<string, any> = { confirmed_events: confirmedUpcomingList };
  if (dashNewsDigest) upcomingEventsSection.news_digest = dashNewsDigest;

  const recentBookings = confirmed.slice(0, 15).map((r) => ({
    guest: r.guestName,
    channel: r.channelName,
    check_in: r.checkIn,
    check_out: r.checkOut,
    nights: r.nights,
    revenue: r.totalPrice,
  }));

  const recentCancellations = cancelled.slice(0, 10).map((r) => ({
    guest: r.guestName,
    channel: r.channelName,
    check_in: r.checkIn,
    check_out: r.checkOut,
    nights: r.nights,
    lost_revenue: r.totalPrice,
  }));

  const sections = [
    `[PORTFOLIO]\n${JSON.stringify(portfolio)}`,
    `[RESERVATIONS_SUMMARY]\n${JSON.stringify(reservationsSummary)}`,
    `[CHANNEL_MIX]\n${JSON.stringify(channelMix)}`,
    `[MARKET_EVENTS]\n${JSON.stringify(upcomingEventsSection)}`,
    `[RECENT_BOOKINGS]\n${JSON.stringify(recentBookings)}`,
    `[RECENT_CANCELLATIONS]\n${JSON.stringify(recentCancellations)}`,
  ];

  return sections.join("\n\n");
}
