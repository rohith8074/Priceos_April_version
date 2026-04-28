"use client";

// JWT auth is server-side only via httpOnly cookie.
// This client stub keeps any imports from breaking.
export const authClient = {
  getSession: async () => ({ data: null, error: null }),
};

/**
 * Returns the current org's ID from localStorage.
 * Prefers the directly stored priceos-orgId key (set at login).
 * Falls back to decoding it from the JWT if needed.
 */
export function getOrgId(): string | null {
  if (typeof window === "undefined") return null;
  // Fastest path: orgId stored directly at login
  const direct = localStorage.getItem("priceos-orgId");
  if (direct) return direct;
  // Fallback: decode from JWT (uses atob for universal browser support)
  const token = localStorage.getItem("priceos-token");
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return (payload.orgId as string) ?? null;
  } catch {
    return null;
  }
}
