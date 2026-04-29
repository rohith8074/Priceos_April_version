import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/auth/jwt";
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

  let payload: any;
  try {
    payload = verifyToken(token!) as any;
    if (!payload) redirect("/login");
  } catch {
    redirect("/login");
  }

  if (!payload.isApproved) {
    redirect("/pending-approval");
  }

  if (payload.onboardingStep === "complete") {
    redirect("/dashboard");
  }

  // Read the current step from the JWT so the wizard resumes from where the user left off.
  // The step is refreshed in the JWT every time PATCH /api/onboarding is called.
  const currentStep = payload.onboardingStep || "connect";

  return <OnboardingWizard initialStep={currentStep as any} />;
}
