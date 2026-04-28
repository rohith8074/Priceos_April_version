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

  // Onboarding state is fetched client-side by the wizard via /api/onboarding
  return <OnboardingWizard initialStep="connect" />;
}
