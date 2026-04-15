import { NextResponse } from "next/server";
import { connectDB, MarketTemplate } from "@/lib/db";

export const dynamic = "force-dynamic";

const FALLBACK_MARKETS = [
    { code: "UAE_DXB", name: "Dubai", country: "UAE", currency: "AED", timezone: "Asia/Dubai", weekend: "fri_sat", flag: "🇦🇪" },
    { code: "UAE_AUH", name: "Abu Dhabi", country: "UAE", currency: "AED", timezone: "Asia/Dubai", weekend: "fri_sat", flag: "🇦🇪" },
    { code: "ESP_BCN", name: "Barcelona", country: "Spain", currency: "EUR", timezone: "Europe/Madrid", weekend: "sat_sun", flag: "🇪🇸" },
    { code: "ESP_MAD", name: "Madrid", country: "Spain", currency: "EUR", timezone: "Europe/Madrid", weekend: "sat_sun", flag: "🇪🇸" },
    { code: "GBR_LON", name: "London", country: "UK", currency: "GBP", timezone: "Europe/London", weekend: "sat_sun", flag: "🇬🇧" },
    { code: "FRA_PAR", name: "Paris", country: "France", currency: "EUR", timezone: "Europe/Paris", weekend: "sat_sun", flag: "🇫🇷" },
    { code: "ITA_ROM", name: "Rome", country: "Italy", currency: "EUR", timezone: "Europe/Rome", weekend: "sat_sun", flag: "🇮🇹" },
    { code: "USA_NYC", name: "New York", country: "USA", currency: "USD", timezone: "America/New_York", weekend: "sat_sun", flag: "🇺🇸" },
    { code: "USA_MIA", name: "Miami", country: "USA", currency: "USD", timezone: "America/New_York", weekend: "sat_sun", flag: "🇺🇸" },
    { code: "USA_LAX", name: "Los Angeles", country: "USA", currency: "USD", timezone: "America/Los_Angeles", weekend: "sat_sun", flag: "🇺🇸" },
    { code: "PRT_LIS", name: "Lisbon", country: "Portugal", currency: "EUR", timezone: "Europe/Lisbon", weekend: "sat_sun", flag: "🇵🇹" },
    { code: "GRC_ATH", name: "Athens", country: "Greece", currency: "EUR", timezone: "Europe/Athens", weekend: "sat_sun", flag: "🇬🇷" },
    { code: "THA_BKK", name: "Bangkok", country: "Thailand", currency: "THB", timezone: "Asia/Bangkok", weekend: "sat_sun", flag: "🇹🇭" },
    { code: "IDN_BAL", name: "Bali", country: "Indonesia", currency: "IDR", timezone: "Asia/Makassar", weekend: "sat_sun", flag: "🇮🇩" },
    { code: "AUS_SYD", name: "Sydney", country: "Australia", currency: "AUD", timezone: "Australia/Sydney", weekend: "sat_sun", flag: "🇦🇺" },
    { code: "JPN_TYO", name: "Tokyo", country: "Japan", currency: "JPY", timezone: "Asia/Tokyo", weekend: "sat_sun", flag: "🇯🇵" },
    { code: "SGP_SIN", name: "Singapore", country: "Singapore", currency: "SGD", timezone: "Asia/Singapore", weekend: "sat_sun", flag: "🇸🇬" },
    { code: "IND_GOA", name: "Goa", country: "India", currency: "INR", timezone: "Asia/Kolkata", weekend: "sat_sun", flag: "🇮🇳" },
    { code: "IND_MUM", name: "Mumbai", country: "India", currency: "INR", timezone: "Asia/Kolkata", weekend: "sat_sun", flag: "🇮🇳" },
    { code: "ZAF_CPT", name: "Cape Town", country: "South Africa", currency: "ZAR", timezone: "Africa/Johannesburg", weekend: "sat_sun", flag: "🇿🇦" },
    { code: "MEX_CUN", name: "Cancún", country: "Mexico", currency: "MXN", timezone: "America/Cancun", weekend: "sat_sun", flag: "🇲🇽" },
    { code: "BRA_RIO", name: "Rio de Janeiro", country: "Brazil", currency: "BRL", timezone: "America/Sao_Paulo", weekend: "sat_sun", flag: "🇧🇷" },
];

export async function GET() {
    try {
        await connectDB();

        const dbMarkets = await MarketTemplate.find({ isActive: true })
            .select("marketCode displayName country currency timezone weekendDefinition flag")
            .sort({ displayName: 1 })
            .lean();

        if (dbMarkets.length > 0) {
            return NextResponse.json({
                success: true,
                markets: dbMarkets.map((m) => ({
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

        return NextResponse.json({
            success: true,
            markets: FALLBACK_MARKETS,
        });
    } catch (error) {
        console.error("[Markets GET]", error);
        return NextResponse.json({
            success: true,
            markets: FALLBACK_MARKETS,
        });
    }
}
