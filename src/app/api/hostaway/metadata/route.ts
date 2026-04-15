/**
 * GET /api/hostaway/metadata
 * 
 * Step 1 of Onboarding Wizard.
 * Validates the Hostaway API key and returns ONLY listing metadata
 * (id, name, bedrooms, location). No pricing, calendar, or reservation data.
 * This is the "Slim Fetch" — minimizes Hostaway API quota usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { connectDB, Organization } from "@/lib/db";

// Hostaway "slim" fields — only what we need for the property selector
const SLIM_FIELDS = ["id", "name", "bedroomsNumber", "city", "listingType", "thumbnailUrl"];

const DEMO_LISTINGS = [
  { id: "demo-1", name: "Luxury Marina View Suite",         bedrooms: 2, city: "Dubai Marina",      type: "apartment",  thumbnail: null, source: "demo" },
  { id: "demo-2", name: "Downtown Burj Khalifa Studio",     bedrooms: 1, city: "Downtown Dubai",    type: "studio",     thumbnail: null, source: "demo" },
  { id: "demo-3", name: "JBR Beachfront 3BR Villa",         bedrooms: 3, city: "JBR",               type: "villa",      thumbnail: null, source: "demo" },
  { id: "demo-4", name: "Palm Jumeirah Signature Villa",    bedrooms: 5, city: "Palm Jumeirah",     type: "villa",      thumbnail: null, source: "demo" },
  { id: "demo-5", name: "Business Bay Executive Studio",    bedrooms: 1, city: "Business Bay",      type: "studio",     thumbnail: null, source: "demo" },
  { id: "demo-6", name: "Dubai Hills Garden Apartment",     bedrooms: 2, city: "Dubai Hills",       type: "apartment",  thumbnail: null, source: "demo" },
  { id: "demo-7", name: "DIFC Premium 1BR Apartment",       bedrooms: 1, city: "DIFC",              type: "apartment",  thumbnail: null, source: "demo" },
  { id: "demo-8", name: "Meydan Racecourse View Penthouse", bedrooms: 4, city: "Meydan",            type: "penthouse",  thumbnail: null, source: "demo" },
];

function mapHostawayStatusToReasonCode(status: number) {
  if (status === 401) return "HOSTAWAY_UNAUTHORIZED";
  if (status === 403) return "HOSTAWAY_AUTH_DENIED";
  if (status === 429) return "HOSTAWAY_RATE_LIMITED";
  if (status >= 500) return "HOSTAWAY_UPSTREAM_ERROR";
  return "HOSTAWAY_REQUEST_FAILED";
}

export async function GET(req: NextRequest) {
  try {
    // 1. Auth check
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // 2. Get API key — either from query param (first-time entry) or stored org
    await connectDB();
    const org = await Organization.findById(payload.orgId).lean();
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const inputApiKey = req.nextUrl.searchParams.get("apiKey")?.trim() || "";
    const apiKey = inputApiKey || org.hostawayApiKey;
    if (!apiKey) {
      return NextResponse.json({ error: "No Hostaway API key provided" }, { status: 400 });
    }

    // 3. Slim fetch from Hostaway — only listing metadata
    console.log("[Hostaway/Metadata] Fetching listing metadata for org:", payload.orgId);

    const haRes = await fetch(
      "https://api.hostaway.com/v1/listings?includeResources=false&limit=50",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );

    if (!haRes.ok) {
      const errText = await haRes.text();
      console.error("[Hostaway/Metadata] API error:", haRes.status, errText);
      console.log("[Hostaway/Metadata] Returning explicit fallback response.");

      return NextResponse.json(
        {
          success: false,
          mode: "fallback_available",
          fallbackUsed: true,
          reasonCode: mapHostawayStatusToReasonCode(haRes.status),
          reason: `Hostaway authorization failed (${haRes.status}).`,
          canRetry: true,
          message: "Real connection failed. You can continue with demo data.",
          total: DEMO_LISTINGS.length,
          listings: DEMO_LISTINGS,
        },
        { status: 200 }
      );
    }

    const data = await haRes.json();
    const rawListings = data.result ?? data.listings ?? data ?? [];

    // 4. Project to slim fields only
    const listings = rawListings.map((l: Record<string, unknown>) => {
      const address = l.address as Record<string, unknown> | undefined;
      return {
        id: String(l.id ?? l.listingId ?? ""),
        name: String(l.name ?? l.internalListingName ?? "Unnamed Property"),
        bedrooms: Number(l.bedroomsNumber ?? l.bedrooms ?? 0),
        city: String(l.city ?? address?.city ?? ""),
        type: String(l.listingType ?? "apartment"),
        thumbnail: (l.thumbnailUrl as string) ?? null,
        source: "hostaway",
      };
    });

    // 5. Save to org only when real validation succeeds
    if (inputApiKey && inputApiKey !== org.hostawayApiKey) {
      await Organization.findByIdAndUpdate(payload.orgId, {
        $set: {
          hostawayApiKey: inputApiKey,
          "onboarding.step": "select",
        },
      });
    }

    console.log(`[Hostaway/Metadata] Fetched ${listings.length} listings for org: ${payload.orgId}`);

    return NextResponse.json({
      success: true,
      mode: "real",
      fallbackUsed: false,
      message: "Connected to Hostaway. Real listings fetched.",
      listings,
      total: listings.length,
    });
  } catch (e: unknown) {
    console.error("[Hostaway/Metadata] Error:", e);
    return NextResponse.json(
      {
        success: false,
        mode: "error",
        fallbackUsed: false,
        reasonCode: "INTERNAL_ERROR",
        reason: "Unable to process request.",
        canRetry: true,
        message: "Please try again.",
      },
      { status: 500 }
    );
  }
}
