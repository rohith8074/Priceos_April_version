import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { getOrgHostawayToken } from "@/lib/hostaway/token";

const HOSTAWAY_WEBHOOKS_URL = "https://api.hostaway.com/v1/webhooks";
const PRODUCTION_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || "https://priceos-april-version.vercel.app";

function deriveWebhookUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  // On localhost, always point to the production deployment — Hostaway can't reach localhost
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${PRODUCTION_BASE}/api/webhook/hostaway`;
  }
  return `${proto}://${host}/api/webhook/hostaway`;
}

async function resolveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return null;
  const payload = verifyToken(token) as any;
  return payload?.orgId ?? null;
}

// ── Standard Hostaway process ──────────────────────────────────────────────────
// 1. GET /v1/webhooks — list all existing webhooks for this account
// 2. DELETE any that point to our URL (removes stale duplicates)
// 3. POST /v1/webhooks — register the new webhook
async function listHostawayWebhooks(bearerToken: string): Promise<any[]> {
  const res = await fetch(HOSTAWAY_WEBHOOKS_URL, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Cache-control": "no-cache",
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.result) ? data.result : [];
}

async function deleteHostawayWebhook(bearerToken: string, id: string): Promise<void> {
  await fetch(`${HOSTAWAY_WEBHOOKS_URL}/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Cache-control": "no-cache",
    },
  });
}

// POST — register webhook with Hostaway
export async function POST(req: NextRequest) {
  const orgId = await resolveOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const org = await Organization.findById(orgId)
    .select("hostawayApiKey hostawayAccountId hostawayWebhookId hostawayWebhookUrl")
    .lean() as any;

  if (!org?.hostawayApiKey || !org?.hostawayAccountId) {
    return NextResponse.json(
      { error: "Hostaway credentials not saved. Add Account ID and API Key in Settings first." },
      { status: 400 }
    );
  }

  // Accept optional custom URL from request body (for ngrok / custom domains)
  let body: any = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const webhookUrl: string = body.webhookUrl?.trim() || deriveWebhookUrl(req);

  if (!webhookUrl.startsWith("http")) {
    return NextResponse.json({ error: "Invalid webhook URL." }, { status: 400 });
  }

  let bearerToken: string;
  try {
    bearerToken = await getOrgHostawayToken(orgId);
  } catch (err: any) {
    console.error("[webhook-manage POST] Token fetch failed:", err?.message ?? "unknown");
    return NextResponse.json(
      { error: "Could not authenticate with Hostaway. Check your API credentials." },
      { status: 502 }
    );
  }

  console.log(`[webhook-manage] ── Register Webhook ──────────────────────────────`);
  console.log(`[webhook-manage]   org=${orgId}`);
  console.log(`[webhook-manage]   target URL: ${webhookUrl}`);

  // ── Step 1: List existing webhooks from Hostaway ──────────────────────────
  const existing = await listHostawayWebhooks(bearerToken);
  console.log(`[webhook-manage]   Hostaway has ${existing.length} existing webhook(s)`);

  // ── Step 2: Delete any that point to OUR receiver URL (or the stored webhook ID) ──
  const ourPath = "/api/webhook/hostaway";
  for (const wh of existing) {
    const whUrl: string = wh.url || "";
    const whId = String(wh.id);
    const isSamePath = whUrl.includes(ourPath) || whUrl === webhookUrl;
    const isOurStored = org.hostawayWebhookId && whId === String(org.hostawayWebhookId);

    if (isSamePath || isOurStored) {
      console.log(`[webhook-manage]   Deleting stale webhook id=${whId} url=${whUrl}`);
      try {
        await deleteHostawayWebhook(bearerToken, whId);
        console.log(`[webhook-manage]   Deleted id=${whId}`);
      } catch (e: any) {
        console.warn(`[webhook-manage]   Could not delete id=${whId}: ${e?.message}`);
      }
    }
  }

  // ── Step 3: Register new webhook ─────────────────────────────────────────
  const isLocalhost = webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1");
  if (isLocalhost) {
    console.warn(`[webhook-manage]   ⚠ Localhost URL — Hostaway may reject this. Use ngrok for local testing.`);
  }

  console.log(`[webhook-manage]   Registering webhook at Hostaway…`);
  const res = await fetch(HOSTAWAY_WEBHOOKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      "Cache-control": "no-cache",
    },
    body: JSON.stringify({ url: webhookUrl, action: "newMessage" }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => res.statusText);
    console.error("[webhook-manage POST] Hostaway rejected:", res.status, errorBody);

    let userError = `Hostaway rejected webhook registration (${res.status}).`;
    if (res.status === 403) {
      userError += " The URL must be publicly reachable (not localhost). Use an ngrok URL for local testing.";
    } else if (res.status === 422 || res.status === 400) {
      userError += ` Hostaway said: ${errorBody.slice(0, 200)}`;
    }
    return NextResponse.json({ error: userError, details: errorBody }, { status: 502 });
  }

  const data = await res.json();
  const webhookId = String(data?.result?.id ?? data?.id ?? "");

  if (!webhookId) {
    return NextResponse.json({ error: "Hostaway did not return a webhook ID." }, { status: 502 });
  }

  await Organization.findByIdAndUpdate(orgId, {
    hostawayWebhookId: webhookId,
    hostawayWebhookUrl: webhookUrl,
  });

  console.log(`[webhook-manage]   ✅ Registered id=${webhookId} url=${webhookUrl}`);
  console.log(`[webhook-manage] ─────────────────────────────────────────────────`);

  return NextResponse.json({ ok: true, webhookId, webhookUrl });
}

// DELETE — remove webhook from Hostaway
export async function DELETE(_req: NextRequest) {
  const orgId = await resolveOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const org = await Organization.findById(orgId)
    .select("hostawayWebhookId")
    .lean() as any;

  if (!org?.hostawayWebhookId) {
    return NextResponse.json({ ok: true, removed: false, message: "No webhook was registered." });
  }

  let bearerToken: string;
  try {
    bearerToken = await getOrgHostawayToken(orgId);
  } catch (err: any) {
    console.error("[webhook-manage DELETE] Token fetch failed:", err?.message ?? "unknown");
    return NextResponse.json(
      { error: "Could not authenticate with Hostaway to remove webhook." },
      { status: 502 }
    );
  }

  await deleteHostawayWebhook(bearerToken, String(org.hostawayWebhookId));
  await Organization.findByIdAndUpdate(orgId, {
    $unset: { hostawayWebhookId: "", hostawayWebhookUrl: "" },
  });

  console.log(`[webhook-manage] Webhook removed for org=${orgId} id=${org.hostawayWebhookId}`);
  return NextResponse.json({ ok: true, removed: true });
}
