/**
 * pms/hostaway-client.ts
 *
 * HostawayClient — server-side class for calling the Hostaway REST API directly.
 * Used by background-sync.ts (API routes / server code only).
 *
 * The standalone helper functions at the bottom are thin fetch wrappers used by
 * client-side components that route through /api/hostaway/*.
 */

const HOSTAWAY_BASE = "https://api.hostaway.com/v1";

export class HostawayClient {
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.Hostaway_Authorization_token || "";
    if (!this.token) {
      throw new Error("Hostaway token not configured. Set Hostaway_Authorization_token env var.");
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${HOSTAWAY_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Cache-control": "no-cache",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`Hostaway API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    // Hostaway wraps results in { result: [...] }
    return (json.result ?? json) as T;
  }

  async listListings(): Promise<any[]> {
    let allListings: any[] = [];
    let offset = 0;
    const limit = 100;
    
    while (true) {
      const data = await this.request<any>(`/listings?limit=${limit}&offset=${offset}&includeResources=0`);
      if (!Array.isArray(data) || data.length === 0) break;
      allListings = [...allListings, ...data];
      if (data.length < limit) break;
      offset += limit;
    }
    
    return allListings;
  }

  async getCalendar(
    listingMapId: number,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const data = await this.request<any>(
      `/listings/${listingMapId}/calendar?startDate=${startDate}&endDate=${endDate}`
    );
    return Array.isArray(data) ? data : [];
  }

  async getReservations(params?: { limit?: number; offset?: number }): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const data = await this.request<any>(`/reservations?${qs.toString()}`);
    return Array.isArray(data) ? data : [];
  }

  async getConversations(params?: { listingMapId?: number; limit?: number }): Promise<any[]> {
    const qs = new URLSearchParams();
    if (params?.listingMapId) qs.set("listingMapId", String(params.listingMapId));
    if (params?.limit) qs.set("limit", String(params.limit));
    const data = await this.request<any>(`/conversations?${qs.toString()}`);
    return Array.isArray(data) ? data : [];
  }

  async getMessages(conversationId: number): Promise<any[]> {
    const data = await this.request<any>(`/conversations/${conversationId}/messages`);
    return Array.isArray(data) ? data : [];
  }

  async sendMessage(conversationId: number, message: string): Promise<any> {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body: message }),
    });
  }
}

// ── Client-side proxy helpers (route through /api/hostaway/*) ────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api";

async function hostawayProxy<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/hostaway${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`Hostaway proxy error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getHostawayConversations(listingId?: string) {
  const q = listingId ? `?listingId=${listingId}` : "";
  return hostawayProxy(`/conversations${q}`);
}

export async function getCachedConversations(listingId?: string) {
  const q = listingId ? `?listingId=${listingId}` : "";
  return hostawayProxy(`/conversations/cached${q}`);
}

export async function getConversationSummary(listingId: string) {
  return hostawayProxy(`/summary?listingId=${listingId}`);
}

export async function suggestReply(params: {
  conversationId: string;
  guestMessage: string;
  guestName: string;
  propertyName?: string;
}) {
  return hostawayProxy(`/suggest-reply`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function sendReply(params: {
  conversationId: string;
  message: string;
  listingId?: string;
}) {
  return hostawayProxy(`/reply`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getHostawayMetadata(params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  return hostawayProxy(`/metadata?${q}`);
}
