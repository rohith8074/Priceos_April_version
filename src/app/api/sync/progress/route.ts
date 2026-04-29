import { NextResponse } from "next/server";
import { getBackgroundSyncStatus } from "@/lib/sync/background-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getBackgroundSyncStatus();
  return NextResponse.json(status);
}
