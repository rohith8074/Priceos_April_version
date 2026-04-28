import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    
    const listings = await Listing.find({}).limit(1).lean() as any[];
    const inventory = await InventoryMaster.find({}).limit(1).lean() as any[];
    const reservations = await Reservation.find({}).limit(1).lean() as any[];

    return NextResponse.json({
      listingsSample: listings.map(l => ({ _id: l._id, orgId: l.orgId, orgIdType: typeof l.orgId })),
      inventorySample: inventory.map(i => ({ _id: i._id, orgId: i.orgId, orgIdType: typeof i.orgId })),
      reservationsSample: reservations.map(r => ({ _id: r._id, orgId: r.orgId, orgIdType: typeof r.orgId })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
