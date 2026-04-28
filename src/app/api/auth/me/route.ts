import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/db/models/User";
import { Organization } from "@/lib/db/models/Organization";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = verifyToken(token) as any;
    if (!payload || !payload.sub) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    await connectToDatabase();

    const sub = payload.sub as string;
    const isObjectId = /^[a-f0-9]{24}$/.test(sub);

    let subject: any = null;
    let orgId: string | undefined;

    // Try ObjectId lookup across both collections
    if (isObjectId) {
      subject = await User.findById(sub).lean();
      if (!subject) {
        subject = await Organization.findById(sub).lean();
        if (subject) orgId = subject._id.toString();
      } else {
        orgId = subject.orgId?.toString();
      }
    }

    // Fallback: email lookup
    if (!subject) {
      const email = payload.email || sub;
      subject = await User.findOne({ email }).lean();
      if (!subject) {
        subject = await Organization.findOne({ email }).lean();
        if (subject) orgId = subject._id.toString();
      } else {
        orgId = subject.orgId?.toString();
      }
    }

    if (!subject) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If subject is a User, resolve their org
    let organization: any = null;
    const resolvedOrgId = payload.orgId || orgId;
    if (resolvedOrgId) {
      organization = await Organization.findById(resolvedOrgId).lean();
    }

    return NextResponse.json({
      user: {
        id: subject._id.toString(),
        email: subject.email,
        name: subject.name || subject.fullName || subject.email,
        role: subject.role || "owner",
        orgId: resolvedOrgId,
        isApproved: subject.isApproved !== false,
        onboardingStep: subject.onboarding?.step || subject.onboardingStep || "complete",
      },
      organization: organization ? {
        id: organization._id.toString(),
        name: organization.name,
        marketCode: organization.marketCode,
        currency: organization.currency,
        plan: organization.plan,
        systemState: organization.systemState,
      } : null,
    });
  } catch (err) {
    console.error("[auth/me]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
