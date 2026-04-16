import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { PricingPageTabs } from "./pricing-page-tabs";
import { format } from "date-fns";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  await connectDB();
  const session = await getSession();
  if (!session?.orgId) {
    return null;
  }
  const orgId = new mongoose.Types.ObjectId(session.orgId);

  const today = format(new Date(), "yyyy-MM-dd");

  // 14 days ago for showing recent approved/rejected/pushed history
  const past14 = new Date();
  past14.setDate(past14.getDate() - 14);
  const past14Str = format(past14, "yyyy-MM-dd");

  // Fetch all proposals: pending (today+) and recent history (past 14d)
  const rawDocs = await InventoryMaster.find({
    orgId,
    $or: [
      { proposalStatus: "pending", date: { $gte: today } },
      { proposalStatus: { $in: ["approved", "rejected", "pushed"] }, date: { $gte: past14Str } },
    ],
  })
    .sort({ date: 1 })
    .lean();

  // Build listing name + currency map from returned docs
  const listingIds = [...new Set(rawDocs.map((r) => r.listingId.toString()))];
  const listingDocs = await Listing.find({
    orgId,
    _id: { $in: listingIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name currencyCode")
    .lean();

  const listingNameMap = new Map(
    listingDocs.map((l) => [l._id.toString(), l.name])
  );
  const listingCurrencyMap = new Map(
    listingDocs.map((l: any) => [l._id.toString(), (l.currencyCode as string) || "AED"])
  );

  // All active listings for Rules Studio listing selector
  const allListingDocs = await Listing.find({ orgId, isActive: true })
    .select("_id name currencyCode")
    .lean();

  const listings = allListingDocs.map((l: any) => ({
    id: l._id.toString(),
    name: l.name,
    currencyCode: (l.currencyCode as string) || "AED",
  }));

  const allProposals = rawDocs.map((row) => {
    const current = Number(row.currentPrice || 0);
    const proposed = Number(row.proposedPrice || 0);

    let changePct = row.changePct ?? null;
    if (current > 0 && proposed > 0 && changePct === null) {
      changePct = Math.round(((proposed - current) / current) * 100);
    }

    return {
      id: row._id.toString(),
      listingId: row.listingId.toString(),
      date: row.date,
      currentPrice: String(current),
      proposedPrice: proposed > 0 ? String(proposed) : null,
      changePct,
      reasoning: row.reasoning ?? null,
      minStay: row.minStay ?? null,
      maxStay: row.maxStay ?? null,
      closedToArrival: row.closedToArrival ?? false,
      closedToDeparture: row.closedToDeparture ?? false,
      proposalStatus: row.proposalStatus ?? "pending",
      listingName:
        listingNameMap.get(row.listingId.toString()) || "Unknown Property",
      currencyCode:
        listingCurrencyMap.get(row.listingId.toString()) || "AED",
    };
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <PricingPageTabs initialProposals={allProposals} listings={listings} />
    </div>
  );
}
