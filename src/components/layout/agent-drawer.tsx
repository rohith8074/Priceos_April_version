"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AgentDrawer() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div
      className={cn(
        "relative flex flex-col border-l border-border-default bg-surface-1 transition-all duration-300 ease-in-out z-40",
        isOpen ? "w-[360px]" : "w-12"
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-3 top-12 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-surface-2 text-text-secondary hover:text-amber transition-colors shadow-sm z-50"
      >
        {isOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {isOpen ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border-subtle">
            <Sparkles className="h-4 w-4 text-amber" />
            <span className="text-title font-semibold text-text-primary">PriceOS Agent</span>
          </div>

          {/* Content (Placeholder for now) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="rounded-lg bg-surface-2 border border-border-subtle p-4">
              <p className="text-body text-text-secondary">
                Hello! I am your PriceOS Agent. I can help you analyze market trends, 
                detect anomalies in your pricing, and provide insights.
              </p>
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold uppercase tracking-widest text-text-tertiary">Quick Actions</span>
              <div className="grid grid-cols-1 gap-2">
                {["Summarize detector signals", "Scan for revenue gaps", "Compare with competitors"].map((action) => (
                  <button
                    key={action}
                    className="text-left px-3 py-2 text-body-xs rounded-md bg-surface-2 border border-border-subtle text-text-secondary hover:text-amber hover:border-amber/30 transition-all"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input Placeholder */}
          <div className="p-4 border-t border-border-subtle">
            <div className="relative">
              <input
                type="text"
                placeholder="Ask anything..."
                className="w-full bg-surface-2 border border-border-subtle rounded-lg px-4 py-2 text-body-xs text-text-primary focus:outline-none focus:border-amber/50 placeholder:text-text-disabled"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-4 gap-4">
          <Sparkles className="h-5 w-5 text-text-tertiary" />
        </div>
      )}
    </div>
  );
}
