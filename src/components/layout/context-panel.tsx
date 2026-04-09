"use client";

import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompactPropertyCard } from "./compact-property-card";
import { useContextStore } from "@/stores/context-store";
import { useChatStore } from "@/stores/chat-store";
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
  } = useContextStore();
  const { switchContext } = useChatStore();

  const handlePortfolioClick = () => {
    setPortfolioContext();
    switchContext({ type: "portfolio" });
  };

  const handlePropertyClick = (property: PropertyWithMetrics) => {
    setPropertyContext(property.id, property.name);
    switchContext({ type: "property", propertyId: property.id });
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
              occupancy={property.occupancy || 0}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
