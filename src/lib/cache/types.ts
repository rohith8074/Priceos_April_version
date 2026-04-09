/**
 * Agent Cache Context Types
 * Defines the structure for cached Hostaway data injected into agent inference calls
 */

export interface AgentCacheContext {
  context: {
    type: "portfolio" | "property";
    propertyId?: string;
    propertyName?: string;
  };
  data: {
    listings: {
      count: number;
      lastSyncedAt: string | null; // ISO 8601
      isFresh: boolean; // <15 mins
    };
    reservations: {
      count: number;
      lastSyncedAt: string | null;
      isFresh: boolean;
    };
    calendar: {
      daysCount: number;
      lastSyncedAt: string | null;
      isFresh: boolean;
    };
  };
  meta: {
    cacheGeneratedAt: string; // ISO 8601
    isStale: boolean; // Any data type >15 mins
  };
}

export interface SyncStatusResponse {
  listings: {
    count: number;
    lastSyncedAt: string | null;
  };
  reservations: {
    count: number;
    lastSyncedAt: string | null;
  };
  inventory_master: {
    daysCount: number;
    lastSyncedAt: string | null;
  };
}
