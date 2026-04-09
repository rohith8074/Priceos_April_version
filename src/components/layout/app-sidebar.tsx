"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Globe,
  MessageSquare,
  Database,
  Cpu,
  Activity,
  Lightbulb,
  Settings,
  HelpCircle,
  LogOut,
  Sun,
  Moon,
  Bot,
  Users,
  MessagesSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

const BUSINESS_GROUP = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pricing", href: "/pricing", icon: TrendingUp },
  { name: "Market", href: "/market", icon: Globe },
  { name: "Agent Chat", href: "/agent-chat", icon: MessagesSquare },
  { name: "Guest Inbox", href: "/guest-chat", icon: MessageSquare },
];

const PIPELINE_GROUP = [
  { name: "Agents", href: "/agents", icon: Bot, showAgentBadge: true },
  { name: "Sources", href: "/sync?tab=sources", icon: Database },
  { name: "Detectors", href: "/sync?tab=detectors", icon: Cpu },
  { name: "Signals", href: "/sync?tab=signals", icon: Activity },
  { name: "Insights", href: "/insights", icon: Lightbulb, showBadge: true },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pendingProposals, setPendingProposals] = useState(0);
  const [pendingInsightsCount, setPendingInsightsCount] = useState(0);
  const [warningAgents, setWarningAgents] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/agents/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setPendingProposals(data.summary?.pendingProposals ?? 0);
        setPendingInsightsCount(data.summary?.criticalInsights ?? 0);
        setWarningAgents(
          (data.summary?.warningCount ?? 0) + (data.summary?.errorCount ?? 0)
        );
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";

    if (href.includes("?")) {
      const [path, query] = href.split("?");
      if (pathname !== path) return false;
      const urlParams = new URLSearchParams(query);
      for (const [key, value] of urlParams.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
      return true;
    }

    return pathname.startsWith(href);
  };

  const NavItem = ({
    name,
    href,
    icon: Icon,
    showBadge,
    showAgentBadge,
  }: {
    name: string;
    href: string;
    icon: any;
    showBadge?: boolean;
    showAgentBadge?: boolean;
  }) => {
    const active = isActive(href);

    const insightsBadgeCount = showBadge ? pendingInsightsCount + pendingProposals : 0;
    const agentBadgeCount = showAgentBadge ? warningAgents : 0;

    return (
      <Link
        href={href}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2 text-body transition-colors duration-200 rounded-md mx-2",
          active
            ? "text-amber bg-amber-dim"
            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
        )}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-amber rounded-r-full" />
        )}
        <Icon className={cn("h-4 w-4", active ? "text-amber" : "text-text-tertiary group-hover:text-text-secondary")} />
        <span className="flex-1 truncate">{name}</span>
        {insightsBadgeCount > 0 && (
          <Badge className="bg-amber text-black hover:bg-amber/90 px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold border-none">
            {insightsBadgeCount}
          </Badge>
        )}
        {agentBadgeCount > 0 && (
          <Badge className="bg-red-500/80 text-white hover:bg-red-500/70 px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold border-none">
            {agentBadgeCount}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-[232px] flex-col border-r border-border-default bg-surface-1 shrink-0 z-50">
      {/* Header */}
      <div className="px-6 py-6 pb-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xl font-bold tracking-tight text-amber">PriceOS</span>
          <span className="text-body-xs text-text-tertiary">Revenue Intelligence</span>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex flex-1 flex-col gap-6 py-4 overflow-y-auto custom-scrollbar">
        {/* GROUP 1 — BUSINESS */}
        <div className="flex flex-col gap-1">
          <div className="px-6 mb-1">
            <span className="text-2xs font-bold uppercase tracking-widest text-text-disabled">Business</span>
          </div>
          {BUSINESS_GROUP.map((item) => (
            <NavItem key={item.name} {...item} />
          ))}
        </div>

        {/* GROUP 2 — PIPELINE */}
        <div className="flex flex-col gap-1">
          <div className="px-6 mb-1">
            <span className="text-2xs font-bold uppercase tracking-widest text-text-disabled">Pipeline</span>
          </div>
          {PIPELINE_GROUP.map((item) => (
            <NavItem key={item.name} {...item} />
          ))}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="pt-4 pb-6 flex flex-col gap-1 border-t border-border-subtle">
        <NavItem name="User Management" href="/users" icon={Users} />
        <NavItem name="Settings" href="/settings" icon={Settings} />
        <button
          onClick={() => {}}
          className="group flex items-center gap-3 px-3 py-2 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors duration-200 rounded-md mx-2"
        >
          <HelpCircle className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary" />
          <span>How it works</span>
        </button>
        <button
          onClick={() => {
            router.push("/api/auth/logout");
          }}
          className="group flex items-center gap-3 px-3 py-2 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors duration-200 rounded-md mx-2"
        >
          <LogOut className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary" />
          <span>Logout</span>
        </button>

        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="group flex items-center gap-3 px-3 py-2 text-body text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors duration-200 rounded-md mx-2 mt-2 border border-border-subtle/50"
          >
            <div className="relative h-4 w-4">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber" />
              <Moon className="absolute inset-0 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-amber" />
            </div>
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
