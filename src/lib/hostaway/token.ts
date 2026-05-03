import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";

const HOSTAWAY_TOKEN_URL = "https://api.hostaway.com/v1/accessTokens";
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export interface HostawayTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Fetch a fresh OAuth token from Hostaway using accountId + apiSecret.
 */
export async function fetchHostawayToken(
  accountId: string,
  apiSecret: string
): Promise<HostawayTokenResponse> {
  const res = await fetch(HOSTAWAY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: accountId,
      client_secret: apiSecret,
      scope: "general",
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Hostaway OAuth error ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * Get a valid Hostaway bearer token for an org.
 *
 * Handles two cases automatically:
 *  A) hostawayApiKey is a short hex key (OAuth client_secret) → exchange for token via /v1/accessTokens
 *  B) hostawayApiKey is a pre-issued JWT (starts with "eyJ") → use it directly as bearer token
 *
 * In both cases the active token is cached in hostawayToken to avoid repeat calls.
 */
export async function getOrgHostawayToken(orgId: string): Promise<string> {
  await connectToDatabase();

  const org = await Organization.findById(orgId).select(
    "hostawayApiKey hostawayAccountId hostawayToken hostawayTokenExpiresAt"
  ).lean() as any;

  if (!org?.hostawayApiKey || !org?.hostawayAccountId) {
    throw new Error("Hostaway credentials not configured for this organization.");
  }

  // Case B: stored value is already a JWT bearer token (pre-issued from Hostaway dashboard)
  const isJwtToken = (org.hostawayApiKey as string).startsWith("eyJ");
  if (isJwtToken) {
    // Parse exp from JWT payload to check validity (no library needed — just base64 decode)
    try {
      const parts = (org.hostawayApiKey as string).split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      const expMs = (payload.exp as number) * 1000;
      if (expMs - TOKEN_BUFFER_MS > Date.now()) {
        // JWT is still valid — cache and return it
        await Organization.findByIdAndUpdate(orgId, {
          hostawayToken: org.hostawayApiKey,
          hostawayTokenExpiresAt: new Date(expMs),
        });
        return org.hostawayApiKey as string;
      }
      // JWT is expired — nothing we can do without a new one
      throw new Error("The saved Hostaway token has expired. Please update your API credentials in Settings.");
    } catch (parseErr: any) {
      if (parseErr.message.includes("expired")) throw parseErr;
      // Malformed JWT — fall through to OAuth attempt
    }
  }

  // Case A: short hex key — use cached token if still valid
  if (!isJwtToken && org.hostawayToken && org.hostawayTokenExpiresAt) {
    const expiresAt = new Date(org.hostawayTokenExpiresAt).getTime();
    if (expiresAt - TOKEN_BUFFER_MS > Date.now()) {
      return org.hostawayToken as string;
    }
  }

  // Case A continued: fetch a new token via OAuth client_credentials
  const tokenData = await fetchHostawayToken(org.hostawayAccountId, org.hostawayApiKey);
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  await Organization.findByIdAndUpdate(orgId, {
    hostawayToken: tokenData.access_token,
    hostawayTokenExpiresAt: expiresAt,
  });

  return tokenData.access_token;
}
