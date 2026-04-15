import mongoose from "mongoose";
import {
  BenchmarkData,
  EngineRun,
  GuestSummary,
  HostawayConversation,
  Insight,
  InventoryMaster,
  Listing,
  MarketEvent,
  Reservation,
} from "@/lib/db";
import { toolLogger as log } from "./logger";

interface PortfolioStatAggregate {
  _id: mongoose.Types.ObjectId;
  totalDays: number;
  bookedDays: number;
  blockedDays: number;
  revenue: number;
  avgNightlyRate: number;
}

/* ─── Scope checks ─── */

export async function ensureListingScope(orgId: mongoose.Types.ObjectId, listingId: mongoose.Types.ObjectId) {
  log.dbQuery("scope-check", "Listing", "findOne", { listingId: String(listingId), orgId: String(orgId) });
  const listing = await Listing.findOne({ _id: listingId, orgId }).lean();
  if (!listing) {
    log.dbResult("scope-check", "Listing", "findOne", { found: false });
    throw new Error("LISTING_NOT_FOUND");
  }
  log.dbResult("scope-check", "Listing", "findOne", { found: true, name: listing.name });
  return listing;
}

export async function ensureConversationScope(orgId: mongoose.Types.ObjectId, conversationId: string) {
  log.dbQuery("scope-check", "HostawayConversation", "findOne", { conversationId, orgId: String(orgId) });
  const conversation = await HostawayConversation.findOne({
    orgId,
    hostawayConversationId: conversationId,
  }).lean();
  if (!conversation) {
    log.dbResult("scope-check", "HostawayConversation", "findOne", { found: false });
    throw new Error("CONVERSATION_NOT_FOUND");
  }
  log.dbResult("scope-check", "HostawayConversation", "findOne", { found: true, guestName: conversation.guestName });
  return conversation;
}

/* ─── Dashboard tools ─── */

export async function getPortfolioOverview(orgId: mongoose.Types.ObjectId, dateFrom: string, dateTo: string) {
  const ep = "getPortfolioOverview";

  log.dbQuery(ep, "Listing", "find", { orgId: String(orgId), isActive: true });
  log.dbQuery(ep, "InventoryMaster", "aggregate", { orgId: String(orgId), dateFrom, dateTo });

  const [listings, stats] = await Promise.all([
    Listing.find({ orgId, isActive: true }).lean(),
    InventoryMaster.aggregate([
      { $match: { orgId, date: { $gte: dateFrom, $lte: dateTo } } },
      {
        $group: {
          _id: "$listingId",
          totalDays: { $sum: 1 },
          bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
          blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, "$currentPrice", 0] } },
          avgNightlyRate: { $avg: "$currentPrice" },
        },
      },
    ]),
  ]);

  log.dbResult(ep, "Listing", "find", { count: listings.length });
  log.dbResult(ep, "InventoryMaster", "aggregate", { groupsReturned: stats.length });

  const statMap = new Map<string, PortfolioStatAggregate>();
  stats.forEach((s) => statMap.set(String(s._id), s));

  const properties = listings.map((listing) => {
    const s = statMap.get(String(listing._id));
    const totalDays = Number(s?.totalDays || 0);
    const blockedDays = Number(s?.blockedDays || 0);
    const bookedDays = Number(s?.bookedDays || 0);
    const bookableDays = Math.max(totalDays - blockedDays, 0);
    const occupancyPct = bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;
    return {
      listingId: String(listing._id),
      name: listing.name,
      occupancyPct,
      revenue: Number((s?.revenue || 0).toFixed(2)),
      avgNightlyRate: Math.round(Number(s?.avgNightlyRate || listing.price || 0)),
    };
  });

  const totalRevenue = Number(properties.reduce((sum, p) => sum + p.revenue, 0).toFixed(2));
  const avgOccupancyPct = properties.length
    ? Math.round(properties.reduce((sum, p) => sum + p.occupancyPct, 0) / properties.length)
    : 0;

  log.dbResult(ep, "computed", "overview", { totalProperties: properties.length, totalRevenue, avgOccupancyPct });
  return {
    totalProperties: properties.length,
    avgOccupancyPct,
    totalRevenue,
    properties,
  };
}

