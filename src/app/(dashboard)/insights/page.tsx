import { getSession } from "@/lib/auth/server";
import { InsightsClient } from "./insights-client";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getSession();

  if (!session) {
    return <InsightsClient initialInsights={[]} />;
  }

  // Insights are fetched client-side via /api/insights
  return <InsightsClient initialInsights={[]} />;
}
