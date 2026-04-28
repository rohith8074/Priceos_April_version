import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { UnifiedChatInterface } from "@/components/chat/unified-chat-interface";
import { ContextPanel } from "@/components/layout/context-panel";
import { RightSidebarLayout } from "@/components/layout/right-sidebar-layout";
import { SidebarTabbedView } from "@/components/layout/sidebar-tabbed-view";
import type { PropertyWithMetrics } from "@/types";

import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models";
import { Types } from "mongoose";

export const metadata = {
  title: "Aria | PriceOS Intelligence",
  description: "AI Revenue Manager — powered by Aria CRO.",
};

export default async function AgentChatPage() {
  const session = await getSession();
  if (!session?.orgId) redirect("/login");

  const orgObjectId = session.orgId;

  let propertiesWithMetrics: PropertyWithMetrics[] = [];
  try {
    await connectToDatabase();
    const orgOid = new Types.ObjectId(orgObjectId);
    const listingDocs = await Listing.find({ orgId: orgOid }).lean();
    const cleanListings = JSON.parse(JSON.stringify(listingDocs));
    
    propertiesWithMetrics = cleanListings.map((p: any) => ({
      ...p,
      id: p._id,
      _id: p._id,
      price: Number(p.basePrice ?? p.price ?? 0),
      occupancy: Number(p.occupancyPct ?? 0),
      avgPrice: Number(p.avgPrice ?? p.basePrice ?? p.price ?? 0),
    }));
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