export async function getPortfolioRevenueSnapshot(
  orgId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string,
  groupBy: "day" | "week" | "property"
) {
  const ep = "getPortfolioRevenueSnapshot";

  log.dbQuery(ep, "Reservation", "find", { orgId: String(orgId), dateFrom, dateTo });
  const reservations = await Reservation.find({
    orgId,
    checkIn: { $lte: dateTo },
    checkOut: { $gte: dateFrom },
  })
    .select("listingId checkIn totalPrice channelName nights")
    .lean();
  log.dbResult(ep, "Reservation", "find", { count: reservations.length });

  const totals = {
    revenue: Number(reservations.reduce((s, r) => s + Number(r.totalPrice || 0), 0).toFixed(2)),
    bookings: reservations.length,
    avgBookingValue: reservations.length
      ? Number(
          (
            reservations.reduce((s, r) => s + Number(r.totalPrice || 0), 0) / reservations.length
          ).toFixed(2)
        )
      : 0,
  };

  let breakdown: Array<Record<string, unknown>> = [];
  if (groupBy === "property") {
    log.dbQuery(ep, "Listing", "find", { orgId: String(orgId), selectFields: "name" });
    const listings = await Listing.find({ orgId }).select("name").lean();
    log.dbResult(ep, "Listing", "find", { count: listings.length });

    const listingMap = new Map(listings.map((l) => [String(l._id), l.name]));
    const grouped = new Map<string, { revenue: number; bookings: number }>();
    reservations.forEach((r) => {
      const key = String(r.listingId);
      const current = grouped.get(key) || { revenue: 0, bookings: 0 };
      current.revenue += Number(r.totalPrice || 0);
      current.bookings += 1;
      grouped.set(key, current);
    });
    breakdown = Array.from(grouped.entries()).map(([listingId, value]) => ({
      listingId,
      name: listingMap.get(listingId) || "Unknown",
      revenue: Number(value.revenue.toFixed(2)),
      bookings: value.bookings,
    }));
  } else if (groupBy === "week") {
    const grouped = new Map<string, { revenue: number; bookings: number }>();
    reservations.forEach((r) => {
      const weekKey = r.checkIn.slice(0, 8);
      const current = grouped.get(weekKey) || { revenue: 0, bookings: 0 };
      current.revenue += Number(r.totalPrice || 0);
      current.bookings += 1;
      grouped.set(weekKey, current);
    });
    breakdown = Array.from(grouped.entries()).map(([weekStart, value]) => ({
      weekStart,
      revenue: Number(value.revenue.toFixed(2)),
      bookings: value.bookings,
    }));
  } else {
    const grouped = new Map<string, { revenue: number; bookings: number }>();
    reservations.forEach((r) => {
      const current = grouped.get(r.checkIn) || { revenue: 0, bookings: 0 };
      current.revenue += Number(r.totalPrice || 0);
      current.bookings += 1;
      grouped.set(r.checkIn, current);
    });
    breakdown = Array.from(grouped.entries()).map(([date, value]) => ({
      date,
      revenue: Number(value.revenue.toFixed(2)),
      bookings: value.bookings,
    }));
  }

  log.dbResult(ep, "computed", "revenueSnapshot", { groupBy, breakdownRows: breakdown.length, totalRevenue: totals.revenue });
  return { totals, breakdown };
}

