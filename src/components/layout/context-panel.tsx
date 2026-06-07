"use client";

import { useState, useEffect } from "react";
import { CompactPropertyCard } from "./compact-property-card";
import { useContextStore } from "@/stores/context-store";
import { getOrgId } from "@/lib/auth/client";
import { useChatStore } from "@/stores/chat-store";
import { usePathname } from "next/navigation";
import type { PropertyWithMetrics } from "@/types";

interface Props {
  properties: PropertyWithMetrics[];
}

export function ContextPanel({ properties }: Props) {
  const {
    contextType,
    propertyId,
    setPortfolioContext,
    setPropertyContext,
    dateRange,
  } = useContextStore();
  const { switchContext } = useChatStore();
  const pathname = usePathname();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Per-property occupancy for the SELECTED date range, so the cards match what
  // the chat/agent sees (the static `property.occupancy` is a fixed next-30-day
  // figure computed server-side). Keyed by property id.
  const [rangeOcc, setRangeOcc] = useState<Record<string, number>>({});

  // Recompute card occupancy whenever the selected date range changes, using the
  // same /api/calendar-metrics endpoint the chat uses — keeps card & agent aligned.
  useEffect(() => {
    const from = dateRange?.from;
    const to = dateRange?.to;
    if (!from || !to || properties.length === 0) return;
    const fromStr = new Date(from).toISOString().split("T")[0];
    const toStr = new Date(to).toISOString().split("T")[0];
    let disposed = false;

    (async () => {
      const results = await Promise.all(
        properties.map(async (p) => {
          try {
            const res = await fetch(
              `/api/calendar-metrics?listingId=${p.id}&from=${fromStr}&to=${toStr}`
            );
            if (!res.ok) return [String(p.id), null] as const;
            const data = await res.json();
            const occ = typeof data.occupancy === "number" ? data.occupancy : null;
            return [String(p.id), occ] as const;
          } catch {
            return [String(p.id), null] as const;
          }
        })
      );
      if (disposed) return;
      const map: Record<string, number> = {};
      for (const [id, occ] of results) if (occ != null) map[id] = occ;
      setRangeOcc(map);
    })();

    return () => { disposed = true; };
  }, [dateRange?.from, dateRange?.to, properties]);

  // Fetch per-property unread message counts on the guest-chat page
  useEffect(() => {
    if (!pathname?.includes("guest-chat")) return;
    let disposed = false;

    const fetchCounts = async () => {
      try {
        const orgId = getOrgId();
        if (!orgId || disposed) return;
        const r = await fetch(`/api/hostaway/conversations/cached?orgId=${orgId}`);
        if (!r.ok || disposed) return;
        const data = await r.json();
        const counts: Record<string, number> = {};
        for (const c of data.conversations ?? []) {
          if (c.status === "needs_reply") {
            const lid = String(c.listingId || "");
            if (lid) counts[lid] = (counts[lid] ?? 0) + Math.max(1, c.unreadCount ?? 1);
          }
        }
        if (!disposed) setUnreadCounts(counts);
      } catch {
        // best-effort
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 60_000);
    return () => { disposed = true; clearInterval(interval); };
  }, [pathname]);

  const handlePortfolioClick = () => {
    setPortfolioContext();
    switchContext({ type: "portfolio" });
  };

  const handlePropertyClick = (property: PropertyWithMetrics) => {
    if (contextType === "property" && propertyId === property.id) {
      // Deselect: clicking the active property returns to portfolio view
      setPortfolioContext();
      switchContext({ type: "portfolio" });
    } else {
      setPropertyContext(property.id, property.name, (property as any).currencyCode || "AED");
      switchContext({ type: "property", propertyId: property.id });
    }
  };

  return (
    <aside className="flex h-full w-[280px] flex-col border-r bg-background shrink-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground font-semibold tracking-wider">
              Properties
            </span>
          </div>
        </div>

        {/* Properties List */}
        <div className="space-y-2">
          {properties.map((property) => (
            <CompactPropertyCard
              key={property.id}
              property={property}
              isActive={
                contextType === "property" && propertyId === property.id
              }
              onClick={() => handlePropertyClick(property)}
              occupancy={rangeOcc[String(property.id)] ?? property.occupancy ?? 0}
              unreadCount={unreadCounts[property.id] ?? 0}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
