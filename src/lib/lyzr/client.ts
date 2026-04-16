/**
 * Centralized Lyzr Agent Client — pooled, retry-aware, lazy-env.
 *
 * Every API route that talks to Lyzr Studio should go through this module
 * instead of inlining its own fetch() + error handling.
 *
 * Benefits:
 *  - Env vars are resolved lazily (never at module-load / build time)
 *  - Automatic retry with exponential back-off on 5xx / network errors
 *  - Configurable timeout with AbortController
 *  - Tool-loop error detection and clean fallback message
 *  - Consistent response parsing across all known Lyzr response shapes
 */

import { getLyzrConfig, getEnv } from "@/lib/env";

// ── Public types ────────────────────────────────────────────────────────────────

export interface LyzrCallOptions {
  agentId: string;
  message: string;
  userId?: string;
  sessionId?: string;
  systemPromptVariables?: Record<string, unknown>;
  filterVariables?: Record<string, unknown>;
  features?: Record<string, unknown>[];
  /** Request timeout in ms (default 120 000) */
  timeoutMs?: number;
  /** How many times to retry on transient failures (default 2) */
  maxRetries?: number;
}

export interface LyzrCallResult {
  /** Parsed plain-text reply from the agent */
  response: string;
  /** Full JSON body returned by Lyzr */
  raw: unknown;
  /** Whether the call succeeded (HTTP 2xx + non-empty response) */
  ok: boolean;
  /** Structured JSON extracted from the response, if any */
  parsedJson: Record<string, unknown> | null;
  /** Human-readable error description when ok === false */
  error?: string;
}

// ── Internal helpers ────────────────────────────────────────────────────────────

const TOOL_LOOP_PATTERNS = [
  "maximum number of tool calls",
  "i've reached the maximum",
  "reached the maximum number of tool calls",
  "tool calls allowed",
];

const TOOL_LOOP_FALLBACK =
  "I hit a processing limit on that request. Could you rephrase or ask a simpler question?";

function isToolLoopError(text: string): boolean {
  const lower = text.toLowerCase();
  return TOOL_LOOP_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Extract the agent's text response from Lyzr's polymorphic JSON shapes.
 */
export function extractLyzrMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, any>;

  if (typeof d.response === "string") return d.response;
  if (d.response?.message) return String(d.response.message);
  if (d.response?.result?.message) return String(d.response.result.message);
  if (d.response?.result?.text) return String(d.response.result.text);
  if (d.response?.result?.answer) return String(d.response.result.answer);
  if (d.response?.data) return String(d.response.data);
  if (typeof d.message === "string") return d.message;
  if (d.choices?.[0]?.message?.content) return String(d.choices[0].message.content);
  if (typeof d.result === "string") return d.result;
  if (typeof d.output === "string") return d.output;
  return "";
}

/**
 * Try to pull a JSON object out of a (possibly markdown-wrapped) string.
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();
  try {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {
    /* not valid JSON */
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main entry point ────────────────────────────────────────────────────────────

/**
 * Call a Lyzr agent via the v3 inference chat endpoint.
 *
 * Resolves all configuration lazily at call time so `next build` never
 * evaluates `requireEnv()` at module-load scope.
 */
export async function callLyzrAgent(
  opts: LyzrCallOptions
): Promise<LyzrCallResult> {
  const { chatUrl, apiKey } = getLyzrConfig();

  if (!chatUrl) {
    return { response: "", raw: null, ok: false, parsedJson: null, error: "LYZR_API_URL not configured" };
  }
  if (!apiKey) {
    return { response: "", raw: null, ok: false, parsedJson: null, error: "LYZR_API_KEY not configured" };
  }

  const maxRetries = opts.maxRetries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const payload: Record<string, unknown> = {
    user_id: opts.userId || "priceos-user",
    agent_id: opts.agentId,
    session_id: opts.sessionId || `session-${Date.now()}`,
    message: opts.message,
  };
  if (opts.systemPromptVariables) payload.system_prompt_variables = opts.systemPromptVariables;
  if (opts.filterVariables) payload.filter_variables = opts.filterVariables;
  if (opts.features) payload.features = opts.features;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.log(`[LyzrClient] Retry ${attempt}/${maxRetries} after ${backoff}ms…`);
      await sleep(backoff);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `Lyzr API ${res.status}: ${errText.substring(0, 300)}`;
        if (res.status >= 500) continue; // transient — retry
        return { response: "", raw: null, ok: false, parsedJson: null, error: lastError };
      }

      const data = await res.json();
      let message = extractLyzrMessage(data);

      if (message && isToolLoopError(message)) {
        message = TOOL_LOOP_FALLBACK;
      }

      const parsedJson = message ? extractJson(message) : null;

      return { response: message, raw: data, ok: true, parsedJson };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        lastError = `Lyzr API timed out after ${timeoutMs}ms`;
      } else {
        lastError = err instanceof Error ? err.message : String(err);
      }
      if (attempt < maxRetries) continue;
    }
  }

  return { response: "", raw: null, ok: false, parsedJson: null, error: lastError || "Unknown error" };
}

/**
 * Convenience: get Lyzr headers for non-agent calls (contexts, RAG, uploads).
 * Returns null when API key is missing.
 */
export function getLyzrHeaders(): Record<string, string> | null {
  const { apiKey } = getLyzrConfig();
  if (!apiKey) return null;
  return { "Content-Type": "application/json", "x-api-key": apiKey };
}