export async function getAgentSystemStatus(orgId: mongoose.Types.ObjectId) {
  const ep = "getAgentSystemStatus";

  log.dbQuery(ep, "EngineRun", "findOne(latest)", { orgId: String(orgId) });
  log.dbQuery(ep, "InventoryMaster", "countDocuments(pending)", { orgId: String(orgId) });
  log.dbQuery(ep, "InventoryMaster", "countDocuments(approved24h)", { orgId: String(orgId) });
  log.dbQuery(ep, "Insight", "countDocuments(critical)", { orgId: String(orgId) });

  const [lastEngineRun, pendingProposals, autoApproved, criticalInsights] = await Promise.all([
    EngineRun.findOne({ orgId }).sort({ startedAt: -1 }).lean(),
    InventoryMaster.countDocuments({ orgId, proposalStatus: "pending" }),
    InventoryMaster.countDocuments({
      orgId,
      proposalStatus: "approved",
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
    Insight.countDocuments({ orgId, severity: "high", status: "pending" }),
  ]);

  log.dbResult(ep, "EngineRun", "findOne", { found: !!lastEngineRun, status: lastEngineRun?.status || "never_run" });
  log.dbResult(ep, "InventoryMaster", "countDocuments", { pendingProposals, autoApproved });
  log.dbResult(ep, "Insight", "countDocuments", { criticalInsights });

  const lastRunAt = lastEngineRun?.startedAt || null;
  const lastRunStatus = lastEngineRun?.status || "never_run";
  const lastRunDurationMs = lastEngineRun?.durationMs || null;
  const dataAgeSec = lastRunAt
    ? Math.floor((Date.now() - new Date(lastRunAt).getTime()) / 1000)
    : null;
  const isStale = dataAgeSec !== null && dataAgeSec > 4 * 3600;

  const agents = [
    {
      id: "cro",
      status: "active",
      lastRunStatus: "always_on",
    },
    {
      id: "event_intelligence",
      status: isStale ? "warning" : "active",
      lastRunStatus,
      metrics: { dataAgeSec, isStale },
    },
    {
      id: "pricing_optimizer",
      status: lastRunStatus === "FAILED" ? "error" : lastRunStatus === "never_run" ? "idle" : "active",
      lastRunStatus,
      metrics: { pendingProposals },
    },
    {
      id: "adjustment_reviewer",
      status: criticalInsights > 0 ? "warning" : "active",
      lastRunStatus,
      metrics: { pendingProposals, autoApproved },
    },
    {
      id: "channel_sync",
      status: lastRunStatus === "FAILED" ? "error" : lastRunStatus === "SUCCESS" ? "active" : "idle",
      lastRunStatus,
      metrics: { lastRunDurationMs },
    },
    {
      id: "reservation_agent",
      status: "active",
      lastRunStatus: "event_driven",
    },
  ];

  const systemState =
    lastRunStatus === "FAILED"
      ? "error"
      : isStale
      ? "observing"
      : criticalInsights > 0
      ? "paused"
      : lastRunStatus === "never_run"
      ? "connected"
      : "active";

  log.dbResult(ep, "computed", "systemStatus", { systemState, agentCount: agents.length, pendingProposals, isStale });
  return {
    systemState,
    agents,
    summary: {
      activeCount: agents.filter((a) => a.status === "active").length,
      warningCount: agents.filter((a) => a.status === "warning").length,
      errorCount: agents.filter((a) => a.status === "error").length,
      pendingProposals,
      criticalInsights,
      isStale,
      lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    },
  };
}

/* ─── Property tools ─── */

export async function getPropertyCalendarMetrics(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string
) {
  const ep = "getPropertyCalendarMetrics";
  await ensureListingScope(orgId, listingId);

  log.dbQuery(ep, "InventoryMaster", "aggregate", { listingId: String(listingId), dateFrom, dateTo });
  const [agg] = await InventoryMaster.aggregate([
    { $match: { orgId, listingId, date: { $gte: dateFrom, $lte: dateTo } } },
    {
      $group: {
        _id: null,
        totalDays: { $sum: 1 },
        bookedDays: { $sum: { $cond: [{ $in: ["$status", ["booked", "reserved"]] }, 1, 0] } },
        blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
        totalRevenue: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, "$currentPrice", 0] } },
        avgNightlyRate: { $avg: "$currentPrice" },
      },
    },
  ]);
  log.dbResult(ep, "InventoryMaster", "aggregate", {
    hasData: !!agg,
    totalDays: agg?.totalDays || 0,
    bookedDays: agg?.bookedDays || 0,
  });

  const totalDays = Number(agg?.totalDays || 0);
  const blockedDays = Number(agg?.blockedDays || 0);
  const bookedDays = Number(agg?.bookedDays || 0);
  const bookableDays = Math.max(totalDays - blockedDays, 0);

  return {
    totalDays,
    bookedDays,
    blockedDays,
    bookableDays,
    occupancyPct: bookableDays > 0 ? Number(((bookedDays / bookableDays) * 100).toFixed(1)) : 0,
    avgNightlyRate: Number((agg?.avgNightlyRate || 0).toFixed(2)),
    totalRevenue: Number((agg?.totalRevenue || 0).toFixed(2)),
  };
}

export async function getPropertyProfile(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId
) {
  const ep = "getPropertyProfile";
  log.dbQuery(ep, "Listing", "findOne(ensureScope)", { listingId: String(listingId) });
  const listing = await ensureListingScope(orgId, listingId);
  log.dbResult(ep, "Listing", "findOne", { name: listing.name, city: listing.city });

  return {
    listingId: String(listing._id),
    name: listing.name,
    area: listing.area,
    city: listing.city,
    bedrooms: listing.bedroomsNumber,
    bathrooms: listing.bathroomsNumber,
    capacity: listing.personCapacity || 0,
    currency: listing.currencyCode || "AED",
    basePrice: Number(listing.price || 0),
    priceFloor: Number(listing.priceFloor || 0),
    priceCeiling: Number(listing.priceCeiling || 0),
  };
}

