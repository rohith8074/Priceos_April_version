"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Globe,
  MessageSquare,
  Settings,
  LogOut,
  Sun,
  Moon,
  Users,
  MessagesSquare,
  Home,
  Bell,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BUSINESS_GROUP = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pricing", href: "/pricing", icon: TrendingUp },
  { name: "Market", href: "/market", icon: Globe },
  { name: "Agent Chat", href: "/agent-chat", icon: MessagesSquare },
  { name: "Guest Inbox", href: "/guest-chat", icon: MessageSquare, showGuestBadge: true },
  { name: "Properties", href: "/properties", icon: Home },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [needsReplyCount, setNeedsReplyCount] = useState(0);
  const [todayEvents, setTodayEvents] = useState<
    { id: string; name: string; impactLevel: "high" | "medium" | "low"; upliftPct: number; area?: string; source?: string }[]
  >([]);

  useEffect(() => { setMounted(true); }, []);

  // Guest inbox unread count from Hostaway conversations
  useEffect(() => {
    fetch("/api/hostaway/conversations/cached")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const count = (data.conversations ?? []).filter(
          (c: any) => c.unread || c.needsReply
        ).length;
        setNeedsReplyCount(count);
      })
      .catch(() => {});
  }, []);

  // Today's events notification
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/events?dateFrom=${today}&dateTo=${today}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.events) return;
        const items = (data.events as any[])
          .filter((e) => e?.isActive !== false)
          .map((e) => ({
            id: String(e._id || `${e.name}-${e.startDate}`),
            name: e.name || "Untitled Event",
            impactLevel: (e.impactLevel || "low") as "high" | "medium" | "low",
            upliftPct: Number(e.upliftPct || 0),
            area: e.area || (Array.isArray(e.areas) ? e.areas[0] : undefined),
            source: e.source || "market_template",
          }));
        setTodayEvents(items);
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
    showGuestBadge,
  }: {
    name: string;
    href: string;
    icon: any;
    showGuestBadge?: boolean;
  }) => {
    const active = isActive(href);
    const guestBadgeCount = showGuestBadge ? needsReplyCount : 0;

    const tourId = name === "Dashboard" ? "tour-sidebar-dashboard" 
                 : name === "Pricing" ? "tour-sidebar-pricing" 
                 : name === "Market" ? "tour-sidebar-market" 
                 : undefined;

    return (
      <Link
        href={href}
        id={tourId}
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
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-amber" : "text-text-tertiary group-hover:text-text-secondary")} />
        <span className="flex-1 truncate">{name}</span>

        {guestBadgeCount > 0 && (
          <Badge className="bg-blue-500/80 text-white px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold border-none">
            {guestBadgeCount}
          </Badge>
        )}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-[232px] flex-col border-r border-border-default bg-surface-1 shrink-0 z-50">
      {/* Header */}
      <div className="px-6 py-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-bold tracking-tight text-amber">PriceOS</span>
            <span className="text-body-xs text-text-tertiary">Revenue Intelligence</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="relative h-9 w-9 rounded-md border border-border-subtle bg-surface-2/60 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex items-center justify-center"
                title="Today's events"
              >
                <Bell className="h-4 w-4" />
                {todayEvents.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-black text-[10px] font-bold leading-4 text-center">
                    {todayEvents.length > 9 ? "9+" : todayEvents.length}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border-subtle bg-surface-1">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-amber" />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Today&apos;s Events
                  </span>
                </div>
                <p className="text-[11px] text-text-tertiary mt-1">
                  {todayEvents.length === 0
                    ? "No major events for today."
                    : `${todayEvents.length} event${todayEvents.length > 1 ? "s" : ""} may influence demand.`}
                </p>
              </div>

              <div className="max-h-72 overflow-y-auto">
                {todayEvents.length === 0 ? (
                  <div className="px-3 py-4 text-[12px] text-text-tertiary">
                    No active events today. Demand should follow base seasonality.
                  </div>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {todayEvents.slice(0, 8).map((event) => (
                      <button
                        key={event.id}
                        onClick={() => router.push("/market?focus=today")}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-2/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[12px] font-medium text-text-primary leading-snug">{event.name}</p>
                          <Badge
                            className={cn(
                              "text-[10px] border-none h-5",
                              event.impactLevel === "high"
                                ? "bg-red-500/15 text-red-400"
                                : event.impactLevel === "medium"
                                  ? "bg-amber-500/15 text-amber-400"
                                  : "bg-blue-500/15 text-blue-400"
                            )}
                          >
                            {event.impactLevel}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-text-tertiary">
                          <span className="inline-flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" /> +{event.upliftPct}%
                          </span>
                          {event.area && <span>{event.area}</span>}
                          <span className="uppercase">{event.source}</span>
                        </div>
                      </button>
                    ))}
                    {todayEvents.length > 8 && (
                      <div className="px-3 py-2 text-[10px] text-text-tertiary bg-surface-1">
                        +{todayEvents.length - 8} more events in Market page
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-border-subtle bg-surface-1">
                <button
                  onClick={() => router.push("/market?focus=today")}
                  className="text-[11px] text-amber hover:text-amber/80 font-medium"
                >
                  Open Market page for today&apos;s events
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col gap-6 py-4 overflow-y-auto custom-scrollbar">
        {/* BUSINESS */}
        <div className="flex flex-col gap-1">
          <div className="px-6 mb-1">
            <span className="text-2xs font-bold uppercase tracking-widest text-text-disabled">Business</span>
          </div>
          {BUSINESS_GROUP.map((item) => (
            <NavItem key={item.name} {...item} />
          ))}
        </div>

      </div>

      {/* Bottom */}
      <div className="pt-4 pb-6 flex flex-col gap-1 border-t border-border-subtle">
        <NavItem name="User Management" href="/users" icon={Users} />
        <NavItem name="Settings" href="/settings" icon={Settings} />
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
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
