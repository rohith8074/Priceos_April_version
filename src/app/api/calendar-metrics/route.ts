import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster, Listing, Reservation } from "@/lib/db";
import { verifyAccessToken } from "@/lib/auth/jwt";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
    try {
        // ── Auth + orgId scoping ───────────────────────────────────────────────
        const token = req.cookies.get("priceos-session")?.value;
        if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        let orgObjectId: mongoose.Types.ObjectId;
        try {
            const payload = verifyAccessToken(token);
            orgObjectId = new mongoose.Types.ObjectId(payload.orgId);
        } catch {
            return NextResponse.json({ error: "Invalid session" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const listingId = searchParams.get("listingId");
        const from = searchParams.get("from");
        const to = searchParams.get("to");

        if (!listingId || !from || !to) {
            return NextResponse.json(
                { error: "listingId, from, and to are required" },
                { status: 400 }
            );
        }

        await connectDB();

        const lid = new mongoose.Types.ObjectId(listingId);

        // Verify this listing belongs to the current org (RLS check)
        const listingExists = await Listing.exists({ _id: lid, orgId: orgObjectId });
        if (!listingExists) {
            return NextResponse.json({ error: "Listing not found" }, { status: 404 });
        }

        // Aggregate metrics
        const [agg] = await InventoryMaster.aggregate([
            { $match: { orgId: orgObjectId, listingId: lid, date: { $gte: from, $lte: to } } },
            {
                $group: {
                    _id: null,
                    totalDays: { $sum: 1 },
                    bookedDays: {
                        $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] },
                    },
                    availableDays: {
                        $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
                    },
                    blockedDays: {
                        $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
                    },
                    avgPrice: { $avg: "$currentPrice" },
                },
            },
        ]);

        let totalDays = Number(agg?.totalDays || 0);
        let bookedDays = Number(agg?.bookedDays || 0);
        let availableDays = Number(agg?.availableDays || 0);
        let blockedDays = Number(agg?.blockedDays || 0);
        let avgPriceVal = agg?.avgPrice ? Number(agg.avgPrice) : 0;

        if (avgPriceVal === 0) {
            const prop = await Listing.findOne({ _id: lid, orgId: orgObjectId }).select("price").lean();
            if (prop) avgPriceVal = Number(prop.price);
        }

        const bookableDays = totalDays - blockedDays;
        const occupancy =
            bookableDays > 0 ? Math.round((bookedDays / bookableDays) * 100) : 0;

        const calendarDocs = await InventoryMaster.find({
            orgId: orgObjectId,
            listingId: lid,
            date: { $gte: from, $lte: to },
        })
            .sort({ date: 1 })
            .select("date status currentPrice")
            .lean();

        const calendarDays = calendarDocs.map((d) => ({
            date: d.date,
            status: d.status,
            price: Number(d.currentPrice),
        }));

        const resDocs = await Reservation.find({
            orgId: orgObjectId,
            listingId: lid,
            checkIn: { $lte: to },
            checkOut: { $gte: from },
        }).lean();

        const reservations = resDocs.map((r) => ({
            guestName: r.guestName,
            startDate: r.checkIn,
            endDate: r.checkOut,
            totalPrice: r.totalPrice,
            pricePerNight:
                r.nights > 0 ? Math.round(r.totalPrice / r.nights) : r.totalPrice,
            channelName: r.channelName,
            reservationStatus: r.status,
        }));

        return NextResponse.json({
            listingId,
            dateRange: { from, to },
            totalDays,
            bookedDays,
            availableDays,
            blockedDays,
            bookableDays,
            occupancy,
            avgPrice: Math.round(avgPriceVal * 100) / 100,
            calendarDays,
            reservations,
        });
    } catch (error) {
        console.error("Calendar Metrics Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal Server Error" },
            { status: 500 }
        );
    }
}
