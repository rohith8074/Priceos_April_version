import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  const response = NextResponse.json({ success: true });
  // Clear both auth cookies
  response.cookies.set("priceos-session", "", { maxAge: 0, path: "/" });
  response.cookies.set("priceos-refresh", "", { maxAge: 0, path: "/" });
  return response;
}
