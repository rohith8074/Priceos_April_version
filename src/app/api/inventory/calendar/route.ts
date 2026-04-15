import { NextRequest, NextResponse } from "next/server";
import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";
import { format, addDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const daysParam = Math.min(Number(searchParams.get("days") || 365), 365);

    if (!listingId) {
        return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    let lid: mongoose.Types.ObjectId;
    try {
        lid = new mongoose.Types.ObjectId(listingId);
    } catch {
        return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
    }

    await connectDB();

    const today = format(new Date(), "yyyy-MM-dd");
    const endDate = format(addDays(new Date(), daysParam - 1), "yyyy-MM-dd");

    const [listing, rows] = await Promise.all([
        Listing.findById(lid)
            .select("name price currencyCode priceFloor priceCeiling")
            .lean(),
        InventoryMaster.find({
            listingId: lid,
            date: { $gte: today, $lte: endDate },
        })
            .select("date currentPrice proposedPrice proposalStatus status reasoning changePct minStay")
            .sort({ date: 1 })
            .lean(),
    ]);

    if (!listing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const days = rows.map((r) => ({
        date: r.date,
        currentPrice: r.currentPrice,
        proposedPrice: r.proposedPrice ?? null,
        proposalStatus: r.proposalStatus ?? null,
        status: r.status,
        changePct: r.changePct ?? null,
        reasoning: r.reasoning ?? null,
        minStay: r.minStay ?? null,
    }));

    return NextResponse.json({
        listingId,
        listingName: listing.name,
        basePrice: listing.price,
        currency: (listing as any).currencyCode || "AED",
        priceFloor: listing.priceFloor || 0,
        priceCeiling: listing.priceCeiling || 0,
        totalDays: days.length,
        days,
    });
}
