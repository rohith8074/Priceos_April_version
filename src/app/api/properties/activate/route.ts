import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization, Listing } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { listingId } = body;

    if (!listingId) {
        return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    await connectDB();

    const orgId = new mongoose.Types.ObjectId(session.orgId);

    const listing = await Listing.findOne({ _id: listingId, orgId }).select("_id").lean();
    if (!listing) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    await Promise.all([
        Organization.findByIdAndUpdate(orgId, {
            $addToSet: {
                "onboarding.activatedListingIds": listingId,
                "onboarding.selectedListingIds": listingId,
            },
        }),
        Listing.findByIdAndUpdate(listingId, { $set: { isActive: true } }),
    ]);

    return NextResponse.json({ success: true, listingId });
}
