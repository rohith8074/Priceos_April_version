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
 * Returns cached token if still valid; otherwise fetches a new one and saves it.
 */
export async function getOrgHostawayToken(orgId: string): Promise<string> {
  await connectToDatabase();

  const org = await Organization.findById(orgId).select(
    "hostawayApiKey hostawayAccountId hostawayToken hostawayTokenExpiresAt"
  ).lean() as any;

  if (!org?.hostawayApiKey || !org?.hostawayAccountId) {
    throw new Error("Hostaway credentials not configured for this organization.");
  }

  // Return cached token if still valid
  if (org.hostawayToken && org.hostawayTokenExpiresAt) {
    const expiresAt = new Date(org.hostawayTokenExpiresAt).getTime();
    if (expiresAt - TOKEN_BUFFER_MS > Date.now()) {
      return org.hostawayToken;
    }
  }

  // Fetch new token
  const tokenData = await fetchHostawayToken(org.hostawayAccountId, org.hostawayApiKey);
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  await Organization.findByIdAndUpdate(orgId, {
    hostawayToken: tokenData.access_token,
    hostawayTokenExpiresAt: expiresAt,
  });

  return tokenData.access_token;
}
