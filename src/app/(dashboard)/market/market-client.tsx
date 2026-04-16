"use client";

import { useState, useMemo } from "react";
import {
  Calendar,
  TrendingUp,
  Globe,
  AlertTriangle,
  Star,
  BarChart2,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BenchmarkPanel } from "@/components/market/benchmark-panel";

interface MarketEvent {
  id: string;
  listingId?: string | null;
  title: string;
  startDate: string;
  endDate: string;
  impact: "high" | "medium" | "low";
  suggestedPremiumPct: number;
  description: string;
  category: string;
  area: string;
  source?: string;
}

interface Props {
  events: MarketEvent[];
  occupancyPct: number;
  avgNightly: number;
  listings: { id: string; name: string; currencyCode: string; area?: string }[];
}

/** Impact pills: strong contrast in light mode, preserved look in dark */
const IMPACT_STYLES: Record<string, string> = {
  high:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30",
  medium:
    "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30",
  low:
    "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30",
};

const FILTER_SELECT_CLASS =
  "text-xs min-h-9 rounded-md border border-border bg-background px-3 py-1.5 text-foreground shadow-sm " +
  "focus:outline-none focus:ring-2 focus:ring-amber-500/35 focus:ring-offset-2 focus:ring-offset-background " +
  "dark:border-white/15 dark:bg-white/[0.06] dark:text-foreground";

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

