import { NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";
import { getSession, COOKIE_NAME } from "@/lib/auth/server";
import { signAccessToken } from "@/lib/auth/jwt";

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ approved: false, reason: "unauthenticated" }, { status: 401 });
        }

        await connectDB();
        const org = await Organization.findById(session.userId).select("isApproved email role").lean() as any;

        if (!org) {
            return NextResponse.json({ approved: false, reason: "not_found" }, { status: 404 });
        }

        const approved: boolean = !!org.isApproved;

        // If the JWT still carries isApproved:false but DB now says true,
        // re-issue the cookie so the next page load passes the middleware check.
        const response = NextResponse.json({ approved, email: org.email });

        if (approved && !session.isApproved) {
            const newToken = signAccessToken({
                userId: session.userId,
                orgId: session.orgId,
                email: org.email,
                role: org.role,
                isApproved: true,
                onboardingStep: session.onboardingStep,
            });
            response.cookies.set(COOKIE_NAME, newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 60 * 60 * 24 * 7,
                path: "/",
            });
        }

        return response;
    } catch (err) {
        console.error("[check-approval] error:", err);
        return NextResponse.json({ approved: false, reason: "error" }, { status: 500 });
    }
}
