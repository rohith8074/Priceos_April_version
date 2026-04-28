import { getSession } from "@/lib/auth/server";
import { PricingPageTabs } from "./pricing-page-tabs";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster } from "@/lib/db/models";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await getSession();
  if (!session?.orgId) {
    return null;
  }

  let listings: any[] = [];
  let proposals: any[] = [];

  try {
    await connectToDatabase();
    const orgOid = new Types.ObjectId(session.orgId);

    const [listingDocs, invDocs] = await Promise.all([
      Listing.find({ orgId: orgOid }).lean(),
      InventoryMaster.find({
        orgId: orgOid,
        proposedPrice: { $ne: null },
        proposalStatus: { $in: ["pending", "approved", "rejected", "pushed"] }
      }).sort({ date: 1 }).limit(500).lean(),
    ]);

    listings = listingDocs.map((l: any) => ({
      id: l._id.toString(),
      _id: l._id.toString(),
      name: l.name,
      currencyCode: l.currencyCode || "AED",
    }));

    const listingMap: Record<string, any> = {};
    listingDocs.forEach((l: any) => {
      listingMap[l._id.toString()] = l;
    });

    proposals = invDocs.map((d: any) => {
      const listing = listingMap[d.listingId?.toString() || ""];
      return {
        id: d._id.toString(),
        _id: d._id.toString(),
        listingId: d.listingId?.toString() || "",
        listingName: listing?.name || "Unknown Property",
        date: d.date,
        currentPrice: d.currentPrice,
        proposedPrice: d.proposedPrice,
        changePct: d.changePct,
        proposalStatus: d.proposalStatus || "pending",
        status: d.proposalStatus || "pending",
        reasoning: d.reasoning || ""
      };
    });
  } catch (err) {
    console.error("[PricingPage] database query error", err);
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <PricingPageTabs 
        initialProposals={proposals} 
        listings={listings} 
        orgId={session.orgId}
      />
    </div>
  );
}

