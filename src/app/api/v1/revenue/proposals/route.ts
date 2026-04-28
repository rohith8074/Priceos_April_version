import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { InventoryMaster, Listing } from "@/lib/db/models";
import { Types } from "mongoose";

// GET /api/v1/revenue/proposals
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const listingId = searchParams.get("listingId");
    const status = searchParams.get("status") || "all";

    if (!orgId) {
      return NextResponse.json({ proposals: [], count: 0 }, { status: 200 });
    }

    await connectToDatabase();

    const query: any = {
      orgId: new Types.ObjectId(orgId),
      proposedPrice: { $ne: null }
    };

    if (listingId && Types.ObjectId.isValid(listingId)) {
      query.listingId = new Types.ObjectId(listingId);
    }

    if (status !== "all") {
      query.proposalStatus = status;
    } else {
      query.proposalStatus = { $in: ["pending", "approved", "rejected", "pushed"] };
    }

    const docs = await InventoryMaster.find(query).sort({ date: 1 }).limit(500).lean();

    const uniqueListingIds = Array.from(new Set(docs.map((d: any) => d.listingId?.toString()).filter(Boolean)));
    const listingOids = uniqueListingIds.map((id: string) => new Types.ObjectId(id));

    const listings = await Listing.find({ _id: { $in: listingOids } }).lean();
    const listingMap: Record<string, any> = {};
    listings.forEach((l: any) => {
      listingMap[l._id.toString()] = l;
    });

    const proposals = docs.map((d: any) => {
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

    return NextResponse.json({ proposals, count: proposals.length }, { status: 200 });
  } catch (err: any) {
    console.error("[api/v1/revenue/proposals] GET", err);
    return NextResponse.json({ proposals: [], count: 0, error: err.message }, { status: 500 });
  }
}

// POST /api/v1/revenue/proposals
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, _ids, action } = body;

    if (!orgId || !_ids || !action) {
      return NextResponse.json({ processed: 0, error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    let newStatus: "pending" | "approved" | "rejected" | "pushed" | "rolled_back" = "pushed";
    if (action === "approve" || action === "save" || action === "apply") {
      newStatus = "approved";
    } else if (action === "reject") {
      newStatus = "rejected";
    }

    const validOids = _ids.map((id: string) => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null).filter(Boolean);

    if (validOids.length === 0) {
      return NextResponse.json({ processed: 0, action, newStatus: "none" }, { status: 200 });
    }

    const docs = await InventoryMaster.find({
      _id: { $in: validOids },
      orgId: new Types.ObjectId(orgId)
    });

    let processed = 0;
    for (const d of docs) {
      d.proposalStatus = newStatus;
      if (newStatus === "pushed" && d.proposedPrice !== null && d.proposedPrice !== undefined) {
        d.previousPrice = d.currentPrice;
        d.currentPrice = d.proposedPrice;
      }
      await d.save();
      processed++;
    }

    return NextResponse.json({ processed, action, newStatus }, { status: 200 });
  } catch (err: any) {
    console.error("[api/v1/revenue/proposals] POST", err);
    return NextResponse.json({ processed: 0, error: err.message }, { status: 500 });
  }
}
