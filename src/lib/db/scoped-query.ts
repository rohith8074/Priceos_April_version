/**
 * lib/db/scoped-query.ts
 * 
 * Agent Data Isolation Layer.
 * Each AI Agent has a strict allowlist of MongoDB collections it can read/write.
 * Agents cannot access data outside their permitted scope — even if called incorrectly.
 */

import { connectDB } from "@/lib/db";
import mongoose from "mongoose";

// ── Agent Scope Configuration ──────────────────────────────────────────────────
export const AGENT_SCOPES = {
  PricingAgent: {
    read: ["listings", "calendars", "market_templates", "pricingRules"],
    write: ["proposals"],
  },
  GuestAgent: {
    read: ["conversations", "reservations"],
    write: ["conversations"],
  },
  GuardrailAgent: {
    read: ["listings", "proposals"],
    write: ["proposals"],
  },
  BenchmarkAgent: {
    read: ["listings", "calendars", "reservations"],
    write: ["insights"],
  },
  FinanceModule: {
    read: ["financials", "reservations", "listings"],
    write: ["financials"],
  },
} as const;

export type AgentName = keyof typeof AGENT_SCOPES;

// ── Security Check ─────────────────────────────────────────────────────────────
function assertAccess(agent: AgentName, collection: string, mode: "read" | "write") {
  const scope = AGENT_SCOPES[agent];
  const allowed = mode === "read" ? scope.read : scope.write;

  if (!(allowed as readonly string[]).includes(collection)) {
    throw new Error(
      `[ScopedQuery] SECURITY: ${agent} is NOT allowed to ${mode} '${collection}'. ` +
      `Allowed ${mode}: [${allowed.join(", ")}]`
    );
  }
}

// ── Scoped Read ────────────────────────────────────────────────────────────────
export async function scopedRead<T = unknown>(
  agent: AgentName,
  collection: string,
  filter: Record<string, unknown> = {},
  limit = 500
): Promise<T[]> {
  assertAccess(agent, collection, "read");
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("[ScopedQuery] Database not connected");
  return db.collection(collection).find(filter).limit(limit).toArray() as Promise<T[]>;
}

// ── Scoped Write (Insert) ──────────────────────────────────────────────────────
export async function scopedWrite(
  agent: AgentName,
  collection: string,
  doc: Record<string, unknown>
): Promise<unknown> {
  assertAccess(agent, collection, "write");
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("[ScopedQuery] Database not connected");
  return db.collection(collection).insertOne({ ...doc, _createdByAgent: agent, _createdAt: new Date() });
}

// ── Scoped Update ──────────────────────────────────────────────────────────────
export async function scopedUpdate(
  agent: AgentName,
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<unknown> {
  assertAccess(agent, collection, "write");
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("[ScopedQuery] Database not connected");
  return db.collection(collection).updateMany(filter, { $set: { ...update, _lastModifiedByAgent: agent } });
}
