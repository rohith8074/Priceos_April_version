import { NextResponse } from "next/server";
import { connectDB, Listing, Organization, InventoryMaster, Reservation } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

const PROPERTY_TYPE_MAP: Record<number, string> = {
    1: "Apartment", 2: "Villa", 3: "House", 4: "Studio",
    5: "Condo", 6: "Townhouse", 7: "Cabin", 8: "Loft",
    9: "Penthouse", 10: "Hotel Room", 0: "Other",
};

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const orgId = new mongoose.Types.ObjectId(session.orgId);
    const org = await Organization.findById(orgId)
        .select("onboarding.activatedListingIds")
        .lean();

    const activatedIds = new Set(
        (org?.onboarding?.activatedListingIds || []).map(String)
    );

    const listings = await Listing.find({ orgId })
        .select("name city area bedroomsNumber bathroomsNumber price currencyCode isActive hostawayId propertyTypeId personCapacity priceFloor priceCeiling createdAt")
        .sort({ name: 1 })
        .lean();

    const today = new Date().toISOString().split("T")[0];
    const next30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

    const listingIds = listings.map((l) => l._id);

    const [occupancyAgg, revenueAgg, channelAgg] = await Promise.all([
        InventoryMaster.aggregate([
            { $match: { listingId: { $in: listingIds }, date: { $gte: today, $lte: next30 } } },
            {
                $group: {
                    _id: "$listingId",
                    totalDays: { $sum: 1 },
                    bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
                    avgPrice: { $avg: "$currentPrice" },
                    pendingProposals: {
                        $sum: { $cond: [{ $eq: ["$proposalStatus", "pending"] }, 1, 0] },
                    },
                },
            },
        ]),
        Reservation.aggregate([
            {
                $match: {
                    listingId: { $in: listingIds },
                    status: { $in: ["confirmed", "checked_in", "checked_out"] },
                },
            },
            {
                $group: {
                    _id: "$listingId",
                    totalRevenue: { $sum: "$totalPrice" },
                    count: { $sum: 1 },
                },
            },
        ]),
        Reservation.aggregate([
            {
                $match: {
                    listingId: { $in: listingIds },
                    status: { $in: ["confirmed", "checked_in", "checked_out"] },
                },
            },
            {
                $group: {
                    _id: { listingId: "$listingId", channel: "$channelName" },
                    revenue: { $sum: "$totalPrice" },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const occMap = new Map(occupancyAgg.map((r: any) => [r._id.toString(), r]));
    const revMap = new Map(revenueAgg.map((r: any) => [r._id.toString(), r]));

    const channelMap = new Map<string, { channel: string; revenue: number; count: number }[]>();
    for (const row of channelAgg as any[]) {
        const lid = row._id.listingId.toString();
        if (!channelMap.has(lid)) channelMap.set(lid, []);
        channelMap.get(lid)!.push({
            channel: row._id.channel || "Direct",
            revenue: row.revenue,
            count: row.count,
        });
    }

    const propertyTypeMap = new Map<number, string>();
    for (const l of listings as any[]) {
        propertyTypeMap.set(l.propertyTypeId, PROPERTY_TYPE_MAP[l.propertyTypeId] || `Type ${l.propertyTypeId}`);
    }

    const properties = listings.map((l: any) => {
        const id = l._id.toString();
        const occ = occMap.get(id);
        const rev = revMap.get(id);
        const totalDays = occ?.totalDays || 0;
        const bookedDays = occ?.bookedDays || 0;
        const occupancyPct = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;
        const channels = channelMap.get(id) || [];
        channels.sort((a, b) => b.revenue - a.revenue);

        return {
            id,
            name: l.name,
            city: l.city || "",
            area: l.area || "",
            bedrooms: l.bedroomsNumber || 1,
            bathrooms: l.bathroomsNumber || 1,
            basePrice: l.price,
            currency: l.currencyCode || "AED",
            priceFloor: l.priceFloor || 0,
            priceCeiling: l.priceCeiling || 0,
            capacity: l.personCapacity || null,
            hostawayId: l.hostawayId || null,
            propertyType: PROPERTY_TYPE_MAP[l.propertyTypeId] || "Other",
            isActive: l.isActive !== false,
            isActivated: activatedIds.has(id),
            occupancyPct,
            avgPrice: occ?.avgPrice ? Math.round(occ.avgPrice) : l.price,
            pendingProposals: occ?.pendingProposals || 0,
            totalReservations: rev?.count || 0,
            totalRevenue: rev?.totalRevenue || 0,
            revenueByChannel: channels,
            createdAt: l.createdAt,
        };
    });

    const revenueByType: Record<string, number> = {};
    for (const p of properties) {
        revenueByType[p.propertyType] = (revenueByType[p.propertyType] || 0) + p.totalRevenue;
    }

    return NextResponse.json({
        total: properties.length,
        activated: properties.filter((p) => p.isActivated).length,
        portfolioTotalRevenue: properties.reduce((s, p) => s + p.totalRevenue, 0),
        revenueByPropertyType: Object.entries(revenueByType).map(([type, revenue]) => ({ type, revenue })),
        properties,
    });
}
