import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { MarketEvent } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    // Other optional params
    // const listingId = searchParams.get("listingId");
    // const dateFrom = searchParams.get("dateFrom");
    // const dateTo = searchParams.get("dateTo");

    if (!orgId) {
      return NextResponse.json({ events: [] }, { status: 200 });
    }

    await connectToDatabase();

    const todayStr = new Date().toISOString().split("T")[0];

    const events = await MarketEvent.find({
      orgId: new Types.ObjectId(orgId),
      isActive: true,
      endDate: { $gte: todayStr }
    }).sort({ startDate: 1 }).limit(100).lean();

    if (!events || events.length === 0) {
      // Provide fallback events for UI polish as done in Python backend
      return NextResponse.json({
        events: [
          {
            _id: "mock_1",
            name: "Dubai Food Festival 2026",
            startDate: "2026-04-25",
            endDate: "2026-05-10",
            impactLevel: "high",
            upliftPct: 15.0,
            description: "City-wide culinary celebration driving high demand for short-term rentals.",
            source: "market_template",
            area: "Dubai",
            isActive: true
          },
          {
            _id: "mock_2",
            name: "Eid Al Fitr Holidays",
            startDate: "2026-03-30",
            endDate: "2026-04-02",
            impactLevel: "high",
            upliftPct: 25.0,
            description: "Major public holiday with high regional travel and staycation demand.",
            source: "market_template",
            area: "Dubai",
            isActive: true
          }
        ]
      }, { status: 200 });
    }

    const formattedEvents = events.map((e: any) => ({
      _id: e._id.toString(),
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      impactLevel: e.impactLevel,
      upliftPct: Number(e.upliftPct || 0),
      description: e.description || "",
      source: e.source || "",
      area: e.area || null,
      isActive: e.isActive
    }));

    return NextResponse.json({ events: formattedEvents }, { status: 200 });
  } catch (err: any) {
    console.error("[api/events]", err);
    return NextResponse.json({ events: [] }, { status: 200 }); // Graceful fallback
  }
}
