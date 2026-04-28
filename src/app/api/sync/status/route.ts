import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, Reservation, InventoryMaster } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const propertyId = searchParams.get("propertyId") || searchParams.get("listingId");

    if (!orgId) {
      return NextResponse.json({ error: "Missing orgId" }, { status: 400 });
    }

    await connectToDatabase();

    const listingFilter: any = { orgId: new Types.ObjectId(orgId) };
    const reservationFilter: any = { orgId: new Types.ObjectId(orgId) };
    const inventoryFilter: any = { orgId: new Types.ObjectId(orgId) };

    if (propertyId && Types.ObjectId.isValid(propertyId)) {
      const pId = new Types.ObjectId(propertyId);
      listingFilter._id = pId;
      reservationFilter.listingId = pId;
      inventoryFilter.listingId = pId;
    }

    const [listingsCount, reservationsCount, inventoryDaysCount] = await Promise.all([
      Listing.countDocuments(listingFilter),
      Reservation.countDocuments(reservationFilter),
      InventoryMaster.countDocuments(inventoryFilter)
    ]);

    const [latestListing, latestReservation, latestInventory] = await Promise.all([
      Listing.findOne(listingFilter).sort({ updatedAt: -1 }).lean(),
      Reservation.findOne(reservationFilter).sort({ updatedAt: -1 }).lean(),
      InventoryMaster.findOne(inventoryFilter).sort({ updatedAt: -1 }).lean()
    ]);

    return NextResponse.json({
      listings: {
        count: listingsCount,
        lastSyncedAt: latestListing?.updatedAt ? new Date(latestListing.updatedAt).toISOString() : null,
      },
      reservations: {
        count: reservationsCount,
        lastSyncedAt: latestReservation?.updatedAt ? new Date(latestReservation.updatedAt).toISOString() : null,
      },
      inventory_master: {
        daysCount: inventoryDaysCount,
        lastSyncedAt: latestInventory?.updatedAt ? new Date(latestInventory.updatedAt).toISOString() : null,
      },
    }, { status: 200 });
  } catch (err: any) {
    console.error("[api/sync/status]", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
