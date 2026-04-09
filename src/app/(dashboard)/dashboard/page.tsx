import { connectDB, Listing, InventoryMaster, Reservation } from "@/lib/db";
import { OverviewClient } from "./overview-client";

export default async function OverviewPage() {
  await connectDB();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus29 = new Date(today);
  plus29.setDate(plus29.getDate() + 29);
  const plus29Str = plus29.toISOString().split("T")[0];

  // 1. Fetch all listings
  const allListings = await Listing.find().lean();

  // 2. Aggregate occupancy/avg_price/revenue per listing for next 30 days
  const statsResult = await InventoryMaster.aggregate([
    { $match: { date: { $gte: todayStr, $lte: plus29Str } } },
    {
      $group: {
        _id: "$listingId",
        totalDays: { $sum: 1 },
        bookedDays: {
          $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] },
        },
        blockedDays: {
          $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
        },
        avgPrice: { $avg: "$currentPrice" },
        totalRevenue: {
          $sum: { $cond: [{ $eq: ["$status", "booked"] }, "$currentPrice", 0] },
        },
      },
    },
  ]);
  // Compute occupancy in JS (DocumentDB doesn't support $round)
  statsResult.forEach((s: any) => {
    const avail = s.totalDays - s.blockedDays;
    s.occupancy = avail > 0 ? Math.round((s.bookedDays / avail) * 100) : 0;
  });

  // 3. Total historical revenue from confirmed reservations
  const historicalResult = await Reservation.aggregate([
    { $match: { status: "confirmed" } },
    { $group: { _id: null, total: { $sum: "$totalPrice" } } },
  ]);
  const totalHistoricalRevenue = Number(historicalResult[0]?.total || 0);

  // 4. Calendar data for next 30 days
  const calDocs = await InventoryMaster.find({
    date: { $gte: todayStr, $lte: plus29Str },
  }).lean();

  // 5. Reservations overlapping next 30 days
  const resDocs = await Reservation.find({
    checkIn: { $lte: plus29Str },
    checkOut: { $gte: todayStr },
  }).lean();

  // 6. Build per-listing metrics
  let totalPortfolioRevenue = 0;
  let totalOccupancySum = 0;
  let totalAvgPriceSum = 0;
  let activePropertiesCount = 0;

  const propertiesWithMetrics = allListings.map((listing) => {
    const listingIdStr = listing._id.toString();

    const stat = statsResult.find((s) => s._id.toString() === listingIdStr);
    const occupancy = stat ? Number(stat.occupancy) : 0;
    const avgPrice =
      stat && Number(stat.avgPrice) > 0
        ? Math.round(Number(stat.avgPrice))
        : Number(listing.price);
    const revenue = stat ? Number(stat.totalRevenue) : 0;

    totalPortfolioRevenue += revenue;
    if (occupancy > 0) {
      totalOccupancySum += occupancy;
      totalAvgPriceSum += avgPrice;
      activePropertiesCount++;
    }

    const listingCal = calDocs
      .filter((r) => r.listingId.toString() === listingIdStr)
      .map((r) => ({
        date: r.date,
        status: r.status,
        price: Number(r.currentPrice),
        minimumStay: Number(r.minStay || 1),
        maximumStay: Number(r.maxStay || 30),
      }));

    const listingRes = resDocs
      .filter((r) => r.listingId.toString() === listingIdStr)
      .map((r) => ({
        title: r.guestName || "Guest",
        email: r.guestEmail || undefined,
        startDate: r.checkIn,
        endDate: r.checkOut,
        financials: {
          totalPrice: Number(r.totalPrice || 0),
          pricePerNight:
            r.nights > 0
              ? Math.round(Number(r.totalPrice) / r.nights)
              : Number(r.totalPrice),
          channelName: r.channelName,
          reservationStatus: r.status,
        },
      }));

    return {
      id: listingIdStr,
      name: listing.name,
      area: listing.area,
      bedroomsNumber: listing.bedroomsNumber,
      price: listing.price,
      occupancy,
      avgPrice,
      revenue,
      calendarDays: listingCal,
      reservations: listingRes,
    };
  });

  const avgPortfolioOccupancy =
    activePropertiesCount > 0
      ? Math.round(totalOccupancySum / activePropertiesCount)
      : 0;
  const avgPortfolioPrice =
    activePropertiesCount > 0
      ? Math.round(totalAvgPriceSum / activePropertiesCount)
      : 0;

  return (
    <OverviewClient
      properties={propertiesWithMetrics}
      totalProperties={allListings.length}
      avgPortfolioOccupancy={avgPortfolioOccupancy}
      avgPortfolioPrice={avgPortfolioPrice}
      totalPortfolioRevenue={totalPortfolioRevenue}
      totalHistoricalRevenue={totalHistoricalRevenue}
    />
  );
}
