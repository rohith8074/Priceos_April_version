import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { AirbticsCache } from "@/lib/db/models";

function buildDateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  const cur = new Date(start);
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const marketId = searchParams.get("marketId") || "2286";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ pacing: [] });
    }

    const days = buildDateRange(dateFrom, dateTo);
    const keys = days.map((d) => `demand_calendar:${marketId}:${d}`);

    await connectToDatabase();

    const docs = await AirbticsCache.find({
      cacheKey: { $in: keys },
      expiresAt: { $gt: new Date() },
    }).lean() as any[];

    const docMap: Record<string, any> = {};
    for (const doc of docs) {
      docMap[doc.cacheKey] = doc.data;
    }

    const pacing = days.map((day) => {
      const key = `demand_calendar:${marketId}:${day}`;
      const data = docMap[key];
      if (data) {
        return {
          date: day,
          demandScore: data.demandScore ?? null,
          avgPrice: data.avgPrice ?? null,
          pacing: data.pacing ?? null,
          demandTier: data.demandTier ?? "low",
          dayOfWeek: data.dayOfWeek ?? "",
          isWeekend: data.isWeekend ?? false,
        };
      }
      return {
        date: day,
        demandScore: null,
        avgPrice: null,
        pacing: null,
        demandTier: "unknown",
        dayOfWeek: "",
        isWeekend: false,
      };
    });

    return NextResponse.json({ pacing });
  } catch (err: any) {
    console.error("[GET /api/agent-tools/demand-pacing]", err);
    return NextResponse.json({ pacing: [] });
  }
}
