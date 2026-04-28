import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/db/models/User";
import { Organization } from "@/lib/db/models/Organization";
import { signToken } from "@/lib/auth/jwt";

/**
 * Login endpoint — mirrors the Python backend's find_auth_subject_by_email logic:
 * 1. Search the `users` collection first
 * 2. If not found, search the `organizations` collection (most accounts live here)
 * This is required for backwards compatibility with existing accounts.
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // --- Step 1: Try User collection ---
    let subjectType: "user" | "org" = "user";
    let subject: any = await User.findOne({ email: normalizedEmail }).lean();
    let subjectDoc: any = null;

    // --- Step 2: Fall back to Organization collection (most accounts) ---
    if (!subject) {
      subjectType = "org";
      subject = await Organization.findOne({ email: normalizedEmail }).lean();
    }

    if (!subject || !subject.passwordHash) {
      console.log(`[auth/login] No account found for: ${normalizedEmail}`);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, subject.passwordHash);
    if (!isValid) {
      console.log(`[auth/login] Password mismatch for: ${normalizedEmail}`);
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Build payload — orgId logic matches Python backend
    let orgId: string | undefined;
    if (subjectType === "user") {
      // User has an orgId pointer
      orgId = subject.orgId?.toString();
      if (!orgId) {
        // Fallback: find org by same email
        const org = await Organization.findOne({ email: normalizedEmail }).lean();
        orgId = org?._id?.toString();
      }
    } else {
      // Subject IS the org
      orgId = subject._id.toString();
    }

    const tokenPayload = {
      sub: subject._id.toString(),
      email: subject.email,
      orgId,
      role: subject.role || "owner",
      isApproved: subject.isApproved !== false,
      onboardingStep: subject.onboardingStep || subject.onboarding?.step || "connect",
    };

    const accessToken = signToken(tokenPayload, "7d");
    const refreshToken = signToken(tokenPayload, "30d");

    // Persist refreshToken back to DB
    if (subjectType === "user") {
      await User.findByIdAndUpdate(subject._id, { refreshToken });
    } else {
      await Organization.findByIdAndUpdate(subject._id, { refreshToken });
    }

    const onboardingStep = subject.onboardingStep || subject.onboarding?.step || "connect";

    const response = NextResponse.json({
      user: {
        id: subject._id.toString(),
        email: subject.email,
        name: subject.name || subject.fullName || subject.email,
        orgId,
        isApproved: subject.isApproved !== false,
        onboardingStep,
      },
      needsOnboarding: onboardingStep !== "complete",
      accessToken,
      refreshToken,
    }, { status: 200 });

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

    console.log(`[auth/login] Success for ${normalizedEmail} (${subjectType}), orgId=${orgId}`);
    return response;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
