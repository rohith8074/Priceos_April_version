import { connectDB, InventoryMaster, MarketEvent, Listing } from "@/lib/db";
import { MarketIntelligenceClient } from "./market-client";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export default async function MarketPage() {
  const session = await getSession();
  if (!session?.orgId) {
    return (
      <MarketIntelligenceClient
        events={[]}
        occupancyPct={0}
        avgNightly={0}
        listings={[]}
      />
    );
  }

  await connectDB();
  const orgId = new mongoose.Types.ObjectId(session.orgId);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const plus90 = new Date(today);
  plus90.setDate(plus90.getDate() + 90);
  const plus90Str = plus90.toISOString().split("T")[0];

  // Fetch upcoming market events (next 90 days)
  const events = await MarketEvent.find({
    orgId,
    startDate: { $lte: plus90Str },
    endDate: { $gte: todayStr },
  })
    .sort({ startDate: 1 })
    .limit(20)
    .lean();

  // Fetch portfolio occupancy next 30 days
  const plus30 = new Date(today);
  plus30.setDate(plus30.getDate() + 29);
  const plus30Str = plus30.toISOString().split("T")[0];

  const occupancyResult = await InventoryMaster.aggregate([
    { $match: { orgId, date: { $gte: todayStr, $lte: plus30Str } } },
    {
      $group: {
        _id: null,
        totalDays: { $sum: 1 },
        bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
        blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
        avgPrice: { $avg: "$currentPrice" },
      },
    },
  ]);

  const occ = occupancyResult[0] || { totalDays: 0, bookedDays: 0, blockedDays: 0, avgPrice: 0 };
  const availDays = occ.totalDays - occ.blockedDays;
  const occupancyPct = availDays > 0 ? Math.round((occ.bookedDays / availDays) * 100) : 0;
  const avgNightly = Math.round(Number(occ.avgPrice) || 0);

  // Fetch listings for benchmark selector
  const listingDocs = await Listing.find({ orgId, isActive: true })
    .select("_id name currencyCode")
    .lean();

  const listings = listingDocs.map((l: any) => ({
    id: l._id.toString(),
    name: l.name as string,
    currencyCode: (l.currencyCode as string) || "AED",
  }));

  const serializedEvents = events.map((e: any) => ({
    id: e._id.toString(),
    title: (e.title || e.name) as string,
    startDate: e.startDate as string,
    endDate: e.endDate as string,
    impact: (e.impact || e.impactLevel || "medium") as "high" | "medium" | "low",
    suggestedPremiumPct: (e.suggestedPremiumPct ?? e.upliftPct ?? 0) as number,
    description: (e.description || "") as string,
    category: (e.category || e.source || "event") as string,
    area: (e.area || (e.areas && e.areas[0]) || "") as string,
  }));

  return (
    <MarketIntelligenceClient
      events={serializedEvents}
      occupancyPct={occupancyPct}
      avgNightly={avgNightly}
      listings={listings}
    />
  );
}
