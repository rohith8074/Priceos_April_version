import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models/Listing";
import { Organization } from "@/lib/db/models/Organization";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { GuestThread, IGuestMessage } from "@/lib/db/models/guest_thread";
import { getOrgHostawayToken } from "@/lib/hostaway/token";
import { callLyzrAgent } from "@/lib/services/lyzr";
import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// In-process rate limit / dedup
const _processed: Record<string, number> = {};
const DEDUP_TTL_MS = 10 * 60 * 1000;

function _dedupKey(payload: any): string {
  return `${payload.id || ""}-${payload.messageCount || payload.action || ""}`;
}

function _isDuplicate(key: string): boolean {
  const now = Date.now();
  for (const k in _processed) {
    if (now - _processed[k] > DEDUP_TTL_MS) delete _processed[k];
  }
  return !!_processed[key];
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    console.log(`\n[WEBHOOK INBOUND] Raw Payload received`);

    const key = _dedupKey(payload);
    if (_isDuplicate(key)) {
      console.log(`[WEBHOOK] Duplicate suppressed: ${key}`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    _processed[key] = Date.now();

    // Fire and forget
    processWebhookEvent(payload).catch(err => {
      console.error("[WEBHOOK BACKGROUND ERROR]", err);
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[WEBHOOK INBOUND] Error parsing JSON payload:", err);
    return NextResponse.json({ received: true });
  }
}

async function processWebhookEvent(payload: any) {
  await connectToDatabase();

  const action = payload.action || "";
  if (action !== "newMessage" && action !== "test") {
    console.log(`[WEBHOOK] Ignoring action type: '${action}'`);
    return;
  }

  const conversationId = payload.id || `sim-${uuidv4().substring(0, 8)}`;
  const listingMapId = payload.listingMapId || payload.listing_id;
  let guestName = payload.guestName || "Guest";
  let guestText: string = payload.body || payload.message || "";

  // ── 1. Resolve orgId and listing ──────────────────────────────────────────
  let orgId: string = payload.orgId || "";
  let listingDoc: any = null;

  if (listingMapId) {
    listingDoc = await Listing.findOne({ hostawayId: String(listingMapId) });
  }
  if (!listingDoc && payload.listingId && String(payload.listingId).length === 24) {
    listingDoc = await Listing.findById(payload.listingId);
  }
  if (listingDoc && !orgId) {
    orgId = listingDoc.orgId.toString();
  }

  if (!orgId) {
    console.log(`[WEBHOOK] Cannot resolve orgId — drop.`);
    return;
  }

  // ── 2. Load org + settings ────────────────────────────────────────────────
  const org = await Organization.findById(orgId);
  if (!org) {
    console.log(`[WEBHOOK] Org not found: ${orgId}`);
    return;
  }

  const liveMode = org.settings?.comms?.liveMode ?? true;
  const autoReply = org.settings?.comms?.autoReply ?? false;
  console.log(`\n[WEBHOOK] ── Processing ──────────────────────────────────────`);
  console.log(`[WEBHOOK]   action=${action}  convId=${conversationId}`);
  console.log(`[WEBHOOK]   org=${orgId}  liveMode=${liveMode}  autoReply=${autoReply}`);

  // ── 3. Get org-scoped Hostaway bearer token ───────────────────────────────
  let hostawayToken = "";
  try {
    hostawayToken = await getOrgHostawayToken(orgId);
  } catch {
    // Fall back to global env token for backwards-compat
    hostawayToken = process.env.Hostaway_Authorization_token || "";
  }

  // ── 4. If no message text in payload, fetch from Hostaway ─────────────────
  if (!guestText && conversationId && hostawayToken) {
    try {
      const res = await fetch(`https://api.hostaway.com/v1/conversations/${conversationId}/messages`, {
        headers: { "Authorization": `Bearer ${hostawayToken}`, "Cache-control": "no-cache" },
      });
      if (res.ok) {
        const jsonData = await res.json();
        const msgs: any[] = jsonData.result || [];
        const inbound = msgs.filter((m: any) => m.isIncoming === 1);
        if (inbound.length > 0) {
          const latest = inbound[inbound.length - 1];
          guestText = latest.body || "";
          guestName = latest.userAvatarName || guestName;
          console.log(`[WEBHOOK] Fetched latest inbound from ${guestName}: '${guestText.slice(0, 80)}'`);
        }
      }
    } catch (err) {
      console.error(`[WEBHOOK] Hostaway message fetch failed:`, err);
    }
  }

  if (!guestText.trim()) {
    console.log("[WEBHOOK] No message text — skipping");
    return;
  }

  // ── 5. Inject into GuestThread (for AI processing) ───────────────────────
  const thread = await injectIntoGuestThread(orgId, conversationId, guestText, listingDoc);
  if (!thread) {
    console.log("[WEBHOOK] Failed to upsert GuestThread — aborting");
    return;
  }
  const threadId = thread._id.toString();
  console.log(`[WEBHOOK] GuestThread updated → threadId=${threadId}`);

  // ── 6. Inject into HostawayConversation (for Guest Inbox display) ─────────
  await injectIntoInbox(orgId, conversationId, guestText, guestName, listingDoc, listingMapId);

  // ── 7. Skip AI if manual mode ─────────────────────────────────────────────
  if (!liveMode) {
    console.log("[WEBHOOK] liveMode OFF — stored for manual review");
    return;
  }

  const agentId = process.env.LYZR_GUEST_AGENT_ID || process.env.LYZR_Chat_Response_Agent_ID || "";
  if (!agentId) {
    console.log("[WEBHOOK] No guest agent ID configured — skipping AI");
    return;
  }

  // ── 8. Call Maya AI agent ─────────────────────────────────────────────────
  const approvalRequired = !autoReply;
  const prompt = `New inbound message from guest '${guestName}':\n\n"${guestText}"\n\nThreadId: ${threadId}\nOrgId: ${orgId}\napprovalRequired: ${String(approvalRequired)}\n\nRead the thread context using read_thread, draft a professional reply matching the property's tone, then call send_reply to save it. ${approvalRequired ? "The reply will be queued for PM approval before sending." : "Auto-send mode is ON — the reply will be delivered directly to the guest."}`;

  console.log(`[WEBHOOK] Calling Maya agent — session=webhook-${conversationId.substring(0, 12)}`);
  const result = await callLyzrAgent(
    agentId,
    prompt,
    "webhook-user",
    `webhook-${conversationId}-${uuidv4().substring(0, 6)}`
  );

  if (!result.ok) {
    console.log(`[WEBHOOK] Maya agent error: ${result.error}`);
    return;
  }

  console.log(`[WEBHOOK] Maya replied:\n${result.response}`);

  // ── 9. Auto-post if autoReply ─────────────────────────────────────────────
  if (autoReply && result.response.trim()) {
    await postToHostaway(conversationId, result.response, hostawayToken);
    // Also push the AI reply into the Inbox so it's visible immediately
    await injectOutboundIntoInbox(conversationId, result.response);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function injectIntoGuestThread(
  orgId: string, conversationId: string, text: string, listingDoc: any
) {
  let thread = await GuestThread.findOne({
    orgId: new Types.ObjectId(orgId),
    reservationId: conversationId,
  });

  if (!thread) {
    thread = await GuestThread.create({
      orgId: new Types.ObjectId(orgId),
      reservationId: conversationId,
      listingId: listingDoc ? listingDoc._id : undefined,
      channel: "hostaway",
      commsState: "active",
      status: "open",
      openedAt: new Date(),
      lastActivityAt: new Date(),
    });
    console.log(`[WEBHOOK] Created GuestThread: ${thread._id}`);
  }

  thread.messages.push({
    messageId: uuidv4(),
    direction: "inbound",
    content: text,
    handledBy: "reservation_agent",
    discloseAi: true,
    status: "sent",
    createdAt: new Date(),
  } as any);
  thread.lastActivityAt = new Date();
  thread.status = "open";
  await thread.save();
  return thread;
}

async function injectIntoInbox(
  orgId: string, conversationId: string, text: string, guestName: string,
  listingDoc: any, listingMapId?: any
) {
  try {
    const newMsg = { sender: "guest", text, timestamp: new Date().toISOString() };

    const existing = await HostawayConversation.findOne({ hostawayConversationId: conversationId });

    if (existing) {
      existing.messages.push(newMsg);
      existing.needsReply = true;
      existing.guestName = guestName || existing.guestName;
      if (listingDoc && !existing.listingId) existing.listingId = listingDoc._id;
      existing.syncedAt = new Date();
      await existing.save();
      console.log(`[WEBHOOK] HostawayConversation updated for conv=${conversationId}`);
    } else {
      await HostawayConversation.create({
        orgId: new Types.ObjectId(orgId),
        listingId: listingDoc?._id ?? undefined,
        listingMapId: listingMapId ? Number(listingMapId) : undefined,
        hostawayConversationId: conversationId,
        guestName: guestName || "Guest",
        messages: [newMsg],
        dateFrom: "",
        dateTo: "",
        needsReply: true,
        syncedAt: new Date(),
      });
      console.log(`[WEBHOOK] HostawayConversation created for conv=${conversationId}`);
    }
  } catch (err: any) {
    console.warn(`[WEBHOOK] HostawayConversation inject failed (non-fatal): ${err?.message}`);
  }
}

async function injectOutboundIntoInbox(conversationId: string, text: string) {
  try {
    const newMsg = { sender: "admin", text, timestamp: new Date().toISOString() };
    await HostawayConversation.findOneAndUpdate(
      { hostawayConversationId: conversationId },
      { $push: { messages: newMsg }, $set: { needsReply: false, syncedAt: new Date() } }
    );
  } catch (err: any) {
    console.warn(`[WEBHOOK] Outbound inject to HostawayConversation failed (non-fatal): ${err?.message}`);
  }
}

async function postToHostaway(conversationId: string, replyText: string, token: string) {
  if (!token) return;
  try {
    const res = await fetch(`https://api.hostaway.com/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-control": "no-cache",
      },
      body: JSON.stringify({ body: replyText, isOutgoing: 1 }),
    });
    if (res.ok) {
      console.log(`[WEBHOOK] Reply posted to Hostaway conv=${conversationId}`);
    } else {
      console.log(`[WEBHOOK] Hostaway post failed: ${res.status}`);
    }
  } catch (e) {
    console.error(`[WEBHOOK] Exception posting reply to Hostaway:`, e);
  }
}
