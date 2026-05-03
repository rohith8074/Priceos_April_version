import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { getOrgHostawayToken } from "@/lib/hostaway/token";

// Unified Webhook API — works for all Hostaway account types
const UNIFIED_WEBHOOKS_URL = "https://api.hostaway.com/v1/webhooks/unifiedWebhooks";
const PRODUCTION_BASE = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || "https://priceos-april-version.vercel.app";
const OUR_WEBHOOK_PATH = "/api/webhook/hostaway";

function deriveWebhookUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${PRODUCTION_BASE}${OUR_WEBHOOK_PATH}`;
  }
  return `${proto}://${host}${OUR_WEBHOOK_PATH}`;
}

async function resolveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return null;
  const payload = verifyToken(token) as any;
  return payload?.orgId ?? null;
}

// ── Unified Webhook helpers ───────────────────────────────────────────────────

async function listUnifiedWebhooks(bearerToken: string): Promise<any[]> {
  const res = await fetch(UNIFIED_WEBHOOKS_URL, {
    headers: { Authorization: `Bearer ${bearerToken}`, "Cache-control": "no-cache" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.result) ? data.result : [];
}

async function createUnifiedWebhook(bearerToken: string, url: string): Promise<any> {
  const res = await fetch(UNIFIED_WEBHOOKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      "Cache-control": "no-cache",
    },
    body: JSON.stringify({ isEnabled: 1, url, login: null, password: null, alertingEmailAddress: null }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => res.statusText) };
}

async function updateUnifiedWebhook(bearerToken: string, id: string, url: string, isEnabled = 1): Promise<any> {
  const res = await fetch(`${UNIFIED_WEBHOOKS_URL}/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      "Cache-control": "no-cache",
    },
    body: JSON.stringify({ isEnabled, url, login: null, password: null, alertingEmailAddress: null }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => res.statusText) };
}

// ── POST — register / update webhook ─────────────────────────────────────────
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

  console.log(`[webhook-manage] ── Register Unified Webhook ──────────────────────`);
  console.log(`[webhook-manage]   org=${orgId}  target=${webhookUrl}`);

  // ── Step 1: List existing unified webhooks ────────────────────────────────
  const existing = await listUnifiedWebhooks(bearerToken);
  console.log(`[webhook-manage]   Found ${existing.length} existing unified webhook(s)`);

  // ── Step 2: Find the best matching webhook — priority order:
  //   1. Exact URL match (already correct — just save the ID)
  //   2. Stored webhook ID from our DB
  //   3. Any webhook that has our path (stale / ngrok URL → update to new URL)
  const ourStored = org.hostawayWebhookId && String(org.hostawayWebhookId) !== "manual"
    ? String(org.hostawayWebhookId)
    : null;

  const exactMatch = existing.find((wh: any) => wh.url === webhookUrl);
  const storedMatch = ourStored ? existing.find((wh: any) => String(wh.id) === ourStored) : null;
  const pathMatch = existing.find((wh: any) => (wh.url || "").includes(OUR_WEBHOOK_PATH) && wh.url !== webhookUrl);

  const match = exactMatch ?? storedMatch ?? pathMatch ?? null;

  let webhookId: string;
  let result: any;

  if (match) {
    webhookId = String(match.id);
    const alreadyCorrect = match.url === webhookUrl && Number(match.isEnabled) === 1;

    if (alreadyCorrect) {
      // ── Step 3a: Already registered with the right URL and enabled — nothing to do
      console.log(`[webhook-manage]   ✅ Already active id=${webhookId} — no update needed`);
    } else {
      // ── Step 3b: URL changed or disabled — PUT to update ─────────────────
      console.log(`[webhook-manage]   Updating webhook id=${webhookId} (url=${match.url} enabled=${match.isEnabled}) → ${webhookUrl}`);
      result = await updateUnifiedWebhook(bearerToken, webhookId, webhookUrl, 1);
      if (!result.ok) {
        console.error("[webhook-manage] Update failed:", result.status, result.body);
        return NextResponse.json(
          { error: `Hostaway rejected webhook update (${result.status}): ${result.body.slice(0, 200)}` },
          { status: 502 }
        );
      }
      console.log(`[webhook-manage]   ✅ Updated id=${webhookId}`);
    }
  } else {
    // ── Step 3b: Create a new unified webhook ─────────────────────────────
    console.log(`[webhook-manage]   Creating new unified webhook at Hostaway…`);
    result = await createUnifiedWebhook(bearerToken, webhookUrl);

    if (!result.ok) {
      console.error("[webhook-manage] Create failed:", result.status, result.body);

      if (result.status === 404) {
        console.warn("[webhook-manage] Unified webhooks also returned 404 — falling back to manual setup.");
        return NextResponse.json({ error: "manual_required", webhookUrl }, { status: 200 });
      }

      let userError = `Hostaway rejected webhook registration (${result.status}).`;
      if (result.status === 403) {
        userError += " The URL must be publicly reachable — use your deployed Vercel URL, not localhost.";
      } else if (result.status === 422 || result.status === 400) {
        userError += ` Hostaway said: ${result.body.slice(0, 200)}`;
      }
      return NextResponse.json({ error: userError, details: result.body }, { status: 502 });
    }

    let parsed: any = {};
    try { parsed = JSON.parse(result.body); } catch { /* ignore */ }
    webhookId = String(parsed?.result?.id ?? parsed?.id ?? "");

    if (!webhookId) {
      return NextResponse.json({ error: "Hostaway did not return a webhook ID." }, { status: 502 });
    }
    console.log(`[webhook-manage]   ✅ Created id=${webhookId}`);
  }

  // ── Step 4: Persist to org ────────────────────────────────────────────────
  await Organization.findByIdAndUpdate(orgId, {
    hostawayWebhookId: webhookId,
    hostawayWebhookUrl: webhookUrl,
  });

  console.log(`[webhook-manage]   Saved webhookId=${webhookId} to org`);
  console.log(`[webhook-manage] ────────────────────────────────────────────────`);

  return NextResponse.json({ ok: true, webhookId, webhookUrl });
}

// ── DELETE — disable webhook on Hostaway + clear local record ─────────────────
// Note: Unified Webhooks have no DELETE endpoint — we PUT isEnabled=0 to disable.
export async function DELETE(_req: NextRequest) {
  const orgId = await resolveOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const org = await Organization.findById(orgId)
    .select("hostawayWebhookId hostawayWebhookUrl")
    .lean() as any;

  if (!org?.hostawayWebhookId) {
    return NextResponse.json({ ok: true, removed: false, message: "No webhook was registered." });
  }

  const storedId = String(org.hostawayWebhookId);
  const isManual = storedId === "manual";

  if (!isManual) {
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

    // Disable via PUT (unified webhooks have no DELETE endpoint)
    const storedUrl = String(org.hostawayWebhookUrl || PRODUCTION_BASE + OUR_WEBHOOK_PATH);
    const disableResult = await updateUnifiedWebhook(bearerToken, storedId, storedUrl, 0);
    if (!disableResult.ok) {
      console.warn(`[webhook-manage DELETE] Could not disable webhook id=${storedId} (${disableResult.status}) — clearing local record anyway`);
    } else {
      console.log(`[webhook-manage] Disabled unified webhook id=${storedId} on Hostaway`);
    }
  }

  await Organization.findByIdAndUpdate(orgId, {
    $unset: { hostawayWebhookId: "", hostawayWebhookUrl: "" },
  });

  console.log(`[webhook-manage] Webhook cleared for org=${orgId}`);
  return NextResponse.json({ ok: true, removed: true });
}
