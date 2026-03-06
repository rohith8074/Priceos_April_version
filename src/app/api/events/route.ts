import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { marketEvents } from "@/lib/db/schema";
import { desc, eq, and, gte, lte, isNull, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const listingId = searchParams.get("listingId") ? Number(searchParams.get("listingId")) : null;
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");

        // Build filter conditions
        const conditions = [];
        if (listingId) {
            // Return records for this listing OR portfolio-level records (listingId IS NULL)
            conditions.push(or(eq(marketEvents.listingId, listingId), isNull(marketEvents.listingId)));
        }

        // RANGE OVERLAP: event overlaps if event.start <= queryEnd AND event.end >= queryStart
        if (dateFrom) conditions.push(gte(marketEvents.endDate, dateFrom));   // event ends after query starts
        if (dateTo) conditions.push(lte(marketEvents.startDate, dateTo));     // event starts before query ends

        const query = db
            .select()
            .from(marketEvents)
            .orderBy(desc(marketEvents.createdAt), desc(marketEvents.startDate))
            .limit(100);

        const events = conditions.length > 0
            ? await query.where(and(...conditions))
            : await query;

        console.log(`📡 [Events API] listingId=${listingId} range=${dateFrom}→${dateTo} → ${events.length} events returned`);

        return NextResponse.json({
            success: true,
            events
        });
    } catch (error) {
        console.error("API /api/events GET Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch market events." },
            { status: 500 }
        );
    }
}
