import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/jwt";
import { GuestInboxWired } from "@/components/chat/guest-inbox-wired";
import type { PropertyWithMetrics } from "@/types";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

export const metadata = {
    title: "Guest Inbox | PriceOS Intelligence",
    description: "Real-time guest communication and AI-powered relationship management.",
};

export default async function GuestChatPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("priceos-session")?.value;
    if (!token) redirect("/login");

    let orgObjectId: string;
    try {
        const payload = verifyToken(token) as any;
        if (!payload) redirect("/login");
        orgObjectId = payload.orgId;
    } catch {
        redirect("/login");
    }

    let propertiesWithMetrics: PropertyWithMetrics[] = [];
    try {
        await connectToDatabase();
        const orgOid = new Types.ObjectId(orgObjectId);
        
        const listings = await Listing.find({ orgId: orgOid }).lean();

        if (listings.length > 0) {
            const now = new Date();
            const fromDate = now.toISOString().split("T")[0];
            const toDate = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

            const listingOids = listings.map((l: any) => l._id);

            const [invDocs, resDocs] = await Promise.all([
                InventoryMaster.find({
                    listingId: { $in: listingOids },
                    date: { $gte: fromDate, $lte: toDate }
                }).lean(),
                Reservation.find({ listingId: { $in: listingOids } }).lean()
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

            propertiesWithMetrics = listings.map((l: any) => {
                const lid = l._id.toString();
                const listingInv = invByListing[lid] || [];
                const listingRes = resByListing[lid] || [];

                const bookedDays = listingInv.filter((x: any) => x.status === "booked").length;
                const occupancy = listingInv.length > 0 ? Math.round((bookedDays / listingInv.length) * 100) : 0;
                
                const sumPrices = listingInv.reduce((sum: number, x: any) => sum + Number(x.currentPrice || 0), 0);
                const avgPrice = listingInv.length > 0 ? Math.round(sumPrices / listingInv.length) : Math.round(Number(l.price || 0));

                return {
                    id: lid,
                    _id: lid,
                    name: l.name || "Unknown",
                    city: l.city || "",
                    area: l.area || "",
                    bedrooms: l.bedroomsNumber || 0,
                    bathrooms: l.bathroomsNumber || 0,
                    basePrice: Number(l.price || 0),
                    price: Number(l.price || 0),
                    currency: l.currencyCode || "AED",
                    currencyCode: l.currencyCode || "AED",
                    priceFloor: Number(l.priceFloor || 0),
                    priceCeiling: Number(l.priceCeiling || 0),
                    capacity: l.personCapacity || 0,
                    hostawayId: l.hostawayId || "",
                    propertyType: String(l.propertyTypeId || "N/A"),
                    isActive: Boolean(l.isActive),
                    isActivated: Boolean(l.isActive),
                    occupancyPct: occupancy,
                    occupancy: occupancy,
                    avgPrice: avgPrice,
                    pendingProposals: listingInv.filter((x: any) => x.proposalStatus === "pending").length,
                    totalReservations: listingRes.length,
                    createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : null,
                };
            });
        }
    } catch (err) {
        console.error("[guest-chat page] failed to load properties", err);
    }

    return (
        <div className="flex h-full overflow-hidden">
            <GuestInboxWired orgId={orgObjectId} properties={propertiesWithMetrics} />
        </div>
    );
}
