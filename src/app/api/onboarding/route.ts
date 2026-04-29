import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { Listing } from "@/lib/db/models/Listing";
import { verifyToken, signToken } from "@/lib/auth/jwt";
import { Types } from "mongoose";

function getOrgIdFromRequest(req: NextRequest): string | null {
  const cookie = req.cookies.get("priceos-session")?.value;
  if (!cookie) return null;
  const payload = verifyToken(cookie) as any;
  return payload?.orgId || payload?.sub || null;
}

/** GET /api/onboarding — return current onboarding state */
export async function GET(req: NextRequest) {
  const orgId = getOrgIdFromRequest(req);
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const org = await Organization.findById(orgId)
      .select("onboarding marketCode")
      .lean() as any;

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      step: org.onboarding?.step || "connect",
      selectedListingIds: org.onboarding?.selectedListingIds || [],
      activatedListingIds: org.onboarding?.activatedListingIds || [],
      listings: org.onboarding?.listings || [],
      marketCode: org.marketCode || "UAE_DXB",
    });
  } catch (err: any) {
    console.error("[api/onboarding] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/onboarding — save onboarding progress, re-issue JWT */
export async function PATCH(req: NextRequest) {
  const orgId = getOrgIdFromRequest(req);
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      step,
      selectedListingIds,
      activatedListingIds,
      listings,
      marketCode,
    } = body;

    await connectToDatabase();

    const updateFields: Record<string, any> = {};
    if (step) updateFields["onboarding.step"] = step;
    if (selectedListingIds) updateFields["onboarding.selectedListingIds"] = selectedListingIds;
    if (activatedListingIds) updateFields["onboarding.activatedListingIds"] = activatedListingIds;
    if (listings) updateFields["onboarding.listings"] = listings;
    if (marketCode) updateFields.marketCode = marketCode;
    if (step === "complete") {
      updateFields["onboarding.completedAt"] = new Date();
    }

    const org = await Organization.findByIdAndUpdate(
      orgId,
      { $set: updateFields },
      { returnDocument: "after" }
    ).lean() as any;

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Seed REAL listings to DB when onboarding completes (skip demo-* listings)
    if (step === "complete" && Array.isArray(listings) && listings.length > 0) {
      const orgOid = new Types.ObjectId(orgId);
      const realListings = listings.filter(
        (l) => l.id && !String(l.id).startsWith("demo-")
      );

      if (realListings.length > 0) {
        const realIds = realListings.map((l) => String(l.id));

        // Upsert real listings
        for (const l of realListings) {
          const hostawayId = String(l.id);
          await Listing.findOneAndUpdate(
            { hostawayId },
            {
              $set: {
                orgId: orgOid,
                hostawayId,
                name: l.name || "Unnamed Property",
                city: l.city || "",
                area: l.city || "",
                bedroomsNumber: l.bedrooms ?? 1,
                price: 500,
                currencyCode: org.currency || "AED",
                isActive: Array.isArray(activatedListingIds) && activatedListingIds.includes(l.id),
              },
            },
            { upsert: true, returnDocument: "after" }
          );
        }

        // Remove stale listings for this org not in the real Hostaway set
        await Listing.deleteMany({
          orgId: orgOid,
          $or: [
            { hostawayId: { $nin: realIds } },
            { hostawayId: { $exists: false } },
            { hostawayId: "" },
          ],
        });
      }
    }

    // Issue a new JWT reflecting the updated onboarding step
    const newStep = org.onboarding?.step || step || "connect";
    const tokenPayload = {
      sub: orgId,
      email: org.email,
      orgId,
      role: org.role || "owner",
      isApproved: org.isApproved !== false,
      onboardingStep: newStep,
    };

    const accessToken = signToken(tokenPayload, "7d");
    const refreshToken = signToken(tokenPayload, "30d");

    await Organization.findByIdAndUpdate(orgId, { refreshToken });

    const response = NextResponse.json({ ok: true, step: newStep, accessToken });

    response.cookies.set("priceos-session", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    response.cookies.set("priceos-refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err: any) {
    console.error("[api/onboarding] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
