import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { MarketTemplate } from "@/lib/db/models/MarketTemplate";

export async function GET() {
  try {
    await connectToDatabase();

    const dbMarkets = await MarketTemplate.find({ isActive: true }).sort({ displayName: 1 }).lean();

    if (dbMarkets && dbMarkets.length > 0) {
      return NextResponse.json({
        success: true,
        markets: dbMarkets.map((m: any) => ({
          code: m.marketCode,
          name: m.displayName,
          country: m.country,
          currency: m.currency,
          timezone: m.timezone,
          weekend: m.weekendDefinition,
          flag: m.flag,
        })),
      });
    }

    // Hardcoded fallback matching Python implementation
    return NextResponse.json({
      success: true,
      markets: [
        { code: "UAE_DXB", name: "Dubai", country: "UAE", currency: "AED", timezone: "Asia/Dubai", weekend: "fri_sat", flag: "🇦🇪" },
        { code: "GBR_LON", name: "London", country: "UK", currency: "GBP", timezone: "Europe/London", weekend: "sat_sun", flag: "🇬🇧" },
        { code: "USA_NYC", name: "New York", country: "USA", currency: "USD", timezone: "America/New_York", weekend: "sat_sun", flag: "🇺🇸" },
      ],
    });
  } catch (error) {
    console.error("Failed to fetch markets:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