export async function getPropertyReservations(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string,
  limit: number
) {
  const ep = "getPropertyReservations";
  await ensureListingScope(orgId, listingId);

  log.dbQuery(ep, "Reservation", "find", { listingId: String(listingId), dateFrom, dateTo, limit });
  const reservations = await Reservation.find({
    orgId,
    listingId,
    checkIn: { $lte: dateTo },
    checkOut: { $gte: dateFrom },
  })
    .sort({ checkIn: 1 })
    .limit(limit)
    .lean();
  log.dbResult(ep, "Reservation", "find", { count: reservations.length });

  return {
    count: reservations.length,
    reservations: reservations.map((r) => ({
      guestName: r.guestName,
      channel: r.channelName,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: r.nights,
      totalPrice: Number(r.totalPrice || 0),
      status: r.status,
    })),
  };
}

export async function getPropertyMarketEvents(
  orgId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string,
  listingId?: mongoose.Types.ObjectId
) {
  const ep = "getPropertyMarketEvents";
  if (listingId) {
    await ensureListingScope(orgId, listingId);
  }

  const query: Record<string, unknown> = {
    orgId,
    isActive: true,
    endDate: { $gte: dateFrom },
    startDate: { $lte: dateTo },
  };
  if (listingId) {
    query.$or = [{ listingId }, { listingId: { $exists: false } }];
  }

  log.dbQuery(ep, "MarketEvent", "find", { orgId: String(orgId), dateFrom, dateTo, listingId: listingId ? String(listingId) : "all" });
  const events = await MarketEvent.find(query).sort({ startDate: 1 }).lean();
  log.dbResult(ep, "MarketEvent", "find", { count: events.length });

  return {
    count: events.length,
    events: events.map((event) => ({
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      impactLevel: event.impactLevel,
      upliftPct: Number(event.upliftPct || 0),
      description: event.description || "",
    })),
  };
}

export async function getPropertyBenchmark(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string
) {
  const ep = "getPropertyBenchmark";
  await ensureListingScope(orgId, listingId);

  log.dbQuery(ep, "BenchmarkData", "findOne(latest)", { listingId: String(listingId), dateFrom, dateTo });
  const benchmark = await BenchmarkData.findOne({
    orgId,
    listingId,
    dateTo: { $gte: dateFrom },
    dateFrom: { $lte: dateTo },
  })
    .sort({ updatedAt: -1 })
    .lean();
  log.dbResult(ep, "BenchmarkData", "findOne", { found: !!benchmark, verdict: benchmark?.verdict || null });

  if (!benchmark) {
    return {
      verdict: null,
      percentile: null,
      p25: null,
      p50: null,
      p75: null,
      recommendationWindow: { from: dateFrom, to: dateTo },
    };
  }

  return {
    verdict: benchmark.verdict || null,
    percentile: benchmark.percentile ?? null,
    p25: benchmark.p25Rate ?? null,
    p50: benchmark.p50Rate ?? null,
    p75: benchmark.p75Rate ?? null,
    recommendationWindow: { from: benchmark.dateFrom, to: benchmark.dateTo },
  };
}

/* ─── Guest tools ─── */

export async function listGuestConversations(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string
) {
  const ep = "listGuestConversations";
  await ensureListingScope(orgId, listingId);

  log.dbQuery(ep, "HostawayConversation", "find", { listingId: String(listingId), dateFrom, dateTo });
  const rows = await HostawayConversation.find({
    orgId,
    listingId,
    dateFrom: { $lte: dateTo },
    dateTo: { $gte: dateFrom },
  }).lean();
  log.dbResult(ep, "HostawayConversation", "find", { rowsReturned: rows.length });

  const uniqueMap = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    if (!uniqueMap.has(row.hostawayConversationId)) {
      uniqueMap.set(row.hostawayConversationId, row);
    }
  });

  const conversations = Array.from(uniqueMap.values()).map((conv) => {
    const allMessages = (conv.messages || [])
      .map((m, idx) => ({
        id: `${conv.hostawayConversationId}_${idx}`,
        sender: m.sender === "admin" ? "admin" : "guest",
        text: m.text,
        timestamp: m.timestamp,
        _ts: m.timestamp ? new Date(m.timestamp).getTime() : idx,
      }))
      .sort((a, b) => a._ts - b._ts);

    const last = allMessages[allMessages.length - 1];
    return {
      conversationId: conv.hostawayConversationId,
      guestName: conv.guestName,
      lastMessage: last?.text || "No messages",
      status: last?.sender === "guest" ? "needs_reply" : "resolved",
      messages: allMessages.map((message) => ({
        id: message.id,
        sender: message.sender,
        text: message.text,
        timestamp: message.timestamp,
      })),
    };
  });

  log.dbResult(ep, "computed", "conversations", { unique: conversations.length, totalMessages: conversations.reduce((s, c) => s + c.messages.length, 0) });
  return { count: conversations.length, conversations };
}

