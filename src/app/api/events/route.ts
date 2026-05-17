import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { MarketEvent } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ events: [] }, { status: 200 });
    }

    await connectToDatabase();

    const todayStr = new Date().toISOString().split("T")[0];
    const ninetyDaysDate = new Date();
    ninetyDaysDate.setDate(ninetyDaysDate.getDate() + 90);
    const ninetyDaysStr = ninetyDaysDate.toISOString().split("T")[0];

    const dateFrom = searchParams.get("dateFrom") || todayStr;
    const dateTo = searchParams.get("dateTo") || "";

    // Primary query: events overlapping the selected range
    const primaryEvents = await MarketEvent.find({
      orgId: new Types.ObjectId(orgId),
      isActive: true,
      startDate: dateTo ? { $lte: dateTo } : { $lte: dateFrom },
      endDate: { $gte: dateFrom },
    }).sort({ startDate: 1 }).limit(100).lean();

    // If no events in range, also look ahead 90 days from today
    const allEvents = primaryEvents.length > 0
      ? primaryEvents
      : await MarketEvent.find({
          orgId: new Types.ObjectId(orgId),
          isActive: true,
          startDate: { $gte: todayStr, $lte: ninetyDaysStr },
        }).sort({ startDate: 1 }).limit(50).lean();

    if (!allEvents || allEvents.length === 0) {
      return NextResponse.json({ events: [] }, { status: 200 });
    }

    const formattedEvents = allEvents.map((e: any) => ({
      _id: e._id.toString(),
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      impactLevel: e.impactLevel,
      upliftPct: Number(e.upliftPct || 0),
      description: e.description || "",
      source: e.source || "",
      sourceUrl: e.sourceUrl || null,
      venue: e.venue || null,
      category: e.category || null,
      area: e.area || null,
      isActive: e.isActive,
      updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : null,
      createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : null,
    }));

    return NextResponse.json({ events: formattedEvents }, { status: 200 });
  } catch (err: any) {
    console.error("[api/events]", err);
    return NextResponse.json({ events: [] }, { status: 200 }); // Graceful fallback
  }
}
