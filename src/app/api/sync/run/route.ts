import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { startBackgroundSync } from "@/lib/sync/background-sync";

export async function POST(req: NextRequest) {
  try {
    // Read orgId from JWT cookie (route is public so middleware won't block, but we still need org context)
    const cookie = req.cookies.get("priceos-session")?.value;
    let orgId: string | undefined;
    if (cookie) {
      const payload = verifyToken(cookie) as any;
      orgId = payload?.orgId || payload?.sub;
    }

    // Also accept orgId from request body
    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    orgId = orgId || body?.orgId;

    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const result = startBackgroundSync(orgId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/sync/run]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
