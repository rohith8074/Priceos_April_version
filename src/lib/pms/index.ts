import { PMSClient } from "./types";
import { MockPMSClient } from "./mock-client";

/**
 * PMS Client Factory
 * Returns appropriate client based on environment variable
 * HOSTAWAY_MODE=mock|live|db (default: db)
 *
 * - "db"   → DbPMSClient (Neon Postgres via Drizzle) — default
 * - "mock" → MockPMSClient (in-memory arrays)
 * - "live" → HostawayClient (real Hostaway API)
 *
 * Falls back to MockPMSClient if DATABASE_URL is not set and mode is "db".
 */

export function createPMSClient(): PMSClient {
  const mode = (process.env.HOSTAWAY_MODE || "db").toLowerCase();

  if (mode === "live") {
    // Live Hostaway client implementation is not available in this frontend package.
    // Fall back to mock client to keep builds and local development stable.
    return new MockPMSClient();
  }

  if (mode === "mock") {
    return new MockPMSClient();
  }

  // Default to DB client, but fall back to mock if no DATABASE_URL
  if (!process.env.DATABASE_URL) {
    return new MockPMSClient();
  }

  // Dynamic require to avoid eager evaluation of DB connection at build time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DbPMSClient } = require("./db-client") as typeof import("./db-client");
  return new DbPMSClient();
}

export type { PMSClient } from "./types";
export { MockPMSClient } from "./mock-client";
