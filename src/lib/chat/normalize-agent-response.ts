function extractJson(input: string): unknown {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  // Direct JSON payload
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to fence/extraction attempts
    }
  }

  // JSON fenced block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }

  // First JSON object in text
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Turns agent replies that are raw JSON (e.g. { user_intent, proposed_data, reasoning })
 * into a short human-readable message plus optional `proposals[]` for the chat UI.
 */
export function normalizeChatAgentOutput(agentReply: string): {
  displayMessage: string;
  proposals?: any[];
} {
  if (!agentReply?.trim()) {
    return { displayMessage: agentReply || "" };
  }

  const parsed = extractJson(agentReply);
  if (!parsed || typeof parsed !== "object") {
    return { displayMessage: agentReply };
  }

  const p = parsed as Record<string, any>;

  /** Pricing / Aria agent envelope: { routing, proposals, chat_response } */
  if (typeof p.chat_response === "string" && p.chat_response.trim()) {
    return {
      displayMessage: p.chat_response.trim(),
      proposals:
        Array.isArray(p.proposals) && p.proposals.length > 0 ? p.proposals : undefined,
    };
  }

  if (Array.isArray(p.proposals) && p.proposals.length > 0) {
    return {
      displayMessage: humanMessageFromStructured(p, agentReply, true),
      proposals: p.proposals,
    };
  }

  const single =
    p.proposed_data ||
    p.proposal ||
    p.recommendation ||
    (typeof p.date === "string" && (p.proposed_price != null || p.proposedPrice != null) ? p : null);

  if (single && typeof single === "object" && !Array.isArray(single)) {
    const date = single.date || single.target_date;
    const proposedPrice = Number(single.proposed_price ?? single.proposedPrice ?? 0);
    const changePct = Number(
      single.change_pct ?? single.changePct ?? single.price_change_pct ?? single.priceChangePct ?? 0
    );
    const proposalId = String(
      single.proposal_id ?? single.proposalId ?? `prop-${date || "day"}-${proposedPrice}`
    );
    const reasoning =
      typeof p.reasoning === "string"
        ? p.reasoning
        : typeof single.reasoning === "string"
          ? single.reasoning
          : "";
    const actionButtons = Array.isArray(p.action_buttons)
      ? p.action_buttons
      : Array.isArray(single.action_buttons)
        ? single.action_buttons
        : ["approve", "reject"];
    const abs = Math.abs(changePct);
    const riskLevel = abs < 5 ? "low" : abs <= 15 ? "medium" : "high";

    const proposal = {
      proposal_id: proposalId,
      date,
      proposed_price: proposedPrice,
      proposedPrice,
      change_pct: changePct,
      changePct,
      reasoning,
      action_buttons: actionButtons,
      guard_verdict: single.guard_verdict || single.guardVerdict || "APPROVED",
      guardVerdict: single.guard_verdict || single.guardVerdict || "APPROVED",
      risk_level: single.risk_level || riskLevel,
      riskLevel: single.risk_level || riskLevel,
    };

    const proposals = date && proposedPrice > 0 ? [proposal] : undefined;
    return {
      displayMessage: humanMessageFromStructured(p, agentReply, !!proposals?.length),
      proposals,
    };
  }

  if (typeof p.reasoning === "string" && p.reasoning.trim()) {
    return { displayMessage: p.reasoning.trim() };
  }

  return { displayMessage: agentReply };
}

function humanMessageFromStructured(
  p: Record<string, any>,
  fallback: string,
  hasProposalCards: boolean
): string {
  const explicit =
    (typeof p.summary === "string" && p.summary.trim()) ||
    (typeof p.message === "string" && p.message.trim()) ||
    (typeof p.reply === "string" && p.reply.trim()) ||
    (typeof p.narrative === "string" && p.narrative.trim()) ||
    (typeof p.assistant_message === "string" && p.assistant_message.trim()) ||
    "";

  if (explicit) return explicit;

  if (typeof p.reasoning === "string" && p.reasoning.trim()) {
    return p.reasoning.trim();
  }

  if (p.user_intent) {
    const label = String(p.user_intent).replace(/_/g, " ");
    if (hasProposalCards) {
      return `Here's a pricing suggestion for **${label}**. Review the proposal below and approve or reject.`;
    }
    return `I can help with **${label}**.`;
  }

  if (hasProposalCards && fallback.trim().startsWith("{")) {
    return "Review the price proposal below. You can approve or reject it.";
  }

  return fallback;
}

/** Use when hydrating DB history where assistant `content` may still be raw JSON. */
export function hydrateAssistantMessage<T extends { role: string; content: string; proposals?: any[]; proposalStatus?: string }>(
  m: T
): T {
  if (m.role !== "assistant") return m;
  if (m.proposals && m.proposals.length > 0) return m;

  const n = normalizeChatAgentOutput(m.content);
  if (!n.proposals?.length && n.displayMessage === m.content) return m;

  return {
    ...m,
    content: n.displayMessage,
    proposals: n.proposals?.length ? n.proposals : m.proposals,
    proposalStatus:
      n.proposals?.length ? ("pending" as const) : (m.proposalStatus as any),
  };
}
