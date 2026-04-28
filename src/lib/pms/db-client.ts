/**
 * "DB" PMS Client (standalone-safe)
 *
 * This frontend package previously contained a Mongo/Mongoose-backed implementation.
 * To make this codebase independent (no hidden dependency on another repo's models),
 * we provide a stable implementation that delegates to `MockPMSClient`.
 *
 * Later, this can be upgraded to:
 * - call the backend REST API, or
 * - talk directly to Postgres via Drizzle/Neon
 * without leaking cross-repo symbols into the frontend build.
 */

import type { PMSClient } from "./types";
import { MockPMSClient } from "./mock-client";
import type {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";

export class DbPMSClient implements PMSClient {
  private readonly mode = "db" as const;
  private readonly delegate = new MockPMSClient();

  getMode() {
    return this.mode;
  }

  listListings(): Promise<Listing[]> {
    return this.delegate.listListings();
  }

  getListing(id: string | number): Promise<Listing> {
    return this.delegate.getListing(id);
  }

  updateListing(id: string | number, updates: Partial<Listing>): Promise<Listing> {
    return this.delegate.updateListing(id, updates);
  }

  getCalendar(id: string | number, startDate: Date, endDate: Date): Promise<CalendarDay[]> {
    return this.delegate.getCalendar(id, startDate, endDate);
  }

  updateCalendar(id: string | number, intervals: CalendarInterval[]): Promise<UpdateResult> {
    return this.delegate.updateCalendar(id, intervals);
  }

  verifyCalendar(id: string | number, dates: string[]): Promise<VerificationResult> {
    return this.delegate.verifyCalendar(id, dates);
  }

  blockDates(id: string | number, startDate: string, endDate: string): Promise<UpdateResult> {
    return this.delegate.blockDates(id, startDate, endDate, "other");
  }

  unblockDates(id: string | number, startDate: string, endDate: string): Promise<UpdateResult> {
    return this.delegate.unblockDates(id, startDate, endDate);
  }

  getReservations(filters?: ReservationFilters): Promise<Reservation[]> {
    return this.delegate.getReservations(filters);
  }

  getReservation(id: string | number): Promise<Reservation> {
    return this.delegate.getReservation(id);
  }

  createReservation(
    reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">
  ): Promise<Reservation> {
    return this.delegate.createReservation(reservation);
  }
}
