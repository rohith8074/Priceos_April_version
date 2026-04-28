import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const listingId = searchParams.get("listingId");
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }
    await connectToDatabase();
    
    // Stub implementation
    return NextResponse.json({
      metrics: {
        occupancy_rate: 65,
        avg_daily_rate: 150,
        revenue: 4500,
        days_booked: 20
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
