import { connectDB, InventoryMaster, MarketEvent } from "@/lib/db";
import { MarketIntelligenceClient } from "./market-client";

export default async function MarketPage() {
  await connectDB();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const plus90 = new Date(today);
  plus90.setDate(plus90.getDate() + 90);
  const plus90Str = plus90.toISOString().split("T")[0];

  // Fetch upcoming market events (next 90 days)
  const events = await MarketEvent.find({
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
    { $match: { date: { $gte: todayStr, $lte: plus30Str } } },
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

  const serializedEvents = events.map((e: any) => ({
    id: e._id.toString(),
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    impact: e.impact || "medium",
    suggestedPremiumPct: e.suggestedPremiumPct || 0,
    description: e.description || "",
    category: e.category || "event",
  }));

  return (
    <MarketIntelligenceClient
      events={serializedEvents}
      occupancyPct={occupancyPct}
      avgNightly={avgNightly}
    />
  );
}
