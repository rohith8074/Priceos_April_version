import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const daysRequested = Number(searchParams.get("days") || "365");

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ error: "Invalid listingId" }, { status: 400 });
    }

    await connectToDatabase();
    const listingOid = new Types.ObjectId(listingId);

    const listing = await Listing.findById(listingOid).lean();
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const today = new Date();
    const end = new Date();
    end.setDate(today.getDate() + daysRequested);
    
    const fromStr = today.toISOString().split("T")[0];
    const toStr = end.toISOString().split("T")[0];

    const invDocs = await InventoryMaster.find({
      listingId: listingOid,
      date: { $gte: fromStr, $lte: toStr }
    }).sort({ date: 1 }).lean();

    const days: any[] = invDocs.map((d: any) => ({
      date: d.date,
      currentPrice: Number(d.currentPrice || listing.price || 0),
      proposedPrice: d.proposedPrice ? Number(d.proposedPrice) : null,
      proposalStatus: d.proposalStatus || null,
      status: d.status || "available",
      changePct: d.proposedPrice && d.currentPrice ? Math.round(((d.proposedPrice - d.currentPrice) / d.currentPrice) * 100) : null,
      reasoning: d.reasoning || null,
      minStay: d.minStay || null
    }));

    if (days.length === 0) {
      let cur = new Date();
      for (let i = 0; i < 30; i++) {
        const ds = cur.toISOString().split("T")[0];
        days.push({
          date: ds,
          currentPrice: Number(listing.price || 0),
          proposedPrice: null,
          proposalStatus: null,
          status: "available",
          changePct: null,
          reasoning: null,
          minStay: null
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    const payload = {
      listingId: listing._id.toString(),
      listingName: listing.name,
      basePrice: Number(listing.price || 0),
      currency: listing.currencyCode || "AED",
      priceFloor: Number(listing.priceFloor || 0),
      priceCeiling: Number(listing.priceCeiling || 0),
      totalDays: days.length,
      days
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[api/inventory/calendar] GET error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
