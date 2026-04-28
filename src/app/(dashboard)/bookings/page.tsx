export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, Reservation, InventoryMaster } from "@/lib/db/models";
import { Types } from "mongoose";
import { BookingsContent } from "./bookings-content";
import type { CalendarDay } from "@/types/hostaway";

export default async function BookingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) redirect("/login");

  let orgId: string;
  try {
    const payload = verifyToken(token!) as any;
    if (!payload) redirect("/login");
    orgId = payload.orgId;
  } catch {
    redirect("/login");
  }

  await connectToDatabase();
  const orgOid = new Types.ObjectId(orgId);

  const [listingDocs, reservationDocs, inventoryDocs] = await Promise.all([
    Listing.find({ orgId: orgOid }).lean(),
    Reservation.find({ orgId: orgOid }).lean(),
    InventoryMaster.find({ orgId: orgOid }).lean(),
  ]);

  const allProperties = listingDocs.map((l: any) => ({
    id: l._id.toString(),
    ...l,
  }));

  const allReservations = reservationDocs.map((r: any) => ({
    id: r._id.toString(),
    listingMapId: r.listingId?.toString(),
    arrivalDate: r.checkIn,
    departureDate: r.checkOut,
    pricePerNight: r.nights > 0 ? Math.round(Number(r.totalPrice || 0) / r.nights) : Number(r.totalPrice || 0),
    ...r,
  }));

  const defaultPropertyId = allProperties[0]?.id ?? "";

  // Map inventory docs to CalendarDay[] grouped by listing
  const calByListing: Record<string, CalendarDay[]> = {};
  inventoryDocs.forEach((inv: any) => {
    const lid = inv.listingId?.toString() || "";
    if (!calByListing[lid]) calByListing[lid] = [];
    calByListing[lid].push({
      date: inv.date,
      status: inv.status || "available",
      price: Number(inv.currentPrice || 0),
      minimumStay: Number(inv.minStay || 1),
      maximumStay: Number(inv.maxStay || 30),
    });
  });

  const initialDays: CalendarDay[] = calByListing[defaultPropertyId] || [];
  const allCalendars: Record<string, CalendarDay[]> = calByListing;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          {allReservations.length} bookings across {allProperties.length}{" "}
          properties
        </p>
      </div>

      <BookingsContent
        properties={allProperties as any}
        reservations={allReservations as any}
        initialDays={initialDays}
        defaultPropertyId={defaultPropertyId as any}
        allCalendars={allCalendars as any}
      />
    </div>
  );
}
