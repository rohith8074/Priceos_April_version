import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/db/models/User";
import { Organization } from "@/lib/db/models/Organization";
import { verifyToken, signToken } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get("priceos-refresh")?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "No refresh token provided" }, { status: 401 });
    }

    // 1. Verify the refresh token
    const decoded: any = verifyToken(refreshToken);
    if (!decoded || !decoded.sub) {
      return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    }

    await connectToDatabase();

    // 2. Locate the user / organization
    let subject = await User.findById(decoded.sub).lean();
    let subjectType: "user" | "org" = "user";

    if (!subject) {
      subjectType = "org";
      subject = await Organization.findById(decoded.sub).lean();
    }

    if (!subject) {
      return NextResponse.json({ error: "Account not found" }, { status: 401 });
    }

    // 3. Match refresh token to DB record for security
    if (subject.refreshToken !== refreshToken) {
       return NextResponse.json({ error: "Session revoked or mismatched" }, { status: 401 });
    }

    // 4. Resolve orgId and onboardingStep
    let orgId: string | undefined;
    if (subjectType === "user") {
      orgId = subject.orgId?.toString();
    } else {
      orgId = subject._id.toString();
    }

    const onboardingStep = (subject as any).onboardingStep || (subject as any).onboarding?.step || "connect";

    // 5. Build new access token payload
    const tokenPayload = {
      sub: subject._id.toString(),
      email: subject.email,
      orgId,
      role: subject.role || "owner",
      isApproved: subject.isApproved !== false,
      onboardingStep,
    };

    const newAccessToken = signToken(tokenPayload, "7d");

    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      user: {
        id: subject._id.toString(),
        email: subject.email,
        name: subject.name || subject.fullName || subject.email,
        orgId,
        isApproved: subject.isApproved !== false,
        onboardingStep,
      }
    }, { status: 200 });

    // 6. Set access token cookie
    response.cookies.set("priceos-session", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[auth/refresh Next.js]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
