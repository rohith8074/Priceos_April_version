import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models";

/**
 * POST /api/admin/backfill-price-guardrails
 * One-time backfill: sets priceFloor = price * 0.5 and priceCeiling = price * 3.0
 * for all listings where these values are 0 or missing.
 * Safe to run multiple times — only touches listings with zero guardrails.
 */
export async function POST(_req: NextRequest) {
  try {
    await connectToDatabase();

    const listings = await Listing.find({
      $or: [
        { priceFloor: { $in: [0, null] } },
        { priceCeiling: { $in: [0, null] } },
      ],
    }).lean();

    if (listings.length === 0) {
      return NextResponse.json({ updated: 0, message: "All listings already have guardrails set." });
    }

    const bulkOps = listings
      .filter((l: any) => Number(l.price) > 0)
      .map((l: any) => {
        const basePrice = Number(l.price);
        const updates: Record<string, number> = {};
        if (!l.priceFloor || l.priceFloor === 0) {
          updates.priceFloor = Math.round(basePrice * 0.5);
        }
        if (!l.priceCeiling || l.priceCeiling === 0) {
          updates.priceCeiling = Math.round(basePrice * 3.0);
        }
        return {
          updateOne: {
            filter: { _id: l._id },
            update: { $set: updates },
          },
        };
      });

    const result = await Listing.bulkWrite(bulkOps);

    return NextResponse.json({
      updated: result.modifiedCount,
      skipped: listings.length - bulkOps.length,
      message: `Updated ${result.modifiedCount} listings with auto-computed price guardrails.`,
    });
  } catch (err: any) {
    console.error("[backfill-price-guardrails] error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
