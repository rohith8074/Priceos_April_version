/**
 * GET /api/debug/user?email=x  — shows raw onboarding state
 * POST /api/debug/user?email=x — resets onboarding to "connect" for re-testing
 * TEMPORARY — remove before production.
 */
import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization } from "@/lib/db";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" });

  await connectDB();
  const org = await Organization.findOne({ email: email.toLowerCase() })
    .select("email isApproved onboarding hostawayApiKey role")
    .lean();

  if (!org) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    email: org.email,
    role: org.role,
    isApproved: org.isApproved,
    hasHostawayKey: !!org.hostawayApiKey,
    onboarding: org.onboarding ?? null,
    computed_onboardingStep: org.onboarding?.step ?? "(field missing — defaults to 'complete')",
  });
}

/** Reset onboarding so the wizard re-runs — for demo/testing */
export async function POST(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email param required" });

  await connectDB();
  await Organization.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { onboarding: { step: "connect" } } }
  );

  return NextResponse.json({ ok: true, message: `Onboarding reset to 'connect' for ${email}` });
}