export async function computeConversationSummary(
  conversations: Array<{
    guestName: string;
    messages: Array<{ sender: string; text: string }>;
  }>
) {
  const needsReplyCount = conversations.filter((conv) => {
    const last = conv.messages[conv.messages.length - 1];
    return last?.sender === "guest";
  }).length;

  const sentiment =
    needsReplyCount > conversations.length / 2
      ? "Needs Attention"
      : needsReplyCount > 0
      ? "Neutral"
      : "Positive";

  const themes = Array.from(
    new Set(
      conversations.flatMap((conv) =>
        conv.messages
          .filter((m) => m.sender === "guest")
          .map((m) => {
            const t = m.text.toLowerCase();
            if (t.includes("check") && t.includes("in")) return "Check-in";
            if (t.includes("pool") || t.includes("amenit")) return "Amenities";
            if (t.includes("parking")) return "Parking";
            if (t.includes("clean")) return "Cleanliness";
            return "General Inquiry";
          })
      )
    )
  ).slice(0, 5);

  const actionItems = [
    needsReplyCount > 0 ? `Reply to ${needsReplyCount} pending guest message(s)` : null,
    "Review recurring themes and update quick-reply templates",
  ].filter(Boolean) as string[];

  const bulletPoints = conversations.map((conv) => {
    const last = conv.messages[conv.messages.length - 1];
    const status = last?.sender === "guest" ? "NEEDS REPLY" : "Resolved";
    return `${conv.guestName}: "${last?.text || "No messages"}" - ${status}`;
  });

  return {
    sentiment,
    themes,
    actionItems,
    bulletPoints,
    totalConversations: conversations.length,
    needsReplyCount,
  };
}

export async function getGuestSummary(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string
) {
  const ep = "getGuestSummary";
  await ensureListingScope(orgId, listingId);

  log.dbQuery(ep, "GuestSummary", "findOne", { listingId: String(listingId), dateFrom, dateTo });
  const summary = await GuestSummary.findOne({
    orgId,
    listingId,
    dateFrom,
    dateTo,
  }).lean();
  log.dbResult(ep, "GuestSummary", "findOne", { found: !!summary });

  if (!summary) {
    return { cached: false, stale: false, summary: null };
  }

  const sixHours = 6 * 60 * 60 * 1000;
  const ageMs = Date.now() - new Date(summary.updatedAt).getTime();
  const stale = ageMs > sixHours;

  log.dbResult(ep, "GuestSummary", "freshness", { ageMs, stale, sentiment: summary.sentiment });
  return {
    cached: !stale,
    stale,
    summary: {
      sentiment: summary.sentiment,
      themes: summary.themes,
      actionItems: summary.actionItems,
      bulletPoints: summary.bulletPoints,
      totalConversations: summary.totalConversations,
      needsReplyCount: summary.needsReplyCount,
    },
  };
}

export async function generateAndPersistGuestSummary(
  orgId: mongoose.Types.ObjectId,
  listingId: mongoose.Types.ObjectId,
  dateFrom: string,
  dateTo: string
) {
  const ep = "generateAndPersistGuestSummary";

  log.serviceCall(ep, "listGuestConversations");
  const { conversations } = await listGuestConversations(orgId, listingId, dateFrom, dateTo);
  log.serviceResult(ep, "listGuestConversations", { count: conversations.length });

  log.serviceCall(ep, "computeConversationSummary");
  const summary = await computeConversationSummary(
    conversations.map((conv) => ({
      guestName: conv.guestName,
      messages: conv.messages.map((m) => ({ sender: m.sender, text: m.text })),
    }))
  );
  log.serviceResult(ep, "computeConversationSummary", { sentiment: summary.sentiment, needsReplyCount: summary.needsReplyCount });

  log.dbSave(ep, "GuestSummary", "findOneAndUpdate(upsert)", { listingId: String(listingId), dateFrom, dateTo });
  await GuestSummary.findOneAndUpdate(
    { orgId, listingId, dateFrom, dateTo },
    {
      $set: {
        orgId,
        listingId,
        dateFrom,
        dateTo,
        sentiment: summary.sentiment,
        themes: summary.themes,
        actionItems: summary.actionItems,
        bulletPoints: summary.bulletPoints,
        totalConversations: summary.totalConversations,
        needsReplyCount: summary.needsReplyCount,
      },
    },
    { upsert: true, new: true }
  );
  log.dbSave(ep, "GuestSummary", "upsert complete", { sentiment: summary.sentiment });

  return {
    summary,
    conversationsAnalyzed: conversations.length,
  };
}

