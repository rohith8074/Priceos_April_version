"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, Sliders } from "lucide-react";
import { PricingClient, ProposalData } from "./pricing-client";
import { PricingRulesStudio } from "@/components/pricing/pricing-rules-studio";

const TABS = [
  { id: "proposals", label: "Proposals", icon: FileText },
  { id: "rules", label: "Pricing Rules", icon: Sliders },
] as const;

type TabId = typeof TABS[number]["id"];

export function PricingPageTabs({
  initialProposals,
}: {
  initialProposals: ProposalData[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("proposals");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="px-8 pt-8 pb-0 shrink-0">
        <h1 className="text-3xl font-bold mb-1">Pricing Command Center</h1>
        <p className="text-muted-foreground text-sm max-w-2xl mb-6">
          Review and approve pending price changes proposed by the AI engines, and configure
          the rules that drive pricing decisions.
        </p>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border-default">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === id
                  ? "border-amber text-amber"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "proposals" && (
          <div className="p-8 pt-6">
            <PricingClient initialProposals={initialProposals} />
          </div>
        )}
        {activeTab === "rules" && (
          <div className="p-8 pt-6">
            <PricingRulesStudio />
          </div>
        )}
      </div>
    </div>
  );
}
