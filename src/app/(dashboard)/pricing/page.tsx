import { connectDB, InventoryMaster, Listing } from "@/lib/db";
import { PricingPageTabs } from "./pricing-page-tabs";
import { format } from "date-fns";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
    await connectDB();

    const today = format(new Date(), "yyyy-MM-dd");

    // Fetch pending proposals from today onwards
    const rawDocs = await InventoryMaster.find({
        date: { $gte: today },
        proposalStatus: "pending",
    })
        .sort({ date: 1 })
        .lean();

    // Build listing name map
    const listingIds = [...new Set(rawDocs.map((r) => r.listingId.toString()))];
    const listingDocs = await Listing.find({
        _id: { $in: listingIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
        .select("name")
        .lean();

    const listingNameMap = new Map(
        listingDocs.map((l) => [l._id.toString(), l.name])
    );

    const pendingRows = rawDocs.map((row) => {
        const current = Number(row.currentPrice || 0);
        const proposed = Number(row.proposedPrice || 0);

        let changePct = row.changePct ?? null;
        if (current > 0 && proposed > 0) {
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
            listingName:
                listingNameMap.get(row.listingId.toString()) || "Unknown Property",
        };
    });

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <PricingPageTabs initialProposals={pendingRows} />
        </div>
    );
}
