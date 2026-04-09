"use client";

// JWT auth is server-side only via httpOnly cookie.
// This client stub keeps any imports from breaking.
export const authClient = {
  getSession: async () => ({ data: null, error: null }),
};
