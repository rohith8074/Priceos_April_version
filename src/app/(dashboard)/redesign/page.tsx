"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AgentChatV2 } from "@/components/redesign/agent-chat-v2";
import { GuestInboxV2 } from "@/components/redesign/guest-inbox-v2";
import { Badge } from "@/components/ui/badge";
import { Bot, Inbox, Sparkles, ChevronRight, ArrowRight } from "lucide-react";

const TABS = [
  {
    id: "agent-chat",
    label: "Agent Chat",
    icon: Bot,
    description: "Redesigned with thread history, suggested prompts, and live inference steps",
    improvements: [
      "Persistent conversation thread history in left sidebar",
      "Live AI inference steps shown while thinking",
      "Contextual suggested prompts to guide users",
      "Rich message bubbles with inline data visualizations",
      "Single-row header with real-time status indicator",
    ],
  },
  {
    id: "guest-inbox",
    label: "Guest Inbox",
    icon: Inbox,
    description: "Redesigned with enriched conversation cards, 3-panel layout, and AI draft replies",
    improvements: [
      "Enriched conversation cards with channel, check-in, unread, sentiment",
      "Search and filter bar (by channel, status, guest name)",
      "True 3-panel layout: conversations → messages → guest profile",
      "AI-generated contextual draft reply with feedback buttons",
      "Guest profile panel with booking details and AI insight",
    ],
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function RedesignPage() {
  const [activeTab, setActiveTab] = useState<TabId>("agent-chat");
  const tab = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto bg-background">
      {/* Banner */}
      <div className="shrink-0 bg-gradient-to-r from-amber/8 via-amber/5 to-transparent border-b border-amber/20 px-8 py-4">
        <div className="flex items-center gap-2.5 mb-1">
          <Sparkles className="h-4 w-4 text-amber" />
          <span className="text-xs font-semibold text-amber uppercase tracking-wider">Design Preview</span>
          <Badge variant="outline" className="text-[10px] border-amber/30 text-amber bg-amber/5 ml-1">
            Demo only · No data changed
          </Badge>
        </div>
        <p className="text-sm text-text-secondary max-w-2xl">
          Proposed UI/UX improvements for Agent Chat and Guest Inbox. All interactions use mock data and do not affect the live system.
        </p>
      </div>

      <div className="px-8 pt-6 pb-8 flex flex-col gap-6">
        {/* Tab Switcher */}
        <div className="flex items-center gap-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-semibold transition-all",
                activeTab === id
                  ? "bg-amber text-black border-amber shadow-md shadow-amber/20"
                  : "border-border-default text-text-secondary bg-surface-1 hover:bg-surface-2 hover:text-text-primary"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Improvement List */}
        <div className="rounded-xl border border-border-default bg-surface-1 px-5 py-4">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Key improvements in this redesign
          </p>
          <div className="flex flex-wrap gap-2">
            {tab.improvements.map((item) => (
              <div
                key={item}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber/20 bg-amber/5 text-[11px] text-text-secondary"
              >
                <ChevronRight className="h-3 w-3 text-amber shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Component Preview */}
        {activeTab === "agent-chat" && <AgentChatV2 />}
        {activeTab === "guest-inbox" && <GuestInboxV2 />}
      </div>
    </div>
  );
}
