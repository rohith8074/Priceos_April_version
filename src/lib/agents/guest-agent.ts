import { buildAgentContext } from "./db-context-builder";
import { callLyzrAgent } from "@/lib/lyzr/client";
import { getEnv } from "@/lib/env";
import mongoose from "mongoose";

export interface GuestMessageInput {
  guestName: string;
  messageText: string;
  channel: string; // WhatsApp, Airbnb, etc.
  commsState: "active" | "paused" | "syncing";
}

export interface GuestAgentOutput {
  action: "draft_reply" | "reply_sent" | "escalation" | "ticket_created" | "upsell_sent";
  draft_text?: string;
  confidence: number;
  reasoning?: string;
}

export class GuestAgent {
  private agentId: string;

  constructor() {
    // Falls back to a default mock/test agent ID if not set
    this.agentId = getEnv("LYZR_GUEST_AGENT_ID") || "guest-agent-v1";
  }

  /**
   * Evaluates a new guest message and drafts a smart response or action
   * based on the Unified Inbox V2 specs (availability, pricing, amenities).
   */
  async draftReply(
    orgId: string,
    listingId: string,
    input: GuestMessageInput
  ): Promise<GuestAgentOutput> {
    // 1. Fetch live DB context strictly for this property
    // We request the next 30 days of calendar visibility for upsells/availability queries
    const contextStr = await buildAgentContext(orgId, listingId);

    // 2. Formulate the LLM Prompt
    // Includes context + strict instructions per the spec
    const prompt = `
[GUEST INBOX: TIER 1 CAPABILITY]
You are the Guest Reply Agent ("Reservation Agent").
You draft replies, escalate issues, or send upsells.
You MUST output ONLY valid JSON using the BaseEnvelope schema.

<Guest Information>
Guest Name: ${input.guestName}
Message: "${input.messageText}"
Channel: ${input.channel}
Comms State: ${input.commsState}
</Guest Information>

<Property & Market Context>
${contextStr}
</Property & Market Context>

<Rules>
1. Identify the intent of the guest (e.g. asking for amenities like a pool, asking to extend stay, or reporting an issue).
2. If asking about amenities, answer based on the amenities array provided in the Property info.
3. If asking for dates/availability/late checkout, check the calendar inventory context provided.
4. If it's a severe complaint or legal threat, choose action: "escalation".
5. If it's a maintenance issue (e.g., broken AC), choose action: "ticket_created" and draft an ack.
6. If the guest wants to extend their stay and the calendar shows it's available, draft an upsell offer quoting the exact price from the inventory using action: "upsell_sent".
7. By default, output action: "draft_reply" with the draft_text field.
8. Output pure JSON matching GuestAgentOutput schema. Do NOT use markdown code block formatting.
</Rules>
    `.trim();

    // 3. Call the Agent Layer
    const result = await callLyzrAgent({
      agentId: this.agentId,
      message: prompt,
      maxRetries: 1,
    });

    if (!result.ok) {
      throw new Error(`Guest Agent Failed: ${result.error}`);
    }

    // 4. Parse Output (fallback to primitive reply if JSON fails)
    if (result.parsedJson) {
      return result.parsedJson as unknown as GuestAgentOutput;
    }

    return {
      action: "draft_reply",
      draft_text: result.response || "I am sorry, I am having trouble connecting to my knowledge base right now.",
      confidence: 0,
      reasoning: "Fallback - Output could not be parsed to JSON",
    };
  }
}

export function createGuestAgent() {
  return new GuestAgent();
}
