export type {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";

// Operational types removed - PriceOS is now a price intelligence layer

import type {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";

/**
 * PMSClient Interface
 * Abstracts property management system operations
 * Allows switching between mock and real Hostaway API
 */

export interface PMSClient {
  // Read operations (Data Aggregator)
  listListings(): Promise<Listing[]>;
  getListing(id: string | number): Promise<Listing>;
  getCalendar(
    id: string | number,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarDay[]>;
  getReservations(filters?: ReservationFilters): Promise<Reservation[]>;

  // Write operations (Channel Sync)
  updateCalendar(
    id: string | number,
    intervals: CalendarInterval[]
  ): Promise<UpdateResult>;
  verifyCalendar(
    id: string | number,
    dates: string[]
  ): Promise<VerificationResult>;

  getReservation(id: string | number): Promise<Reservation>;

  blockDates(
    id: string | number,
    startDate: string,
    endDate: string,
    reason: "owner_stay" | "maintenance" | "other"
  ): Promise<UpdateResult>;
  unblockDates(
    id: string | number,
    startDate: string,
    endDate: string
  ): Promise<UpdateResult>;

  updateListing(id: string | number, updates: Partial<Listing>): Promise<Listing>;

  // Reservations - create
  createReservation(reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">): Promise<Reservation>;

  // Operational methods removed - PriceOS is now a price intelligence layer
  // Methods for seasonal rules, conversations, tasks, expenses, and owner statements
  // have been deprecated as part of the architectural redesign

  // Utility
  getMode(): "mock" | "db" | "live";
}
