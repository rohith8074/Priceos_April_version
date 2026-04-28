import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models/Listing";
import { Organization } from "@/lib/db/models/Organization";
import { GuestThread, IGuestMessage } from "@/lib/db/models/guest_thread";
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
    if (now - _processed[k] > DEDUP_TTL_MS) {
      delete _processed[k];
    }
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

    // Fire and forget background process
    processWebhookEvent(payload, false).catch(err => {
      console.error("[WEBHOOK BACKGROUND ERROR]", err);
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[WEBHOOK INBOUND] Error parsing JSON payload:", err);
    return NextResponse.json({ received: true });
  }
}

async function processWebhookEvent(payload: any, testMode: boolean = false) {
  await connectToDatabase();

  const action = payload.action || "";
  if (action !== "newMessage" && action !== "test") {
    console.log(`[WEBHOOK] Ignoring action type: '${action}'`);
    return;
  }

  const conversationId = payload.id || `sim-${uuidv4().substring(0, 8)}`;
  const listingMapId = payload.listingMapId || payload.listing_id;
  let guestName = payload.guestName || "Guest";

  console.log(`\n[WEBHOOK] ── Processing ──────────────────────────────────────`);
  console.log(`[WEBHOOK]   action=${action}  convId=${conversationId}  test=${testMode}`);
  
  let guestText: string = payload.body || payload.message || "";

  if (!testMode && !guestText && conversationId) {
    const hostawayToken = process.env.Hostaway_Authorization_token || "";
    if (hostawayToken) {
      try {
        const res = await fetch(`https://api.hostaway.com/v1/conversations/${conversationId}/messages`, {
          headers: {
            "Authorization": `Bearer ${hostawayToken}`,
            "Cache-control": "no-cache"
          }
        });
        if (res.ok) {
          const jsonData = await res.json();
          const msgs = jsonData.result || [];
          const inbound = msgs.filter((m: any) => m.isIncoming === 1);
          if (inbound.length > 0) {
            const latest = inbound[inbound.length - 1];
            guestText = latest.body || "";
            guestName = latest.userAvatarName || guestName;
            console.log(`[WEBHOOK] Found latest inbound message from ${guestName}: '${guestText}'`);
          }
        }
      } catch (err) {
        console.error(`[WEBHOOK] Hostaway message fetch exception:`, err);
      }
    }
  }

  if (!guestText.trim()) {
    console.log("[WEBHOOK] No message text — skipping");
    return;
  }

  let orgId = payload.orgId;
  let listingDoc: any = null;

  if (listingMapId) {
    listingDoc = await Listing.findOne({ hostawayId: String(listingMapId) });
  }
  
  if (!listingDoc && payload.listingId && payload.listingId.length === 24) {
    listingDoc = await Listing.findById(payload.listingId);
  }

  if (listingDoc && !orgId) {
    orgId = listingDoc.orgId.toString();
  }

  if (!orgId) {
    console.log(`[WEBHOOK] Cannot resolve orgId — drop.`);
    return;
  }

  const org = await Organization.findById(orgId);
  if (!org) {
    console.log(`[WEBHOOK] Org not found: ${orgId}`);
    return;
  }

  const liveMode = org.settings?.comms?.liveMode ?? false;
  const autoReply = org.settings?.comms?.autoReply ?? false;

  console.log(`[WEBHOOK] Org comms — liveMode=${liveMode}  autoReply=${autoReply}`);

  const thread = await injectInbound(orgId, conversationId, guestText, guestName, listingDoc);
  if (!thread) {
    console.log("[WEBHOOK] Failed to create/update GuestThread — aborting");
    return;
  }

  const threadId = thread._id.toString();
  console.log(`[WEBHOOK] Message injected → threadId=${threadId}`);

  if (!liveMode && !testMode) {
    console.log("[WEBHOOK] Live mode OFF — message stored for manual review, no AI call");
    return;
  }

  const agentId = process.env.LYZR_GUEST_AGENT_ID || process.env.LYZR_Chat_Response_Agent_ID || "";
  if (!agentId) {
    console.log("[WEBHOOK] No guest agent ID configured — skipping AI");
    return;
  }

  const approvalRequired = !autoReply;
  const prompt = `New inbound message from guest '${guestName}':\n\n"${guestText}"\n\nThreadId: ${threadId}\nOrgId: ${orgId}\napprovalRequired: ${String(approvalRequired).toLowerCase()}\n\nRead the thread context using read_thread, draft a professional reply matching the property's tone, then call send_reply to save it. ${approvalRequired ? "The reply will be queued for PM approval before sending." : "Auto-send mode is ON — the reply will be delivered directly to the guest."}`;

  console.log(`[WEBHOOK] Calling Maya agent — session=webhook-${conversationId.substring(0, 12)}`);
  
  // Notice: Node is single threaded, so we don't strictly need a semaphore for concurrency per org
  // as the events are processed synchronously until the `await callLyzrAgent`. 
  // For true parallelism limitation we could implement a queue, but native fetch handles it nicely.
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

  if (autoReply && !testMode && result.response.trim()) {
    await postToHostaway(conversationId, result.response);
  }
}

async function injectInbound(orgId: string, conversationId: string, text: string, guestName: string, listingDoc: any) {
  let thread = await GuestThread.findOne({
    orgId: new Types.ObjectId(orgId),
    reservationId: conversationId
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
    console.log(`[WEBHOOK] Created GuestThread: ${thread._id} for conv=${conversationId}`);
  }

  const newMsg = {
    messageId: uuidv4(),
    direction: "inbound",
    content: text,
    handledBy: "reservation_agent",
    discloseAi: true,
    status: "sent",
    createdAt: new Date(),
  };

  thread.messages.push(newMsg as any);
  thread.lastActivityAt = new Date();
  thread.status = "open";
  await thread.save();

  return thread;
}

async function postToHostaway(conversationId: string, replyText: string) {
  const token = process.env.Hostaway_Authorization_token || "";
  if (!token) return;
  try {
    const res = await fetch(`https://api.hostaway.com/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cache-control": "no-cache",
      },
      body: JSON.stringify({ body: replyText, isOutgoing: 1 })
    });
    if (res.ok) {
      console.log(`[WEBHOOK] Reply posted to Hostaway conv=${conversationId} successfully.`);
    } else {
      console.log(`[WEBHOOK] Hostaway post failed. Status: ${res.status}`);
    }
  } catch (e) {
    console.error(`[WEBHOOK] Exception while posting reply to Hostaway:`, e);
  }
}
