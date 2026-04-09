/**
 * MongoDB-backed PMS Client
 * Replaces the old Drizzle/Neon implementation.
 *
 * IMPORTANT: This client is READ-ONLY with regard to Hostaway.
 * It reads data synced from Hostaway into MongoDB.
 * Calendar writes update local MongoDB only — never POST to Hostaway.
 */

import { PMSClient } from "./types";
import {
  Listing as ListingType,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";
import { connectDB, Listing, InventoryMaster, Reservation as ReservationModel } from "@/lib/db";
import { format, eachDayOfInterval, parseISO } from "date-fns";

function mapListing(row: Record<string, unknown>): ListingType {
  const r = row as Record<string, unknown>;
  return {
    id: String(r._id || r.id),
    name: r.name as string,
    city: (r.city as string) || "",
    countryCode: (r.countryCode as string) || "",
    area: (r.area as string) || "",
    bedroomsNumber: (r.bedroomsNumber as number) || 0,
    bathroomsNumber: (r.bathroomsNumber as number) || 1,
    propertyTypeId: (r.propertyTypeId as number) ?? undefined,
    price: Number(r.price),
    priceFloor: Number(r.priceFloor),
    priceCeiling: Number(r.priceCeiling),
    currencyCode: ((r.currencyCode as string) || "AED") as "AED" | "USD",
    personCapacity: (r.personCapacity as number) ?? undefined,
    amenities: ((r.amenities as string[]) ?? []),
  };
}

function mapCalendarDay(row: Record<string, unknown>): CalendarDay {
  return {
    date: row.date as string,
    status: (row.status as CalendarDay["status"]) || "available",
    price: Number(row.currentPrice),
    minimumStay: (row.minStay as number) ?? 1,
    maximumStay: (row.maxStay as number) ?? 30,
  };
}

function mapReservation(row: Record<string, unknown>): Reservation {
  return {
    id: String(row._id || row.id),
    listingMapId: String(row.listingId),
    guestName: (row.guestName as string) || "Unknown",
    guestEmail: (row.guestEmail as string) ?? undefined,
    channelName: ((row.channelName as string) || "Other") as Reservation["channelName"],
    arrivalDate: row.checkIn as string,
    departureDate: row.checkOut as string,
    nights: (row.nights as number) || 1,
    totalPrice: Number(row.totalPrice || 0),
    pricePerNight: Number(row.totalPrice || 0) / ((row.nights as number) || 1),
    status: ((row.status as string) || "confirmed") as Reservation["status"],
    createdAt: new Date(row.createdAt as string).toISOString(),
    checkInTime: undefined,
    checkOutTime: undefined,
  };
}

export class DbPMSClient implements PMSClient {
  private mode = "db" as const;
  getMode() { return this.mode; }

  async listListings(): Promise<ListingType[]> {
    await connectDB();
    const rows = await Listing.find({ isActive: true }).lean();
    return (rows as unknown as Record<string, unknown>[]).map(mapListing);
  }

  async getListing(id: string | number): Promise<ListingType> {
    await connectDB();
    const row = await Listing.findById(String(id)).lean();
    if (!row) throw new Error(`Listing ${id} not found`);
    return mapListing(row as unknown as Record<string, unknown>);
  }

  async updateListing(id: string | number, updates: Partial<ListingType>): Promise<ListingType> {
    await connectDB();
    const allowed: Record<string, unknown> = {};
    if (updates.name !== undefined) allowed.name = updates.name;
    if (updates.price !== undefined) allowed.price = updates.price;
    if (updates.bedroomsNumber !== undefined) allowed.bedroomsNumber = updates.bedroomsNumber;
    if (updates.bathroomsNumber !== undefined) allowed.bathroomsNumber = updates.bathroomsNumber;
    if (updates.personCapacity !== undefined) allowed.personCapacity = updates.personCapacity;
    if (updates.amenities !== undefined) allowed.amenities = updates.amenities;

    if (Object.keys(allowed).length > 0) {
      await Listing.findByIdAndUpdate(String(id), { $set: allowed });
    }
    return this.getListing(id);
  }

  async getCalendar(id: string | number, startDate: Date, endDate: Date): Promise<CalendarDay[]> {
    await connectDB();
    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");

    const rows = await InventoryMaster.find({
      listingId: String(id),
      date: { $gte: startStr, $lte: endStr },
    }).lean();

    return rows.map((r) => mapCalendarDay(r as unknown as Record<string, unknown>));
  }

  async updateCalendar(id: string | number, intervals: CalendarInterval[]): Promise<UpdateResult> {
    await connectDB();
    let updatedCount = 0;

    for (const interval of intervals) {
      const days = eachDayOfInterval({
        start: parseISO(interval.startDate),
        end: parseISO(interval.endDate),
      });
      for (const day of days) {
        const dateStr = format(day, "yyyy-MM-dd");
        // Local update only — never POST to Hostaway
        await InventoryMaster.findOneAndUpdate(
          { listingId: String(id), date: dateStr },
          { $set: { currentPrice: interval.price } }
        );
        updatedCount++;
      }
    }
    return { success: true, updatedCount };
  }

  async verifyCalendar(id: string | number, dates: string[]): Promise<VerificationResult> {
    await connectDB();
    const found = await InventoryMaster.find({
      listingId: String(id),
      date: { $in: dates },
    }).countDocuments();
    return { matches: found === dates.length, totalDates: dates.length, matchedDates: found };
  }

  async blockDates(id: string | number, startDate: string, endDate: string): Promise<UpdateResult> {
    await connectDB();
    const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    let updatedCount = 0;
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      await InventoryMaster.findOneAndUpdate(
        { listingId: String(id), date: dateStr },
        { $set: { status: "blocked", currentPrice: 0 } }
      );
      updatedCount++;
    }
    return { success: true, updatedCount };
  }

  async unblockDates(id: string | number, startDate: string, endDate: string): Promise<UpdateResult> {
    await connectDB();
    const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    let updatedCount = 0;
    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      await InventoryMaster.findOneAndUpdate(
        { listingId: String(id), date: dateStr },
        { $set: { status: "available" } }
      );
      updatedCount++;
    }
    return { success: true, updatedCount };
  }

  async getReservations(filters?: ReservationFilters): Promise<Reservation[]> {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (filters?.listingMapId) query.listingId = String(filters.listingMapId);
    if (filters?.startDate) query.checkIn = { $gte: format(filters.startDate, "yyyy-MM-dd") };
    if (filters?.endDate) query.checkOut = { $lte: format(filters.endDate, "yyyy-MM-dd") };
    if (filters?.status) query.status = filters.status;

    let q = ReservationModel.find(query).sort({ checkIn: -1 });
    if (filters?.limit) q = q.limit(filters.limit);

    const rows = await q.lean();
    let result = rows.map((r) => mapReservation(r as unknown as Record<string, unknown>));

    if (filters?.channelName) result = result.filter((r) => r.channelName === filters.channelName);
    if (filters?.offset) result = result.slice(filters.offset);

    return result;
  }

  async getReservation(id: string | number): Promise<Reservation> {
    await connectDB();
    const row = await ReservationModel.findById(String(id)).lean();
    if (!row) throw new Error(`Reservation ${id} not found`);
    return mapReservation(row as unknown as Record<string, unknown>);
  }

  async createReservation(reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">): Promise<Reservation> {
    await connectDB();
    const doc = await ReservationModel.create({
      listingId: String(reservation.listingMapId),
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      checkIn: reservation.arrivalDate,
      checkOut: reservation.departureDate,
      nights: reservation.nights,
      totalPrice: reservation.totalPrice,
      channelName: reservation.channelName,
      status: reservation.status || "confirmed",
    });
    return mapReservation(doc.toObject() as unknown as Record<string, unknown>);
  }
}
