import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB, Organization } from "@/lib/db";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { COOKIE_NAME } from "@/lib/auth/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { apiError } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(`auth-login:${ip}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return apiError("RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
  }

  try {
    const { username, password, email } = await req.json();
    const loginEmail = (email || username || "").trim().toLowerCase();

    if (!loginEmail || !password) {
      return apiError("VALIDATION_ERROR", "Email and password are required", 400);
    }

    await connectDB();
    console.log("[Auth/Login] Looking up email:", loginEmail);
    const org = await Organization.findOne({ email: loginEmail });
    console.log("[Auth/Login] Org found:", !!org, org ? `id=${org._id} approved=${org.isApproved}` : "");

    if (!org) {
      console.log("[Auth/Login] ❌ No org found for:", loginEmail);
      return apiError("UNAUTHORIZED", "Invalid credentials", 401);
    }

    const isValid = await bcrypt.compare(password, org.passwordHash);
    console.log("[Auth/Login] Password valid:", isValid);
    if (!isValid) {
      console.log("[Auth/Login] ❌ Wrong password for:", loginEmail);
      return apiError("UNAUTHORIZED", "Invalid credentials", 401);
    }

    // Determine onboarding step:
    // - If the field exists → use it
    // - If missing AND no Hostaway key → user needs to onboard ("connect")
    // - If missing AND Hostaway key is set → legacy user already set up ("complete")
    const onboardingStep = org.onboarding?.step
      ?? (org.hostawayApiKey ? "complete" : "connect");

    const accessToken = signAccessToken({
      userId: org._id.toString(),
      orgId:  org._id.toString(),
      email:  org.email,
      role:   org.role,
      isApproved: org.isApproved,
      onboardingStep,
    });
    const refreshToken = signRefreshToken(org._id.toString());

    await Organization.findByIdAndUpdate(org._id, { $set: { refreshToken } });

    const response = NextResponse.json({
      success: true,
      pending: !org.isApproved,
      needsOnboarding: org.isApproved && onboardingStep !== "complete",
      user: {
        id:             org._id.toString(),
        email:          org.email,
        name:           org.fullName || org.name,
        role:           org.role,
        orgId:          org._id.toString(),
        plan:           org.plan,
        isApproved:     org.isApproved,
        onboardingStep,
      },
    });

    response.cookies.set(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (e: unknown) {
    console.error("[Auth/Login] Error:", e);
    return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
  }
}
