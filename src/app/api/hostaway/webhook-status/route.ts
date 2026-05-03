import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { fetchHostawayToken } from "@/lib/hostaway/token";

const PRODUCTION_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || "https://priceos-april-version.vercel.app";

function deriveWebhookUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${PRODUCTION_BASE}/api/webhook/hostaway`;
  }
  return `${proto}://${host}/api/webhook/hostaway`;
}

export async function GET(req: NextRequest) {
  // Always resolve orgId from JWT cookie — never from query params
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = verifyToken(token) as any;
  if (!payload?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = payload.orgId;

  await connectToDatabase();

  const org = await Organization.findById(orgId)
    .select("hostawayApiKey hostawayAccountId hostawayToken hostawayTokenExpiresAt hostawayWebhookId")
    .lean() as any;

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  const hasCredentials = !!(org.hostawayApiKey && org.hostawayAccountId);

  if (!hasCredentials) {
    return NextResponse.json({
      hasCredentials: false,
      connected: false,
      webhookRegistered: false,
      webhookUrl: deriveWebhookUrl(req),
    });
  }

  // Test connection — detect JWT vs OAuth key automatically (same logic as getOrgHostawayToken)
  let connected = false;
  let connectionError: string | null = null;
  const isJwtKey = (org.hostawayApiKey as string)?.startsWith("eyJ");
  try {
    if (isJwtKey) {
      // Validate JWT expiry only — no network call needed
      const parts = (org.hostawayApiKey as string).split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      const expMs = (payload.exp as number) * 1000;
      if (expMs - 5 * 60 * 1000 > Date.now()) {
        connected = true;
      } else {
        connectionError = "Saved token has expired — update credentials in Settings.";
      }
    } else {
      await fetchHostawayToken(org.hostawayAccountId, org.hostawayApiKey);
      connected = true;
    }
  } catch (err: any) {
    connectionError = err?.message ?? "Connection test failed";
    console.error("[webhook-status] connection test failed:", err?.message ?? "unknown");
  }

  const webhookRegistered = !!(org.hostawayWebhookId && connected);

  // Manually registered webhooks are always considered active (no Hostaway ID to verify).
  let webhookStillActive = org.hostawayWebhookId === "manual";
  if (webhookRegistered && !webhookStillActive && org.hostawayToken) {
    try {
      // Use the Unified Webhook endpoint for the live-check
      const res = await fetch(
        `https://api.hostaway.com/v1/webhooks/unifiedWebhooks/${org.hostawayWebhookId}`,
        {
          headers: {
            Authorization: `Bearer ${org.hostawayToken}`,
            "Cache-control": "no-cache",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        // Active = exists AND isEnabled is 1 (not 0)
        webhookStillActive = (data?.result?.isEnabled ?? data?.isEnabled ?? 1) === 1;
      } else {
        webhookStillActive = false;
      }
    } catch {
      webhookStillActive = false;
    }
  }

  return NextResponse.json({
    hasCredentials: true,
    connected,
    connectionError: connectionError ?? undefined,
    webhookRegistered: webhookRegistered && webhookStillActive,
    webhookId: org.hostawayWebhookId ?? null,
    webhookUrl: deriveWebhookUrl(req),
  });
}
