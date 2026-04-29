import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { UnifiedChatInterface } from "@/components/chat/unified-chat-interface";
import { ContextPanel } from "@/components/layout/context-panel";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import type { PropertyWithMetrics } from "@/types";

import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

export const metadata = {
  title: "Aria | PriceOS Intelligence",
  description: "AI Revenue Manager — powered by Aria CRO.",
};

export default async function AgentChatPage() {
  const session = await getSession();
  if (!session?.orgId) redirect("/login");

  const orgObjectId = session.orgId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus29 = new Date(today);
  plus29.setDate(plus29.getDate() + 29);
  const plus29Str = plus29.toISOString().split("T")[0];

  let propertiesWithMetrics: PropertyWithMetrics[] = [];
  try {
    await connectToDatabase();
    const orgOid = new Types.ObjectId(orgObjectId);
    
    const listingDocs = await Listing.find({ orgId: orgOid }).lean();
    const listingOids = listingDocs.map((l: any) => l._id);
    const listingIds = listingDocs.map((l: any) => l._id.toString());
    const combinedListingIds = [...listingOids, ...listingIds];

    const [invDocs, resDocs] = await Promise.all([
      InventoryMaster.find({
        listingId: { $in: combinedListingIds },
        date: { $gte: todayStr, $lte: plus29Str }
      }).lean(),
      Reservation.find({
        listingId: { $in: combinedListingIds },
        status: { $ne: "cancelled" },
        checkOut: { $gte: todayStr },
        checkIn: { $lte: plus29Str },
      }).lean(),
    ]);
    
    const cleanListings = JSON.parse(JSON.stringify(listingDocs));
    const invByListing: Record<string, any[]> = {};
    const resByListing: Record<string, any[]> = {};
    
    for (const inv of invDocs) {
      if (!inv.listingId) continue;
      const lId = inv.listingId.toString();
      if (!invByListing[lId]) invByListing[lId] = [];
      invByListing[lId].push(inv);
    }

    for (const res of resDocs) {
      const lId = (res.listingId || "").toString();
      if (!lId) continue;
      if (!resByListing[lId]) resByListing[lId] = [];
      resByListing[lId].push(res);
    }
    
    propertiesWithMetrics = cleanListings.map((p: any) => {
      const pId = p._id.toString();
      const pInvs = invByListing[pId] || [];
      const pRes = resByListing[pId] || [];

      // Method 1: Occupancy from Inventory
      const invBooked = pInvs.filter((d: any) => d.status === "booked" || d.status === "reserved").length;
      const invTotal = pInvs.length;
      const invOcc = invTotal > 0 ? Math.round((invBooked / invTotal) * 100) : 0;

      // Method 2: Occupancy from Reservations
      let resBookedDays = 0;
      const WINDOW_DAYS = 30;
      for (const r of pRes) {
        const checkIn = r.checkIn > todayStr ? r.checkIn : todayStr;
        const checkOut = r.checkOut < plus29Str ? r.checkOut : plus29Str;
        if (checkOut > checkIn) {
          resBookedDays += Math.ceil(
            (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
          );
        }
      }
      const resOcc = Math.min(100, Math.round((resBookedDays / WINDOW_DAYS) * 100));

      // Choose maximum calculated occupancy for safety
      const calculatedOccupancy = Math.max(invOcc, resOcc);
      
      return {
        ...p,
        id: p._id,
        _id: p._id,
        price: Number(p.basePrice ?? p.price ?? 500),
        occupancy: calculatedOccupancy,
        avgPrice: Number(p.avgPrice ?? p.basePrice ?? p.price ?? 500),
      };
    });
  } catch (err) {
    console.error("[agent-chat page] failed to load properties", err);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: property selector panel */}
      <ContextPanel properties={propertiesWithMetrics} />

      {/* Center: Aria chat */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
        <UnifiedChatInterface properties={propertiesWithMetrics} orgId={orgObjectId} />
      </div>

      {/* Right: signals / calendar / summary sidebar (toggled by Sidebar button in chat header) */}
      <RightSidebarLayout>
        <SidebarTabbedView />
      </RightSidebarLayout>
    </div>
  );
}
