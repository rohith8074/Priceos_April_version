import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/jwt";
import { GuestInboxWired } from "@/components/chat/guest-inbox-wired";
import type { PropertyWithMetrics } from "@/types";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, Reservation } from "@/lib/db/models";
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

            propertiesWithMetrics = listings.map((l: any) => {
                const lid = l._id.toString();
                const listingRes = resByListing[lid] || [];

                // Calculate occupancy from reservation date overlaps with 30-day window
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

                const avgPrice = listingRes.length > 0
                    ? Math.round(
                        listingRes.reduce((sum: number, r: any) => sum + Number(r.totalPrice || 0) / Math.max(1, r.nights || 1), 0)
                        / listingRes.length
                      )
                    : Math.round(Number(l.price || 0));

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
                    pendingProposals: 0,
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
