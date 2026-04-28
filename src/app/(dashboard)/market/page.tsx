import { MarketIntelligenceClient } from "./market-client";
import { getSession } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db/mongodb";
import { MarketEvent, Listing } from "@/lib/db/models";
import { Types } from "mongoose";

export default async function MarketPage() {
  const session = await getSession();
  if (!session?.orgId) {
    redirect("/login");
  }

  const orgObjectId = session.orgId;

  let formattedEvents: any[] = [];
  let formattedListings: any[] = [];
  let avgOccupancyPct = 0;
  let avgNightlyRate = 0;

  try {
    await connectToDatabase();
    const orgOid = new Types.ObjectId(orgObjectId);

    const [events, listings] = await Promise.all([
      MarketEvent.find({ orgId: orgOid }).lean(),
      Listing.find({ orgId: orgOid }).lean()
    ]);

    formattedEvents = events.map((e: any) => ({
      id: e._id.toString(),
      title: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      impact: e.impactLevel,
      suggestedPremiumPct: e.upliftPct,
      description: e.description || "",
      category: e.category || "General",
      area: e.area || "Dubai",
      source: e.source,
    }));

    formattedListings = listings.map((l: any) => ({
      id: l._id.toString(),
      name: l.name,
      currencyCode: l.currencyCode || "AED",
      area: l.area,
    }));

    const totalOcc = listings.reduce((sum: number, l: any) => sum + (l.occupancyPct || 0), 0);
    avgOccupancyPct = listings.length > 0 ? Math.round(totalOcc / listings.length) : 0;

    const totalRate = listings.reduce((sum: number, l: any) => sum + (l.avgPrice || l.price || 0), 0);
    avgNightlyRate = listings.length > 0 ? Math.round(totalRate / listings.length) : 0;

  } catch (err) {
    console.error("[market page] database fetch error", err);
  }

  return (
    <MarketIntelligenceClient
      orgId={orgObjectId}
      events={formattedEvents}
      occupancyPct={avgOccupancyPct}
      avgNightly={avgNightlyRate}
      listings={formattedListings}
    />
  );
}


