import { connectDB, Insight } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { InsightsClient } from "./insights-client";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getSession();

  if (!session) {
    // Not authenticated — show empty state; middleware will redirect
    return (
      <InsightsClient initialInsights={[]} />
    );
  }

  await connectDB();

  const rawInsights = await Insight.find({
    orgId: new mongoose.Types.ObjectId(session.orgId),
    status: { $in: ["pending", "approved", "rejected", "snoozed"] },
  })
    .sort({ severity: 1, createdAt: -1 })
    .limit(100)
    .lean();

  const initialInsights = rawInsights.map((i: any) => ({
    id: i._id.toString(),
    category: i.category,
    severity: i.severity,
    status: i.status,
    title: i.title,
    summary: i.summary ?? "",
    confidence: i.confidence ?? 0.7,
    action: i.action ?? null,
    listingId: i.listingId?.toString() ?? null,
    createdAt: i.createdAt.toISOString(),
    snoozeUntil: i.snoozeUntil ? i.snoozeUntil.toISOString() : null,
  }));

  return <InsightsClient initialInsights={initialInsights} />;
}
