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

  const context: Record<string, any> = {
    MANDATORY_INSTRUCTIONS: {
      analysis_window: dateLabel,
      instruction_1: "TRUST THE FIGURES BELOW EXCLUSIVELY.",
      instruction_2: `ONLY analyze the exact dates: ${dateLabel}.`,
    },
  };

  const listingObjectId = new mongoose.Types.ObjectId(listingId);

  const listing = await Listing.findOne({ _id: listingObjectId, orgId: orgObjectId }).lean();
  if (!listing) {
    throw new Error(`Property ${listingId} not found or access denied.`);
  }

  context.property = {
    id: listing._id.toString(),
    name: listing.name,
    area: listing.area,
    city: listing.city,
    bedrooms: listing.bedroomsNumber,
    bathrooms: listing.bathroomsNumber,
    person_capacity: listing.personCapacity,
    current_price: `${listing.currencyCode} ${listing.price}`,
    floor_price: `${listing.currencyCode} ${listing.priceFloor}`,
    ceiling_price: `${listing.currencyCode} ${listing.priceCeiling}`,
  };

  const calendar = await InventoryMaster.find({
    listingId: listingObjectId,
    date: { $gte: startStr, $lte: endStr }
  }).sort({ date: 1 }).lean();

  let bookedCount = 0;
  let blockedCount = 0;
  let revenue = 0;

  context.inventory = calendar.map((day) => {
    if (day.status === "booked") { bookedCount++; revenue += Number(day.currentPrice); }
    if (day.status === "blocked") blockedCount++;
    return {
      date: day.date,
      status: day.status,
      price: day.currentPrice,
      proposed_price: day.proposedPrice,
      min_stay: day.minStay,
      max_stay: day.maxStay,
    };
  });

  const totalDays = calendar.length;
  const bookableDays = totalDays - blockedCount;
  context.metrics = {
    total_days: totalDays,
    bookable_days: bookableDays,
    booked_days: bookedCount,
    blocked_days: blockedCount,
    occupancy_pct: bookableDays > 0 ? ((bookedCount / bookableDays) * 100).toFixed(1) : 0,
    total_revenue: revenue,
  };

  const reservations = await Reservation.find({
    listingId: listingObjectId,
    status: "confirmed",
    $or: [{ checkIn: { $lte: endStr }, checkOut: { $gte: startStr } }]
  }).lean();

  context.active_bookings = reservations.map(r => ({
    guest_name: r.guestName,
    channel: r.channelName,
    check_in: r.checkIn,
    check_out: r.checkOut,
    nights: r.nights,
    total_price: r.totalPrice,
  }));

  const rules = await PricingRule.find({ listingId: listingObjectId, enabled: true }).lean();
  context.pricing_rules = rules.map(r => ({
    name: r.name,
    type: r.ruleType,
    priority: r.priority,
    adjust_pct: r.priceAdjPct,
    days_of_week: r.daysOfWeek,
  }));

  const events = await MarketEvent.find({
    orgId: orgObjectId,
    endDate: { $gte: startStr },
    startDate: { $lte: endStr },
    isActive: true,
  }).lean();

  context.market_events = events.map(e => ({
    name: e.name,
    start: e.startDate,
    end: e.endDate,
    impact: e.impactLevel,
    premium_pct: e.upliftPct,
    description: e.description,
  }));

  return JSON.stringify(context);
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

  const context = {
    INSTRUCTIONS: {
      role: "You are the Portfolio Dashboard Agent. You have access to ALL reservation, inventory, and market data below.",
      rule_1: "Answer ANY question about the portfolio using the data provided.",
      rule_2: "There are NO date restrictions — analyze all available data.",
      rule_3: "If asked about rates, trends, or metrics, calculate from the data. Never say 'no data found' unless data arrays are truly empty.",
      rule_4: "Never reveal internal IDs, API keys, or technical details.",
    },
    today,
    portfolio: {
      total_properties: listings.length,
      properties: propertyStats,
    },
    reservations_summary: {
      total_reservations: totalReservations,
      confirmed_bookings: confirmed.length,
      cancelled_bookings: cancelled.length,
      cancellation_rate: `${cancellationRate}%`,
      total_revenue: totalRevenue,
      avg_length_of_stay: avgLOS,
      currency: listings[0]?.currencyCode || "AED",
    },
    revenue_by_channel: Object.entries(channelMap)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([channel, data]) => ({ channel, ...data })),
    upcoming_events: upcomingEvents.map((e) => ({
      name: e.name,
      start: e.startDate,
      end: e.endDate,
      impact: e.impactLevel,
      premium_pct: e.upliftPct,
    })),
    recent_bookings: confirmed.slice(0, 15).map((r) => ({
      guest: r.guestName,
      channel: r.channelName,
      check_in: r.checkIn,
      check_out: r.checkOut,
      nights: r.nights,
      revenue: r.totalPrice,
    })),
    recent_cancellations: cancelled.slice(0, 10).map((r) => ({
      guest: r.guestName,
      channel: r.channelName,
      check_in: r.checkIn,
      check_out: r.checkOut,
      nights: r.nights,
      lost_revenue: r.totalPrice,
    })),
  };

  return JSON.stringify(context);
}