export async function suggestGuestReply(params: {
  guestMessage: string;
  guestName: string;
  propertyName?: string;
}) {
  const ep = "suggestGuestReply";

  const lyzrAgentId =
    process.env.LYZR_CHAT_RESPONSE_AGENT_ID || process.env.LYZR_Chat_Response_Agent_ID;
  const lyzrApiKey = process.env.LYZR_API_KEY;
  const lyzrApiUrl =
    process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";

  if (!lyzrAgentId || !lyzrApiKey) {
    log.externalCall(ep, "Lyzr", "SKIPPED — missing LYZR_CHAT_RESPONSE_AGENT_ID or LYZR_API_KEY");
    return {
      reply: `Hi ${params.guestName}, thanks for reaching out. I will check this and get back to you shortly.`,
      source: "fallback",
    };
  }

  const prompt = `Property: "${params.propertyName || "Our Property"}"
Guest name: ${params.guestName}
Guest's message: "${params.guestMessage}"

Generate a professional, warm, concise reply in 2-4 sentences.`;

  log.externalCall(ep, "Lyzr", lyzrApiUrl);
  const extStart = Date.now();

  const res = await fetch(lyzrApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": lyzrApiKey,
    },
    body: JSON.stringify({
      user_id: "priceos-system",
      agent_id: lyzrAgentId,
      session_id: `agent-tools-reply-${Date.now()}`,
      message: prompt,
    }),
  });

  const extMs = Date.now() - extStart;
  log.externalResult(ep, "Lyzr", res.status, extMs);

  const json = await res.json();
  if (!res.ok || !json.response) {
    log.externalResult(ep, "Lyzr", res.status, extMs);
    return {
      reply: `Hi ${params.guestName}, thanks for reaching out. I will check this and get back to you shortly.`,
      source: "fallback",
    };
  }

  const rawResponse =
    typeof json.response === "string"
      ? json.response
      : json.response?.message || json.response?.data || "";

  let reply = rawResponse;
  try {
    const match = rawResponse.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.reply) {
        reply = parsed.reply;
      }
    }
  } catch {
    // keep raw text
  }

  log.serviceResult(ep, "suggestGuestReply", { source: "lyzr", replyLength: reply.length });
  return {
    reply: reply.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim(),
    source: "lyzr",
  };
}

export async function saveGuestReply(
  orgId: mongoose.Types.ObjectId,
  conversationId: string,
  text: string
) {
  const ep = "saveGuestReply";

  log.dbSave(ep, "HostawayConversation", "findOneAndUpdate($push)", { conversationId, textLength: text.length });
  const updated = await HostawayConversation.findOneAndUpdate(
    { orgId, hostawayConversationId: conversationId },
    {
      $push: {
        messages: {
          sender: "admin",
          text,
          timestamp: new Date().toISOString(),
        },
      },
      $set: { needsReply: false },
    },
    { new: true }
  ).lean();

  if (!updated) {
    log.dbResult(ep, "HostawayConversation", "findOneAndUpdate", { found: false });
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  log.dbSave(ep, "HostawayConversation", "reply saved", { conversationId, guestName: updated.guestName });
  return { saved: true };
}

export async function getListingMetadata(orgId: mongoose.Types.ObjectId) {
  const ep = "getListingMetadata";
  log.dbQuery(ep, "Listing", "find(active)", { orgId: String(orgId) });
  const listings = await Listing.find({ orgId, isActive: true })
    .select("_id name area city currencyCode")
    .lean();
  log.dbResult(ep, "Listing", "find", { count: listings.length });

  return {
    count: listings.length,
    listings: listings.map((listing) => ({
      listingId: String(listing._id),
      name: listing.name,
      area: listing.area,
      city: listing.city,
      currency: listing.currencyCode || "AED",
    })),
  };
}

export function getDateWindowDefaults() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}
