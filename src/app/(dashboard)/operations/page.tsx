import { connectDB, Reservation, Listing } from "@/lib/db";
import { OperationsClient } from "./operations-client";
import { format, subDays, addDays } from "date-fns";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
    await connectDB();

    const today = new Date();
    const startDate = format(subDays(today, 2), "yyyy-MM-dd");
    const endDate = format(addDays(today, 90), "yyyy-MM-dd");

    // Fetch reservations in range, populate listing name
    const reservationDocs = await Reservation.find({
        checkOut: { $gte: startDate, $lte: endDate },
    })
        .sort({ checkOut: 1 })
        .lean();

    // Build listing name map
    const listingIds = [...new Set(reservationDocs.map((r) => r.listingId.toString()))];
    const listingDocs = await Listing.find({
        _id: { $in: listingIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
        .select("name")
        .lean();

    const listingNameMap = new Map(
        listingDocs.map((l) => [l._id.toString(), l.name])
    );

    const mapped = reservationDocs.map((r) => ({
        id: r._id.toString(),
        listingId: r.listingId.toString(),
        propertyName: listingNameMap.get(r.listingId.toString()) || "Unknown Property",
        startDate: r.checkIn,
        endDate: r.checkOut,
        guestDetails: {
            name: r.guestName,
            email: r.guestEmail,
            phone: r.guestPhone,
            numberOfGuests: r.guests,
        },
        financials: {
            channelName: r.channelName,
            totalPrice: Number(r.totalPrice || 0),
            price_per_night:
                r.nights > 0
                    ? String(Math.round(r.totalPrice / r.nights))
                    : null,
            reservationStatus: r.status,
        },
        type: "reservation" as const,
    }));

    return (
        <div className="flex-1 flex flex-col p-8 bg-muted/5 h-full overflow-hidden">
            <div className="mb-8 shrink-0">
                <h1 className="text-3xl font-bold mb-2">Logistics & Cleaning</h1>
                <p className="text-muted-foreground text-sm max-w-2xl">
                    Automated cleaning and maintenance schedule generated from PMS reservation check-outs.
                </p>
            </div>

            <OperationsClient reservations={mapped} />
        </div>
    );
}
