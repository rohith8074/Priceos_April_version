"use client";

import { useState } from "react";
import {
  Calendar,
  TrendingUp,
  RefreshCw,
  Globe,
  AlertTriangle,
  Star,
  ChevronRight,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MarketEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  category: string;
}

interface Props {
  events: MarketEvent[];
  occupancyPct: number;
  avgNightly: number;
}

const IMPACT_STYLES: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-green-500/10 text-green-400 border-green-500/20",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr + "T00:00:00").getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Ongoing";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days}d`;
}

export function MarketIntelligenceClient({ events, occupancyPct, avgNightly }: Props) {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "market" }),
      });
      if (res.ok) {
        setLastScan(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
        toast.success("Market analysis triggered — data will refresh shortly.");
      } else {
        toast.error("Failed to trigger market analysis.");
      }
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setScanning(false);
    }
  };

  const upcomingHigh = events.filter((e) => e.impact === "high");
  const upcomingMedium = events.filter((e) => e.impact === "medium");

  return (
    <div className="p-8 max-w-6xl space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Market Intelligence</h1>
          <p className="text-text-secondary text-sm flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Your market — live events, demand signals, and comp positioning
            {lastScan && <span className="text-text-tertiary">· Updated at {lastScan}</span>}
          </p>
        </div>
        <Button
          onClick={handleRunAnalysis}
          disabled={scanning}
          className="bg-amber text-black hover:bg-amber/90 gap-2 shrink-0"
        >
          {scanning ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {scanning ? "Scanning…" : "Run Market Analysis"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: "Portfolio Occupancy",
            value: `${occupancyPct}%`,
            sub: "Next 30 days",
            icon: BarChart2,
            color: occupancyPct > 70 ? "text-green-400" : occupancyPct > 40 ? "text-amber-400" : "text-red-400",
          },
          {
            label: "Avg Nightly Rate",
            value: avgNightly > 0 ? `AED ${avgNightly.toLocaleString("en-US")}` : "—",
            sub: "Portfolio average",
            icon: TrendingUp,
            color: "text-blue-400",
          },
          {
            label: "High-Impact Events",
            value: upcomingHigh.length,
            sub: "Next 90 days",
            icon: Star,
            color: "text-red-400",
          },
          {
            label: "Total Events",
            value: events.length,
            sub: "Next 90 days",
            icon: Calendar,
            color: "text-amber-400",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">{kpi.label}</span>
              <kpi.icon className={cn("h-4 w-4", kpi.color)} />
            </div>
            <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>{kpi.value}</div>
            <div className="text-[11px] text-text-disabled">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Event Timeline */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Event Calendar</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Next 90 days · {events.length} events</p>
          </div>
          {upcomingHigh.length > 0 && (
            <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">
              {upcomingHigh.length} high-impact
            </Badge>
          )}
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Calendar className="h-8 w-8 text-text-disabled" />
            <p className="text-text-tertiary text-sm">No events in the next 90 days.</p>
            <p className="text-text-disabled text-xs">Run Market Analysis to fetch live event data.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
              >
                {/* Date Badge */}
                <div className="w-14 shrink-0 text-center">
                  <div className="text-xs font-semibold text-text-primary">{formatDate(event.startDate)}</div>
                  {event.startDate !== event.endDate && (
                    <div className="text-[10px] text-text-tertiary">→ {formatDate(event.endDate)}</div>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-white/10 shrink-0" />

                {/* Event Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{event.title}</div>
                  {event.description && (
                    <div className="text-[11px] text-text-tertiary truncate mt-0.5">{event.description}</div>
                  )}
                </div>

                {/* Impact + Countdown */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                      IMPACT_STYLES[event.impact] || IMPACT_STYLES.medium
                    )}
                  >
                    {event.impact}
                  </span>
                  <span className="text-[11px] text-text-tertiary w-16 text-right">
                    {daysUntil(event.startDate)}
                  </span>
                  {event.suggestedPremiumPct !== 0 && (
                    <span
                      className={cn(
                        "text-[10px] font-bold w-12 text-right",
                        event.suggestedPremiumPct > 0 ? "text-green-400" : "text-red-400"
                      )}
                    >
                      {event.suggestedPremiumPct > 0 ? "+" : ""}
                      {event.suggestedPremiumPct}%
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-text-disabled opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Demand Signal Summary */}
      {(upcomingHigh.length > 0 || upcomingMedium.length > 0) && (
        <div className="rounded-xl border border-amber/20 bg-amber/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber mb-1">Demand Signal Summary</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                {upcomingHigh.length > 0 && (
                  <>
                    <strong className="text-text-primary">{upcomingHigh.length} high-impact event{upcomingHigh.length > 1 ? "s" : ""}</strong>
                    {" "}detected in the next 90 days
                    {upcomingHigh[0] && `: ${upcomingHigh[0].title}${upcomingHigh.length > 1 ? ` +${upcomingHigh.length - 1} more` : ""}`}.
                    {" "}
                  </>
                )}
                {upcomingMedium.length > 0 && (
                  <>
                    <strong className="text-text-primary">{upcomingMedium.length} medium-impact</strong>
                    {" "}events also detected.{" "}
                  </>
                )}
                Run Market Analysis to get the latest event data and trigger pricing proposals.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