export function MarketIntelligenceClient({ events, occupancyPct, avgNightly, listings }: Props) {
  const [selectedListingId, setSelectedListingId] = useState<string>(listings[0]?.id ?? "");
  const [filterImpact, setFilterImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [filterArea, setFilterArea] = useState<string>("all");

  const areas = useMemo(() => {
    const fromEvents = events.flatMap((e) => (e.area ? [e.area] : []));
    const fromListings = listings.flatMap((l) => (l.area ? [l.area] : []));
    const merged = Array.from(new Set([...fromEvents, ...fromListings].filter(Boolean)));
    return merged.sort();
  }, [events, listings]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (filterImpact !== "all" && e.impact !== filterImpact) return false;
      if (filterArea !== "all" && e.area !== filterArea) return false;
      return true;
    });
  }, [events, filterImpact, filterArea]);

  const upcomingHigh = events.filter((e) => e.impact === "high");
  const upcomingMedium = events.filter((e) => e.impact === "medium");

  const IMPACT_PILL = [
    { id: "all", label: "All" },
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
  ] as const;

  return (
    <div className="p-8 max-w-6xl space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Market Intelligence</h1>
        <p className="text-text-secondary text-sm flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5" />
          Your market — live events, demand signals, and comp positioning
        </p>
      </div>

      {/* KPI Cards */}
      <TooltipProvider>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: "Portfolio Occupancy",
              value: `${occupancyPct}%`,
              sub: "Next 30 days",
              icon: BarChart2,
              color: occupancyPct > 70 ? "text-green-400" : occupancyPct > 40 ? "text-amber-400" : "text-red-400",
              tooltip: "Real-time occupancy synced from Hostaway/PMS.",
            },
            {
              label: "Avg Nightly Rate",
              value: avgNightly > 0 ? `AED ${avgNightly.toLocaleString("en-US")}` : "—",
              sub: "Portfolio average",
              icon: TrendingUp,
              color: "text-blue-400",
              tooltip: "Average gross revenue per night across all properties.",
            },
            {
              label: "High-Impact Events",
              value: upcomingHigh.length,
              sub: "Next 90 days",
              icon: Star,
              color: "text-red-400",
              tooltip: "Local events with high demand potential (Pass 1).",
            },
            {
              label: "Total Events",
              value: events.length,
              sub: "Next 90 days",
              icon: Calendar,
              color: "text-amber-400",
              tooltip: "Total detected events near your properties.",
            },
          ].map((kpi) => (
            <Tooltip key={kpi.label}>
              <TooltipTrigger asChild>
                <div
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex flex-col gap-2 cursor-help transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
                    <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                  </div>
                  <div className={cn("text-2xl font-bold tabular-nums", kpi.color)}>{kpi.value}</div>
                  <div className="text-[11px] text-muted-foreground/70">{kpi.sub}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-[10px] p-2 dark:bg-black border border-white/20">
                {kpi.tooltip}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Event Calendar — table + high-contrast filters (light + dark) */}
      <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-white/10">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Event Calendar</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Next 90 days · {filteredEvents.length} of {events.length} events
            </p>
          </div>
          {upcomingHigh.length > 0 && (
            <Badge className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-semibold dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30">
              {upcomingHigh.length} high-impact
            </Badge>
          )}
        </div>

        {/* Filter bar */}
        {events.length > 0 && (
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-3 flex-wrap dark:border-white/10 dark:bg-white/[0.02]">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            {/* Impact filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {IMPACT_PILL.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterImpact(id)}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-md border transition-colors",
                    filterImpact === id
                      ? "border-amber-500 bg-amber-100 text-amber-950 shadow-sm dark:border-amber/40 dark:bg-amber/15 dark:text-amber"
                      : "border-border bg-background text-foreground/90 hover:bg-muted hover:text-foreground dark:border-white/15 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Area filter */}
            {areas.length > 0 && (
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className={FILTER_SELECT_CLASS}
              >
                <option value="all">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}

            {(filterImpact !== "all" || filterArea !== "all") && (
              <button
                type="button"
                onClick={() => { setFilterImpact("all"); setFilterArea("all"); }}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline ml-auto dark:text-amber dark:hover:text-amber/90"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-5">
            <Calendar className="h-8 w-8 text-muted-foreground" />
            {events.length === 0 ? (
              <>
                <p className="text-muted-foreground text-sm">No events in the next 90 days.</p>
                <p className="text-muted-foreground/80 text-xs">Run Market Analysis to fetch live event data.</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">No events match the current filters.</p>
                <button
                  type="button"
                  onClick={() => { setFilterImpact("all"); setFilterArea("all"); }}
                  className="text-xs font-medium text-amber-700 hover:underline dark:text-amber"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="px-2 pb-2 sm:px-4">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent dark:border-white/10">
                  <TableHead className="min-w-[120px] pl-4 text-xs font-semibold text-foreground">Date range</TableHead>
                  <TableHead className="min-w-[200px] text-xs font-semibold text-foreground">Event</TableHead>
                  <TableHead className="w-[100px] text-xs font-semibold text-foreground">Impact</TableHead>
                  <TableHead className="w-[88px] text-xs font-semibold text-foreground">Timeline</TableHead>
                  <TableHead className="w-[72px] text-right text-xs font-semibold text-foreground">Uplift</TableHead>
                  <TableHead className="hidden sm:table-cell w-[88px] text-xs font-semibold text-foreground">Area</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  return (
                  <TableRow
                    key={event.id}
                    className="border-border dark:border-white/10"
                  >
                    <TableCell className="align-top pl-4 py-3 text-sm">
                      <div className="font-medium text-foreground tabular-nums">{formatDate(event.startDate)}</div>
                      {event.startDate !== event.endDate && (
                        <div className="text-xs text-muted-foreground">→ {formatDate(event.endDate)}</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-3 max-w-[min(360px,50vw)]">
                      <div className="font-medium text-foreground leading-snug">{event.title}</div>
                      {event.description && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <span
                        className={cn(
                          "inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md border",
                          IMPACT_STYLES[event.impact] || IMPACT_STYLES.medium
                        )}
                      >
                        {event.impact}
                      </span>
                    </TableCell>
                    <TableCell className="align-top py-3 text-sm text-foreground tabular-nums">
                      {daysUntil(event.startDate)}
                    </TableCell>
                    <TableCell className="align-top py-3 text-right text-sm font-semibold tabular-nums">
                      {event.suggestedPremiumPct !== 0 ? (
                        <span
                          className={cn(
                            event.suggestedPremiumPct > 0
                              ? "text-emerald-700 dark:text-green-400"
                              : "text-red-700 dark:text-red-400"
                          )}
                        >
                          {event.suggestedPremiumPct > 0 ? "+" : ""}
                          {event.suggestedPremiumPct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell align-top py-3">
                      {event.area ? (
                        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border border-border bg-muted text-foreground dark:border-white/20 dark:bg-white/5">
                          {event.area}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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

      {/* Competitor Benchmark Panel */}
      {listings.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Competitor Benchmark</h2>
              <p className="text-xs text-text-tertiary mt-0.5">Rate positioning vs. comp set</p>
            </div>
            {listings.length > 1 && (
              <select
                value={selectedListingId}
                onChange={(e) => setSelectedListingId(e.target.value)}
                className="text-xs bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-amber/40"
              >
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="p-5">
            <BenchmarkPanel
              listingId={selectedListingId}
              listingName={listings.find((l) => l.id === selectedListingId)?.name ?? ""}
              currency={listings.find((l) => l.id === selectedListingId)?.currencyCode ?? "AED"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
