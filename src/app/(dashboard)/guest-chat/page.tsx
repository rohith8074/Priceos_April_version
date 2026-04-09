import { connectDB, Listing, InventoryMaster } from "@/lib/db";
import { ContextPanel } from "@/components/layout/context-panel";
import { GuestChatInterface } from "@/components/chat/guest-chat-interface";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";

export const metadata = {
    title: "Guest Inbox | PriceOS Intelligence",
    description: "Real-time guest communication and AI-powered relationship management.",
};

export default async function GuestChatPage() {
    await connectDB();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const plus14 = new Date(today);
    plus14.setDate(plus14.getDate() + 14);
    const plus14Str = plus14.toISOString().split("T")[0];

    // 1. Fetch all listings
    const allListings = await Listing.find().lean();

    // 2. Aggregate occupancy/avg_price for next 14 days per listing
    const statsResult = await InventoryMaster.aggregate([
        { $match: { date: { $gte: todayStr, $lte: plus14Str } } },
        {
            $group: {
                _id: "$listingId",
                totalDays: { $sum: 1 },
                bookedDays: {
                    $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] },
                },
                blockedDays: {
                    $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
                },
                avgPrice: { $avg: "$currentPrice" },
            },
        },
    ]);
    // Compute occupancy in JS (DocumentDB doesn't support $round)
    statsResult.forEach((s: any) => {
        const avail = s.totalDays - s.blockedDays;
        s.occupancy = avail > 0 ? Math.round((s.bookedDays / avail) * 100) : 0;
    });

    // 3. Merge stats into listing objects
    const plainListings = JSON.parse(JSON.stringify(allListings));
    const propertiesWithMetrics = plainListings.map((listing: any) => {
        const listingIdStr = String(listing._id);
        const stat = statsResult.find((s) => String(s._id) === listingIdStr);

        return {
            ...listing,
            id: listingIdStr,
            _id: listingIdStr,
            occupancy: stat ? Number(stat.occupancy) : 0,
            avgPrice:
                stat && Number(stat.avgPrice) > 0
                    ? Number(stat.avgPrice)
                    : Number(listing.price),
        };
    });

    return (
        <div className="flex h-full overflow-hidden">
            <div id="tour-property-list">
                <ContextPanel properties={propertiesWithMetrics} />
            </div>

            {/* Center Guest Chat Panel */}
            <div className="flex-[2] min-w-[500px] border-r flex flex-col h-full bg-background relative z-10 transition-all duration-300">
                <GuestChatInterface />
            </div>

            {/* Right Side Stack: Executive Summary Table & Sync */}
            <div id="tour-sidebar">
                <RightSidebarLayout>
                    <SidebarTabbedView />
                </RightSidebarLayout>
            </div>
        </div>
    );
}
