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

    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    await connectToDatabase();

    let listingOid: Types.ObjectId | null = null;
    let listing: any = null;

    if (Types.ObjectId.isValid(listingId)) {
      listingOid = new Types.ObjectId(listingId);
      listing = await Listing.findById(listingOid).lean();
    } else {
      listing = await Listing.findOne({ hostawayId: listingId }).lean();
      if (listing) {
        listingOid = listing._id;
      }
    }

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const [resDocs, invDocs] = await Promise.all([
      Reservation.find({
        listingId: listingOid,
        status: { $ne: "cancelled" },
        checkOut: { $gte: from },
        checkIn: { $lte: to },
      }).lean(),
      InventoryMaster.find({ listingId: listingOid, date: { $gte: from, $lte: to } }).lean(),
    ]);

    const windowStart = from ? new Date(from) : new Date();
    const windowEnd = to ? new Date(to) : windowStart;
    const windowDays = Math.max(1, Math.ceil((windowEnd.getTime() - windowStart.getTime()) / 86_400_000) + 1);

    // Build bookedDateSet first — used for both calendar visual AND occupancy %.
    // Set-based deduplication prevents overlapping reservations from inflating the count.
    const bookedDateSet = new Set<string>();
    for (const r of resDocs as any[]) {
      let cur = new Date(r.checkIn > from ? r.checkIn : from);
      const resEnd = new Date(r.checkOut < to ? r.checkOut : to);
      while (cur < resEnd) {
        bookedDateSet.add(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const invBlockedDays = invDocs.filter((d: any) => d.status === "blocked").length;
    const invBookedDays = invDocs.filter((d: any) => d.status === "booked").length;
    const totalDays = invDocs.length;
    // Inventory booked count: prefer reservation Set (avoids Hostaway calendar gaps)
    const bookedDays = Math.max(invBookedDays, bookedDateSet.size);
    const blockedDays = invBlockedDays;
    const availableDays = Math.max(0, totalDays - bookedDays - blockedDays);

    // Occupancy derived from reservation Set — exact unique booked dates, no double-count
    const resOccupancy = Math.min(100, Math.round((bookedDateSet.size / windowDays) * 100));
    const invOccupancy = totalDays > 0 ? Math.round((invBookedDays / totalDays) * 100) : 0;
    const occupancy = Math.max(invOccupancy, resOccupancy);

    // Average price: prefer InventoryMaster currentPrice, else listing base price
    const pricePoints = invDocs
      .filter((d: any) => Number(d.currentPrice) > 0)
      .map((d: any) => Number(d.currentPrice));
    const avgPrice = pricePoints.length > 0
      ? Math.round(pricePoints.reduce((a: number, b: number) => a + b, 0) / pricePoints.length)
      : Math.round(Number(listing.price || 0));

    const calendarDays = invDocs.map((d: any) => ({
      date: d.date,
      status: bookedDateSet.has(d.date) ? "booked" : (d.status || "available"),
      price: Number(d.currentPrice || listing.price || 0)
    }));

    if (calendarDays.length === 0 && from && to) {
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0];
        calendarDays.push({
          date: ds,
          status: bookedDateSet.has(ds) ? "booked" : "available",
          price: Number(listing.price || 0)
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    const reservations = resDocs
      .filter((r: any) => r.status !== "cancelled")
      .map((r: any) => ({
        title: r.guestName || "Guest",
        startDate: r.checkIn,
        endDate: r.checkOut,
        financials: {
          totalPrice: Number(r.totalPrice || 0),
          reservationStatus: r.status,
          channelName: r.channelName || "Direct"
        }
      }));

    return NextResponse.json({
      occupancy,
      avgPrice,
      bookedDays,
      availableDays,
      blockedDays,
      totalDays: calendarDays.length,
      calendarDays,
      reservations
    });
  } catch (err: any) {
    console.error("[api/calendar-metrics] GET error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

