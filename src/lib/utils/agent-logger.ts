/**
 * agent-logger.ts
 *
 * Reusable, fail-safe logger for observing everything that flows through the
 * Lyzr agents: user input, the full context sent to the agent, the agent's
 * response, every tool call + returned data, timings, and errors.
 *
 * Two sinks:
 *   1. Server console — single readable line per event (surfaces in terminal /
 *      ngrok / Vercel logs). Gated behind AGENT_DEBUG_LOGS (on unless "false").
 *   2. MongoDB collection `agent_logs` — best-effort persistence for later
 *      review. Reuses the app's existing mongoose connection.
 *
 * Logging is NEVER allowed to break a request: every console write and every DB
 * write is wrapped in try/catch.
 */

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/mongodb";

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_FIELD_CHARS = 2000;
const REDACT_KEYS = ["apikey", "api_key", "authorization", "token", "jwt_secret", "password"];

/** Verbose console logging is ON unless AGENT_DEBUG_LOGS is explicitly "false". */
function consoleEnabled(): boolean {
  return String(process.env.AGENT_DEBUG_LOGS ?? "").toLowerCase() !== "false";
}

// ── Types ───────────────────────────────────────────────────────────────────

export type AgentLogEvent =
  | "CHAT-IN"
  | "CHAT-OUT"
  | "TOOL-CALL"
  | "TOOL-RESP"
  | "ERROR";

interface ChatInputArgs {
  traceId: string;
  route: string;
  orgId?: string;
  listingId?: string | null;
  userMessage?: string;
  context?: unknown;
}

interface ChatResponseArgs {
  traceId: string;
  route: string;
  status?: number | string;
  durationMs?: number;
  response?: unknown;
  error?: unknown;
}

interface ToolCallArgs {
  traceId: string;
  tool: string;
  method: string;
  path?: string;
  query?: unknown;
  body?: unknown;
}

interface ToolResponseArgs {
  traceId: string;
  tool: string;
  status?: number | string;
  durationMs?: number;
  data?: unknown;
  error?: unknown;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Short random id to correlate all logs for a single request. */
export function newTraceId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

const EMOJI: Record<AgentLogEvent, string> = {
  "CHAT-IN": "🟦 CHAT-IN",
  "CHAT-OUT": "🟩 CHAT-OUT",
  "TOOL-CALL": "🛠️ TOOL-CALL",
  "TOOL-RESP": "📤 TOOL-RESP",
  ERROR: "❌ ERROR",
};

/**
 * Deep-clone a value while redacting secret-ish keys and truncating long
 * strings. Returns a JSON-safe structure (never throws).
 */
function sanitize(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  try {
    if (value == null) return value;
    if (typeof value === "string") return truncate(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((v) => sanitize(v, seen));
    }
    if (typeof value === "object") {
      if (seen.has(value as object)) return "[circular]";
      seen.add(value as object);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (REDACT_KEYS.includes(k.toLowerCase())) {
          out[k] = "***";
        } else {
          out[k] = sanitize(v, seen);
        }
      }
      return out;
    }
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

/** Truncate a string longer than MAX_FIELD_CHARS with a clear suffix. */
function truncate(s: string): string {
  if (s.length <= MAX_FIELD_CHARS) return s;
  const extra = s.length - MAX_FIELD_CHARS;
  return `${s.slice(0, MAX_FIELD_CHARS)}...[truncated ${extra} chars]`;
}

/** Compact-but-readable JSON string, also length-capped. */
function compactJson(value: unknown): string {
  let str: string;
  try {
    str = JSON.stringify(sanitize(value));
  } catch {
    str = "[unserializable]";
  }
  if (str == null) str = "undefined";
  return truncate(str);
}

function serializeError(err: unknown): unknown {
  if (!err) return err;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: truncate(err.stack || "") };
  }
  return sanitize(err);
}

// ── Persistence (best-effort) ─────────────────────────────────────────────────

interface AgentLogDoc {
  traceId: string;
  event: AgentLogEvent;
  timestamp: Date;
  route?: string;
  tool?: string;
  durationMs?: number;
  status?: number | string;
  payload?: unknown;
}

/**
 * Persist a log entry to the `agent_logs` collection. Reuses the existing
 * mongoose connection. Fully wrapped — failures are swallowed so logging never
 * breaks a request.
 */
async function persist(doc: AgentLogDoc): Promise<void> {
  try {
    await connectToDatabase();
    const conn = mongoose.connection;
    if (!conn || !conn.db) return;
    await conn.db.collection("agent_logs").insertOne({
      ...doc,
      payload: sanitize(doc.payload),
    });
  } catch {
    // Never let persistence break the request — swallow silently.
  }
}

