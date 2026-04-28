import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
    }

    await connectToDatabase();
    const listingOid = new Types.ObjectId(listingId);

    const [listing, resDocs, invDocs] = await Promise.all([
      Listing.findById(listingOid).lean(),
      Reservation.find({ listingId: listingOid }).lean(),
      InventoryMaster.find({ listingId: listingOid, date: { $gte: from, $lte: to } }).lean(),
    ]);

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const filteredReservations = resDocs.filter((r: any) => {
      if (!from || !to) return true;
      const cin = r.checkIn;
      const cout = r.checkOut;
      return (cin >= from && cin <= to) || (cout >= from && cout <= to) || (cin <= from && cout >= to);
    });

    const totalBookings = filteredReservations.length;
    const totalRevenue = filteredReservations
      .filter((r: any) => r.status !== "cancelled")
      .reduce((sum: number, r: any) => sum + Number(r.totalPrice || 0), 0);

    const totalNights = filteredReservations.reduce((sum: number, r: any) => sum + Math.max(1, Number(r.nights || 1)), 0);
    const avgLos = totalBookings > 0 ? Math.round((totalNights / totalBookings) * 10) / 10 : 0;

    const bookedDays = invDocs.filter((d: any) => d.status === "booked").length;
    const totalDays = invDocs.length;
    const occupancyPct = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;

    const avgDailyRevenue = totalDays > 0 ? Math.round(totalRevenue / totalDays) : 0;

    const velocityMap: Record<string, number> = {};
    filteredReservations.forEach((r: any) => {
      const d = r.checkIn || "";
      if (d) velocityMap[d] = (velocityMap[d] || 0) + 1;
    });

    const bookingVelocity: any[] = [];
    let cur = new Date(from);
    const end = new Date(to);
    const dateArray: string[] = [];
    while (cur <= end) {
      dateArray.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }

    dateArray.forEach((d) => {
      bookingVelocity.push({
        date: d,
        bookings: velocityMap[d] || 0,
        movingAvg7d: 0
      });
    });

    for (let i = 0; i < bookingVelocity.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 6); j <= i; j++) {
        sum += bookingVelocity[j].bookings;
        count++;
      }
      bookingVelocity[i].movingAvg7d = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
    }

    const losCounts = { "1-2": 0, "3-4": 0, "5-7": 0, "8-14": 0, "15+": 0 };
    filteredReservations.forEach((r: any) => {
      const n = Number(r.nights || 1);
      if (n <= 2) losCounts["1-2"]++;
      else if (n <= 4) losCounts["3-4"]++;
      else if (n <= 7) losCounts["5-7"]++;
      else if (n <= 14) losCounts["8-14"]++;
      else losCounts["15+"]++;
    });

    const losDistribution = Object.entries(losCounts).map(([bucket, bookings]) => ({
      bucket,
      bookings
    }));

    const trendMap: Record<string, any> = {};
    invDocs.forEach((d: any) => {
      trendMap[d.date] = d;
    });

    const occupancyTrend = dateArray.map((d) => {
      const inv = trendMap[d];
      const isBooked = inv?.status === "booked";
      const isBlocked = inv?.status === "blocked";
      return {
        date: d,
        totalDays: 1,
        bookedDays: isBooked ? 1 : 0,
        blockedDays: isBlocked ? 1 : 0,
        occupancyPct: isBooked ? 100 : 0
      };
    });

    const adrRevparTrend = dateArray.map((d) => {
      const inv = trendMap[d];
      const price = Number(inv?.currentPrice || listing.price || 0);
      const isBooked = inv?.status === "booked";
      return {
        date: d,
        adr: price,
        revpar: isBooked ? price : 0,
        bookedRevenue: isBooked ? price : 0
      };
    });

    const channelMap: Record<string, { channel: string; revenue: number; bookings: number }> = {};
    filteredReservations.forEach((r: any) => {
      const ch = r.channelName || "Direct";
      if (!channelMap[ch]) channelMap[ch] = { channel: ch, revenue: 0, bookings: 0 };
      channelMap[ch].revenue += Number(r.totalPrice || 0);
      channelMap[ch].bookings += 1;
    });

    const channelMix = Object.values(channelMap).map((item) => ({
      ...item,
      revenuePct: totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0
    }));

    const payload = {
      listingId: listingId,
      propertyName: listing.name,
      dateRange: { from, to },
      summary: {
        totalBookings,
        totalRevenue,
        avgLos,
        occupancyPct,
        avgDailyRevenue
      },
      bookingVelocity,
      losDistribution,
      occupancyTrend,
      adrRevparTrend,
      channelMix
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[api/properties/analytics] GET error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
