import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
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

    const [invDocs, resDocs] = await Promise.all([
      InventoryMaster.find({
        orgId: orgOid,
        date: { $gte: fromDate, $lte: toDate }
      }).lean(),
      Reservation.find({ orgId: orgOid }).lean()
    ]);

    const invByListing: Record<string, any[]> = {};
    invDocs.forEach((d: any) => {
      const lid = d.listingId?.toString() || "";
      if (!invByListing[lid]) invByListing[lid] = [];
      invByListing[lid].push(d);
    });

    const resByListing: Record<string, any[]> = {};
    resDocs.forEach((r: any) => {
      const lid = r.listingId?.toString() || "";
      if (!resByListing[lid]) resByListing[lid] = [];
      resByListing[lid].push(r);
    });

    const properties: any[] = [];

    for (const l of listings) {
      const lid = l._id.toString();
      const listingInv = invByListing[lid] || [];
      const listingRes = resByListing[lid] || [];

      const bookedDays = listingInv.filter((x: any) => x.status === "booked").length;
      const occupancy = listingInv.length > 0 ? Math.round((bookedDays / listingInv.length) * 100) : 0;
      
      const sumPrices = listingInv.reduce((sum: number, x: any) => sum + Number(x.currentPrice || 0), 0);
      const avgPrice = listingInv.length > 0 ? Math.round(sumPrices / listingInv.length) : Math.round(Number(l.price || 0));

      const pending = listingInv.filter((x: any) => x.proposalStatus === "pending").length;
      let revenue = listingInv
        .filter((x: any) => x.status === "booked")
        .reduce((sum: number, x: any) => sum + Number(x.currentPrice || 0), 0);

      if (revenue === 0 && listingRes.length > 0) {
        revenue = listingRes
          .filter((r: any) => r.status !== "cancelled")
          .reduce((sum: number, r: any) => sum + Number(r.totalPrice || 0), 0);
      }

      const channelMap: Record<string, { channel: string; revenue: number; count: number }> = {};
      listingRes.forEach((r: any) => {
        const channel = r.channelName || "Direct";
        if (!channelMap[channel]) {
          channelMap[channel] = { channel, revenue: 0, count: 0 };
        }
        channelMap[channel].revenue += Number(r.totalPrice || 0);
        channelMap[channel].count += 1;
      });

      const totalChannelRev = Object.values(channelMap).reduce((sum: number, ch: any) => sum + ch.revenue, 0);
      if (revenue > totalChannelRev) {
        const diff = revenue - totalChannelRev;
        channelMap["Other"] = {
          channel: "Other",
          revenue: Math.round(diff * 100) / 100,
          count: 1
        };
      }

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
        propertyType: String((l as any).propertyType || l.propertyTypeId || "Apartment"),
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