// ── Core emit ──────────────────────────────────────────────────────────────────

/**
 * Generic logger. Writes one readable console line and fires a best-effort
 * (non-awaited) DB write. Safe to call from any handler.
 */
export function agentLog(event: AgentLogEvent, payload: Record<string, unknown>): void {
  const ts = nowIso();
  const traceId = String(payload.traceId ?? "");

  // 1) Console — clean and understandable multi-line format
  try {
    if (consoleEnabled()) {
      const prefix = EMOJI[event] || event;
      let logOutput = `\\n╭── ${prefix} [${traceId}] ──────────────────────────────\\n`;
      
      if (event === "CHAT-IN") {
        logOutput += `│ Agent Calling : ${payload.route || "Unknown"}\\n`;
        logOutput += `│ Agent Input   : ${payload.userMessage || "N/A"}\\n`;
        if (payload.context) logOutput += `│ Context       : ${compactJson(payload.context)}\\n`;
      } else if (event === "CHAT-OUT") {
        logOutput += `│ Agent         : ${payload.route || "Unknown"}\\n`;
        logOutput += `│ Duration      : ${payload.durationMs}ms\\n`;
        logOutput += `│ Agent Output  : ${payload.response || "N/A"}\\n`;
      } else if (event === "TOOL-CALL") {
        logOutput += `│ Tool Call     : ${payload.tool}\\n`;
        const toolInput = payload.query && Object.keys(payload.query as object).length ? payload.query : payload.body;
        logOutput += `│ Input Data    : ${JSON.stringify(toolInput)}\\n`;
      } else if (event === "TOOL-RESP") {
        logOutput += `│ Tool Call     : ${payload.tool}\\n`;
        logOutput += `│ Duration      : ${payload.durationMs}ms\\n`;
        logOutput += `│ Tool Call Data: ${compactJson(payload.data)}\\n`;
      } else if (event === "ERROR") {
        logOutput += `│ Error         : ${compactJson(payload.error)}\\n`;
        if (payload.route) logOutput += `│ Route         : ${payload.route}\\n`;
        if (payload.tool) logOutput += `│ Tool          : ${payload.tool}\\n`;
      } else {
        const { traceId: _t, ...rest } = payload;
        logOutput += `│ Data          : ${compactJson(rest)}\\n`;
      }
      
      logOutput += `╰──────────────────────────────────────────────────────────`;
      
      if (event === "ERROR") {
        console.error(logOutput);
      } else {
        console.log(logOutput);
      }
    }
  } catch {
    // ignore console failures
  }

  // 2) DB — best-effort, never awaited by the caller.
  try {
    void persist({
      traceId,
      event,
      timestamp: new Date(ts),
      route: typeof payload.route === "string" ? payload.route : undefined,
      tool: typeof payload.tool === "string" ? payload.tool : undefined,
      durationMs: typeof payload.durationMs === "number" ? payload.durationMs : undefined,
      status: payload.status as number | string | undefined,
      payload,
    });
  } catch {
    // ignore persistence scheduling failures
  }
}

// ── Public typed wrappers ───────────────────────────────────────────────────────

/** Log the user's input + the full context object sent to the agent. */
export function logChatInput(args: ChatInputArgs): void {
  agentLog("CHAT-IN", {
    traceId: args.traceId,
    route: args.route,
    orgId: args.orgId,
    listingId: args.listingId,
    userMessage: args.userMessage,
    context: args.context,
  });
}

/** Log the agent's response (or error), status, and duration. */
export function logChatResponse(args: ChatResponseArgs): void {
  const event: AgentLogEvent = args.error ? "ERROR" : "CHAT-OUT";
  agentLog(event, {
    traceId: args.traceId,
    route: args.route,
    status: args.status,
    durationMs: args.durationMs,
    response: args.response,
    error: serializeError(args.error),
  });
}

/** Log an outgoing tool invocation (which tool, with what params). */
export function logToolCall(args: ToolCallArgs): void {
  agentLog("TOOL-CALL", {
    traceId: args.traceId,
    tool: args.tool,
    method: args.method,
    path: args.path,
    query: args.query,
    body: args.body,
  });
}

/** Log a tool's returned data (or error), status, and duration. */
export function logToolResponse(args: ToolResponseArgs): void {
  const event: AgentLogEvent = args.error ? "ERROR" : "TOOL-RESP";
  agentLog(event, {
    traceId: args.traceId,
    tool: args.tool,
    status: args.status,
    durationMs: args.durationMs,
    data: args.data,
    error: serializeError(args.error),
  });
}
