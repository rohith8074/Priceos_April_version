import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { BenchmarkData } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!listingId || !Types.ObjectId.isValid(listingId)) {
      return NextResponse.json({ success: true, hasData: false, summary: null, comps: [] });
    }

    await connectToDatabase();

    const query: any = { listingId: new Types.ObjectId(listingId) };
    if (dateFrom) query.dateFrom = { $lte: dateTo ?? dateFrom };
    if (dateTo) query.dateTo = { $gte: dateFrom ?? dateTo };

    const doc = await BenchmarkData.findOne(query)
      .sort({ updatedAt: -1 })
      .lean() as any;

    if (!doc) {
      return NextResponse.json({ success: true, hasData: false, summary: null, comps: [] });
    }

    const summary = {
      id: 0,
      listingId: 0,
      dateFrom: doc.dateFrom,
      dateTo: doc.dateTo,
      p25Rate: doc.p25Rate != null ? String(doc.p25Rate) : null,
      p50Rate: doc.p50Rate != null ? String(doc.p50Rate) : null,
      p75Rate: doc.p75Rate != null ? String(doc.p75Rate) : null,
      p90Rate: doc.p90Rate != null ? String(doc.p90Rate) : null,
      avgWeekday: doc.avgWeekday != null ? String(doc.avgWeekday) : null,
      avgWeekend: doc.avgWeekend != null ? String(doc.avgWeekend) : null,
      yourPrice: doc.yourPrice != null ? String(doc.yourPrice) : null,
      percentile: doc.percentile ?? null,
      verdict: doc.verdict ?? null,
      rateTrend: doc.rateTrend ?? null,
      trendPct: doc.trendPct != null ? String(doc.trendPct) : null,
      recommendedWeekday: doc.recommendedWeekday != null ? String(doc.recommendedWeekday) : null,
      recommendedWeekend: doc.recommendedWeekend != null ? String(doc.recommendedWeekend) : null,
      recommendedEvent: doc.recommendedEvent != null ? String(doc.recommendedEvent) : null,
      reasoning: doc.reasoning ?? null,
    };

    const comps = (doc.comps || []).map((c: any) => ({
      name: c.name,
      source: c.source,
      sourceUrl: c.sourceUrl ?? null,
      rating: c.rating ?? null,
      reviews: c.reviews ?? null,
      avgRate: Number(c.avgRate),
      weekdayRate: c.weekdayRate ?? null,
      weekendRate: c.weekendRate ?? null,
      minRate: c.minRate ?? null,
      maxRate: c.maxRate ?? null,
    }));

    return NextResponse.json({ success: true, hasData: true, summary, comps });
  } catch (err: any) {
    console.error("[GET /api/benchmark]", err);
    return NextResponse.json({ success: true, hasData: false, summary: null, comps: [] });
  }
}
