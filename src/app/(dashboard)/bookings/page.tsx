export const dynamic = "force-dynamic";

import { createPMSClient } from "@/lib/pms";
import { BookingsContent } from "./bookings-content";
import type { CalendarDay } from "@/types/hostaway";

export default async function BookingsPage() {
  const pms = createPMSClient();

  const [allProperties, allReservations] = await Promise.all([
    pms.listListings(),
    pms.getReservations(),
  ]);

  // Fetch 30-day calendars for all properties (for calendar view)
  const today = new Date();
  const endDate30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endDate90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const defaultPropertyId = Number(allProperties[0]?.id ?? 0);

  let initialDays: CalendarDay[] = [];
  if (defaultPropertyId) {
    initialDays = await pms.getCalendar(defaultPropertyId, today, endDate90);
  }

  const allCalendarsEntries = await Promise.all(
    allProperties.map(async (p) => {
      const cal = await pms.getCalendar(Number(p.id), today, endDate30);
      return [Number(p.id), cal] as [number, CalendarDay[]];
    })
  );
  const allCalendars: Record<number, CalendarDay[]> =
    Object.fromEntries(allCalendarsEntries);

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
        properties={allProperties}
        reservations={allReservations}
        initialDays={initialDays}
        defaultPropertyId={defaultPropertyId}
        allCalendars={allCalendars}
      />
    </div>
  );
}
