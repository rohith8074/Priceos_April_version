import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { connectDB, Listing, InventoryMaster } from "@/lib/db";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ContextPanel } from "@/components/layout/context-panel";
import { UnifiedChatInterface } from "@/components/chat/unified-chat-interface";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";

export default async function DashboardPage() {
  // ── Auth + orgId ──────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) redirect("/login");

  let orgObjectId: mongoose.Types.ObjectId;
  try {
    const payload = verifyAccessToken(token!);
    orgObjectId = new mongoose.Types.ObjectId(payload.orgId);
  } catch {
    redirect("/login");
  }

  await connectDB();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus14 = new Date(today);
  plus14.setDate(plus14.getDate() + 14);
  const plus14Str = plus14.toISOString().split("T")[0];

  // Fetch only active listings for THIS org
  const allListings = await Listing.find({ orgId: orgObjectId!, isActive: true }).lean();

  // Aggregate occupancy/avg_price scoped to orgId
  const statsResult = await InventoryMaster.aggregate([
    { $match: { orgId: orgObjectId!, date: { $gte: todayStr, $lte: plus14Str } } },
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

  statsResult.forEach((s: any) => {
    const avail = s.totalDays - s.blockedDays;
    s.occupancy = avail > 0 ? Math.round((s.bookedDays / avail) * 100) : 0;
  });

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

      <div className="flex-[2] min-w-[500px] border-r flex flex-col h-full bg-background relative z-10 transition-all duration-300">
        <UnifiedChatInterface properties={propertiesWithMetrics} />
      </div>

      <div id="tour-sidebar">
        <RightSidebarLayout>
          <SidebarTabbedView />
        </RightSidebarLayout>
      </div>
    </div>
  );
}
