/**
 * dashboard/page.tsx — Server Component
 *
 * Fetches portfolio data from the FastAPI backend.
 * All MongoDB queries moved to priceos-backend; this page is pure UI + data fetch.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/jwt";
import { OverviewClient } from "./overview-client";

import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing, InventoryMaster, Reservation } from "@/lib/db/models";
import { Types } from "mongoose";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export default async function OverviewPage() {
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const plus29 = new Date(today);
  plus29.setDate(plus29.getDate() + 29);
  const plus29Str = plus29.toISOString().split("T")[0];
  
  const minus365 = new Date(today);
  minus365.setDate(minus365.getDate() - 365);
  const minus365Str = minus365.toISOString().split("T")[0];

  let allListings: any[] = [];
  let inventory: any[] = [];
  let reservations: any[] = [];

  try {
    await connectToDatabase();
    const orgOid = new Types.ObjectId(orgId);

    const [listingDocs, invDocs, resDocs] = await Promise.all([
      Listing.find({ orgId: orgOid }).lean(),
      InventoryMaster.find({
        orgId: orgOid,
        date: { $gte: todayStr, $lte: plus29Str }
      }).lean(),
      Reservation.find({ orgId: orgOid }).lean(),
    ]);

    allListings = listingDocs.map((ls: any) => ({
      id: ls._id.toString(),
      _id: ls._id.toString(),
      ...ls,
    }));

    inventory = invDocs.map((r: any) => ({
      id: r._id.toString(),
      _id: r._id.toString(),
      ...r,
      listingId: r.listingId?.toString(),
    }));

    reservations = resDocs.map((r: any) => ({
      id: r._id.toString(),
      _id: r._id.toString(),
      ...r,
      listingId: r.listingId?.toString(),
    }));
  } catch (err) {
    console.error("[OverviewPage] direct db query error", err);
  }

  // Compute per-listing metrics client-side from raw API data
  let totalPortfolioRevenue = 0;
  let totalOccupancySum = 0;
  let totalAvgPriceSum = 0;
  let activePropertiesCount = 0;

  const propertiesWithMetrics = allListings.map((listing: any) => {
    const listingId = listing.id ?? listing._id;

    const listingInv = inventory.filter((r) => (r.listingId ?? r.listing_id) === listingId);
    const bookedInv = listingInv.filter((r) => r.status === "booked" || r.status === "reserved");
    const bookedDays = bookedInv.length;
    const totalDays = listingInv.length;
    const occupancy = totalDays > 0 ? Math.round((bookedDays / totalDays) * 100) : 0;

    // ADR from actual Hostaway-synced reservations (totalPrice / nights per booking)
    const listingReservations = reservations.filter(
      (r) => (r.listingId ?? r.listing_id) === listingId && r.status !== "cancelled"
    );
    const adrEntries = listingReservations
      .filter((r) => Number(r.totalPrice) > 0 && Number(r.nights) > 0)
      .map((r) => Number(r.totalPrice) / Number(r.nights));
    const avgPrice = adrEntries.length > 0
      ? Math.round(adrEntries.reduce((a, b) => a + b, 0) / adrEntries.length)
      : Number(listing.price ?? 0);

    // Revenue = sum of all confirmed reservation payouts (historical + upcoming)
    const revenue = listingReservations.reduce((sum, r) => sum + Number(r.totalPrice ?? 0), 0);

    totalPortfolioRevenue += revenue;
    if (occupancy > 0) {
      totalOccupancySum += occupancy;
      totalAvgPriceSum += avgPrice;
      activePropertiesCount++;
    }

    const calendarDays = listingInv.map((r) => ({
      date: r.date,
      status: r.status,
      price: Number(r.proposedPrice ?? r.currentPrice ?? 0),
      minimumStay: Number(r.minStay ?? 1),
      maximumStay: Number(r.maxStay ?? 30),
    }));

    const listingRes = reservations
      .filter((r) => (r.listingId ?? r.listing_id) === listingId)
      .map((r) => ({
        title: r.guestName ?? "Guest",
        email: r.guestEmail,
        startDate: r.checkIn,
        endDate: r.checkOut,
        financials: {
          totalPrice: Number(r.totalPrice ?? 0),
          pricePerNight: r.nights > 0 ? Math.round(Number(r.totalPrice) / r.nights) : Number(r.totalPrice),
          channelName: r.channelName,
          reservationStatus: r.status,
        },
      }));

    return {
      id: listingId,
      name: listing.name,
      area: listing.area,
      bedroomsNumber: listing.bedroomsNumber,
      price: listing.price,
      occupancy,
      avgPrice,
      revenue,
      calendarDays,
      reservations: listingRes,
    };
  });

  const avgPortfolioOccupancy = activePropertiesCount > 0 ? Math.round(totalOccupancySum / activePropertiesCount) : 0;
  const avgPortfolioPrice = activePropertiesCount > 0 ? Math.round(totalAvgPriceSum / activePropertiesCount) : 0;

  return (
    <OverviewClient
      orgId={orgId}
      properties={propertiesWithMetrics}
      totalProperties={allListings.length}
      avgPortfolioOccupancy={avgPortfolioOccupancy}
      avgPortfolioPrice={avgPortfolioPrice}
      totalPortfolioRevenue={totalPortfolioRevenue}
      totalHistoricalRevenue={totalPortfolioRevenue}
    />
  );
}
