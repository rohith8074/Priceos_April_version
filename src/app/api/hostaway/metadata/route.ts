import { NextRequest, NextResponse } from "next/server";
import { fetchHostawayToken } from "@/lib/hostaway/token";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { verifyToken } from "@/lib/auth/jwt";

const HOSTAWAY_BASE = "https://api.hostaway.com/v1";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId")?.trim();
  const apiSecret = searchParams.get("apiSecret")?.trim();

  if (!accountId || !apiSecret) {
    return NextResponse.json(
      { error: "accountId and apiSecret are required" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Fetch OAuth token using provided credentials
    const tokenData = await fetchHostawayToken(accountId, apiSecret);
    const { access_token } = tokenData;

    // Step 2: Fetch listings from Hostaway to validate connectivity
    const listingsRes = await fetch(
      `${HOSTAWAY_BASE}/listings?limit=100&includeResources=0`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Cache-control": "no-cache",
          "Content-Type": "application/json",
        },
      }
    );

    if (!listingsRes.ok) {
      const errText = await listingsRes.text().catch(() => "");
      return NextResponse.json(
        {
          mode: "fallback_available",
          reason: `Connected to Hostaway but could not fetch listings: ${listingsRes.status} ${errText.slice(0, 200)}`,
          listings: [],
        },
        { status: 200 }
      );
    }

    const listingsJson = await listingsRes.json();
    const rawListings: any[] = Array.isArray(listingsJson.result)
      ? listingsJson.result
      : Array.isArray(listingsJson)
      ? listingsJson
      : [];

    const listings = rawListings.map((l: any) => ({
      id: String(l.id),
      name: l.name || "Unnamed Property",
      bedrooms: l.bedroomsNumber ?? l.bedrooms ?? 0,
      city: l.city || l.area || "",
      type: l.propertyType || l.listingType || "apartment",
      thumbnail: l.thumbnailUrl || null,
    }));

    // Step 3: Save credentials + token to Organization (if authenticated)
    try {
      const cookie = req.cookies.get("priceos-session")?.value;
      if (cookie) {
        const payload = verifyToken(cookie) as any;
        const orgId = payload?.orgId || payload?.sub;
        if (orgId) {
          await connectToDatabase();
          const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
          await Organization.findByIdAndUpdate(orgId, {
            hostawayApiKey: apiSecret,
            hostawayAccountId: accountId,
            hostawayToken: access_token,
            hostawayTokenExpiresAt: expiresAt,
          });
        }
      }
    } catch (saveErr) {
      // Non-fatal: credentials not saved, but connection succeeded
      console.warn("[hostaway/metadata] Could not save credentials:", saveErr);
    }

    return NextResponse.json({
      success: true,
      mode: "real",
      total: listings.length,
      listings,
    });
  } catch (err: any) {
    console.error("[hostaway/metadata] Error:", err.message);

    // Return fallback mode so wizard can offer demo listings
    return NextResponse.json(
      {
        mode: "fallback_available",
        reason: err.message || "Connection failed",
        listings: [],
      },
      { status: 200 }
    );
  }
}
