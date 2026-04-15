import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { connectDB, Organization } from "@/lib/db";
import { OnboardingWizard } from "@/components/onboarding/wizard";

/**
 * /onboarding
 *
 * Server-rendered page that checks the user's current onboarding step
 * and renders the wizard starting from where they left off.
 * Users with completed onboarding are redirected to the dashboard.
 */
export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;

  if (!token) {
    redirect("/login");
  }

  let payload;
  try {
    payload = verifyAccessToken(token!);
  } catch {
    redirect("/login");
  }

  if (!payload.isApproved) {
    redirect("/pending-approval");
  }

  await connectDB();
  const org = await Organization.findById(payload.orgId)
    .select("onboarding hostawayApiKey")
    .lean();

  if (!org) {
    redirect("/login");
  }

  // Determine effective step (same logic as login route)
  const step = org.onboarding?.step
    ?? (org.hostawayApiKey ? "complete" : "connect");

  // If already complete, go to dashboard
  if (step === "complete") {
    redirect("/dashboard");
  }

  return <OnboardingWizard initialStep={step} />;
}
