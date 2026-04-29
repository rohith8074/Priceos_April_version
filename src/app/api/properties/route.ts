import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ properties: [] }, { status: 200 });
    }

    await connectToDatabase();

    const orgOid = new Types.ObjectId(orgId);
    const listings = await Listing.find({ orgId: orgOid }).lean();
    
    if (listings.length === 0) {
      return NextResponse.json({ properties: [] }, { status: 200 });
    }

    const now = new Date();
    const fromDate = now.toISOString().split("T")[0];
    const toDate = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const WINDOW_DAYS = 30;

    const listingOids = listings.map((l: any) => l._id);

    const resDocs = await Reservation.find({
      listingId: { $in: listingOids },
      status: { $ne: "cancelled" },
      checkOut: { $gte: fromDate },
      checkIn: { $lte: toDate },
    }).lean();

    const resByListing: Record<string, any[]> = {};
    resDocs.forEach((r: any) => {
      const lid = r.listingId?.toString() || "";
      if (!resByListing[lid]) resByListing[lid] = [];
      resByListing[lid].push(r);
    });

    const properties: any[] = [];

    for (const l of listings) {
      const lid = l._id.toString();
      const listingRes = resByListing[lid] || [];

      // Calculate occupancy from reservation date overlaps with the 30-day window
      let bookedDays = 0;
      for (const r of listingRes) {
        const checkIn = r.checkIn > fromDate ? r.checkIn : fromDate;
        const checkOut = r.checkOut < toDate ? r.checkOut : toDate;
        if (checkOut > checkIn) {
          bookedDays += Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
          );
        }
      }
      const occupancy = Math.min(100, Math.round((bookedDays / WINDOW_DAYS) * 100));

      // Average nightly rate from reservations; fall back to listing base price
      const activeRes = listingRes.filter((r: any) => r.status !== "cancelled");
      const avgPrice = activeRes.length > 0
        ? Math.round(
            activeRes.reduce((sum: number, r: any) => sum + Number(r.totalPrice || 0) / Math.max(1, r.nights || 1), 0)
            / activeRes.length
          )
        : Math.round(Number(l.price || 0));

      const pending = 0;
      const channelMap: Record<string, { channel: string; revenue: number; count: number }> = {};
      listingRes
        .filter((r: any) => r.status !== "cancelled")
        .forEach((r: any) => {
          const channel = r.channelName || "Direct";
          if (!channelMap[channel]) {
            channelMap[channel] = { channel, revenue: 0, count: 0 };
          }
          channelMap[channel].revenue += Number(r.totalPrice || 0);
          channelMap[channel].count += 1;
        });

      const revenue = Object.values(channelMap).reduce((sum: number, ch: any) => sum + ch.revenue, 0);

      const PROPERTY_TYPE_MAP: Record<number, string> = {
        0: "Apartment",
        1: "Apartment",
        2: "Villa",
        3: "House",
        4: "Studio",
        5: "Penthouse",
        6: "Townhouse",
        7: "Condo",
        8: "Loft",
      };

      const propertyTypeRaw = (l as any).propertyType || l.propertyTypeId;
      const propertyType = (propertyTypeRaw === "N/A" || !propertyTypeRaw)
        ? "Apartment"
        : (PROPERTY_TYPE_MAP[Number(propertyTypeRaw)] || String(propertyTypeRaw));

      properties.push({
        id: lid,
        _id: lid,
        name: l.name,
        city: l.city,
        area: l.area,
        bedrooms: l.bedroomsNumber || 0,
        bathrooms: l.bathroomsNumber || 0,
        basePrice: Number(l.price || 0),
        price: Number(l.price || 0),
        currency: l.currencyCode || "AED",
        currencyCode: l.currencyCode || "AED",
        priceFloor: Number(l.priceFloor || 0),
        priceCeiling: Number(l.priceCeiling || 0),
        capacity: l.personCapacity,
        hostawayId: l.hostawayId,
        propertyType,
        isActive: Boolean(l.isActive),
        isActivated: Boolean(l.isActive),
        occupancyPct: occupancy,
        avgPrice: avgPrice,
        pendingProposals: pending,
        totalReservations: listingRes.length,
        totalRevenue: Math.round(revenue * 100) / 100,
        revenueByChannel: Object.values(channelMap),
        createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : null,
      });

    }

    return NextResponse.json({ properties }, { status: 200 });
  } catch (err: any) {
    console.error("[api/properties]", err);
    return NextResponse.json({ properties: [], error: err.message }, { status: 500 });
  }
}
