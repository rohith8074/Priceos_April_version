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
      Reservation.find({ listingId: listingOid }).lean(),
      InventoryMaster.find({ listingId: listingOid, date: { $gte: from, $lte: to } }).lean(),
    ]);

    const bookedDays = invDocs.filter((d: any) => d.status === "booked").length;
    const blockedDays = invDocs.filter((d: any) => d.status === "blocked").length;
    const totalDays = invDocs.length;
    const availableDays = totalDays - bookedDays - blockedDays;
    const occupancy = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;

    const sumPrices = invDocs.reduce((sum: number, x: any) => sum + Number(x.currentPrice || listing.price || 0), 0);
    const avgPrice = totalDays > 0 ? Math.round(sumPrices / totalDays) : Math.round(Number(listing.price || 0));

    const calendarDays = invDocs.map((d: any) => ({
      date: d.date,
      status: d.status || "available",
      price: Number(d.currentPrice || listing.price || 0)
    }));

    if (calendarDays.length === 0 && from && to) {
      let cur = new Date(from);
      const end = new Date(to);
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0];
        calendarDays.push({
          date: ds,
          status: "available",
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

