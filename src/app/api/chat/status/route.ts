import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    wsApiKey: process.env.NEXT_PUBLIC_LYZR_API_KEY || process.env.NEXT_PUBLIC_LYZR_API_KEY2 || null,
    wsBaseUrl: process.env.NEXT_PUBLIC_LYZR_WS_BASE_URL || "wss://metrics.studio.lyzr.ai/session"
  }, { status: 200 });
}
