"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarDay {
  date: string;
  currentPrice: number;
  proposedPrice: number | null;
  proposalStatus: string | null;
  status: string;
  changePct: number | null;
  reasoning: string | null;
  minStay: number | null;
}

interface CalendarData {
  listingId: string;
  listingName: string;
  basePrice: number;
  currency: string;
  priceFloor: number;
  priceCeiling: number;
  totalDays: number;
  days: CalendarDay[];
}

interface ListingOption {
  id: string;
  name: string;
  currencyCode: string;
}

interface Props {
  listings: ListingOption[];
}

// ── Heatmap Color Logic ──────────────────────────────────────────────────────

function getHeatColor(changePct: number | null, status: string, proposalStatus: string | null): string {
  if (status === "booked") return "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/30 dark:text-blue-100";
  if (status === "blocked") return "bg-slate-100 border-slate-200 text-slate-700 dark:bg-zinc-700/40 dark:border-zinc-600/30 dark:text-zinc-300";
  if (proposalStatus === "approved") return "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-green-500/15 dark:border-green-500/25 dark:text-green-100";
  if (proposalStatus === "rejected") return "bg-red-50 border-red-200 text-red-900 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-200";
  if (proposalStatus === "pushed") return "bg-sky-50 border-sky-200 text-sky-900 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-100";

  if (changePct === null || changePct === 0) return "bg-card border-border/70 text-foreground dark:bg-white/[0.03] dark:border-white/[0.08] dark:text-foreground";

  const abs = Math.abs(changePct);
  if (changePct > 0) {
    if (abs >= 20) return "bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-green-500/25 dark:border-green-500/35 dark:text-green-100";
    if (abs >= 10) return "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-green-500/18 dark:border-green-500/25 dark:text-green-100";
    if (abs >= 5) return "bg-green-50 border-green-200 text-green-900 dark:bg-green-500/12 dark:border-green-500/18 dark:text-green-200";
    return "bg-green-50/70 border-green-100 text-green-800 dark:bg-green-500/8 dark:border-green-500/12 dark:text-green-200";
  } else {
    if (abs >= 20) return "bg-rose-100 border-rose-300 text-rose-950 dark:bg-red-500/25 dark:border-red-500/35 dark:text-red-100";
    if (abs >= 10) return "bg-rose-50 border-rose-200 text-rose-900 dark:bg-red-500/18 dark:border-red-500/25 dark:text-red-100";
    if (abs >= 5) return "bg-red-50 border-red-200 text-red-900 dark:bg-red-500/12 dark:border-red-500/18 dark:text-red-200";
    return "bg-red-50/70 border-red-100 text-red-800 dark:bg-red-500/8 dark:border-red-500/12 dark:text-red-200";
  }
}

function statusLabel(status: string, proposalStatus: string | null): string | null {
  if (status === "booked") return "BOOKED";
  if (status === "blocked") return "BLOCKED";
  if (proposalStatus === "approved") return "APPROVED";
  if (proposalStatus === "pushed") return "PUSHED";
  if (proposalStatus === "rejected") return "REJECTED";
  return null;
}

// ── Day Detail Tooltip ───────────────────────────────────────────────────────

function DayDetail({
  day,
  currency,
  basePrice,
  align = "center",
}: {
  day: CalendarDay;
  currency: string;
  basePrice: number;
  align?: "left" | "center" | "right";
}) {
  return (
    <div
      className={cn(
        "absolute z-50 bottom-full mb-2 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-xl p-3 space-y-2 text-xs pointer-events-none",
        align === "left" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "right" && "right-0"
      )}
    >
      <div className="flex justify-between items-center">
        <span className="font-bold text-foreground">
          {format(parseISO(day.date), "EEEE, d MMM yyyy")}
        </span>
        {day.status !== "available" && (
          <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">
            {day.status}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
        <span className="text-muted-foreground">Base price</span>
        <span className="text-right font-medium text-foreground">
          {currency} {basePrice.toLocaleString("en-US")}
        </span>
        <span className="text-muted-foreground">Current</span>
        <span className="text-right font-medium text-foreground">
          {currency} {day.currentPrice.toLocaleString("en-US")}
        </span>
        {day.proposedPrice !== null && (
          <>
            <span className="text-muted-foreground">Proposed</span>
            <span className="text-right font-bold text-amber">
              {currency} {day.proposedPrice.toLocaleString("en-US")}
            </span>
          </>
        )}
        {day.changePct !== null && day.changePct !== 0 && (
          <>
            <span className="text-muted-foreground">Change</span>
            <span
              className={cn(
                "text-right font-bold",
                day.changePct > 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {day.changePct > 0 ? "+" : ""}
              {day.changePct}%
            </span>
          </>
        )}
        {day.minStay && day.minStay > 1 && (
          <>
            <span className="text-muted-foreground">Min stay</span>
            <span className="text-right text-foreground">{day.minStay}N</span>
          </>
        )}
      </div>
      {day.reasoning && (
        <p className="text-[10px] text-text-secondary leading-relaxed border-t border-border-subtle pt-2">
          {day.reasoning}
        </p>
      )}
    </div>
  );
}

// ── Month Stats ──────────────────────────────────────────────────────────────

function MonthStats({ days, currency }: { days: CalendarDay[]; currency: string }) {
  const available = days.filter((d) => d.status === "available");
  const booked = days.filter((d) => d.status === "booked");
  const pending = days.filter((d) => d.proposalStatus === "pending");
  const avgProposed = available.length > 0
    ? Math.round(available.reduce((s, d) => s + (d.proposedPrice ?? d.currentPrice), 0) / available.length)
    : 0;
  const avgChange = pending.length > 0
    ? Math.round(pending.reduce((s, d) => s + (d.changePct ?? 0), 0) / pending.length)
    : 0;
  const occupancy = days.length > 0 ? Math.round((booked.length / days.length) * 100) : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <StatCard label="Avg Proposed" value={`${currency} ${avgProposed.toLocaleString("en-US")}`} />
      <StatCard
        label="Avg Change"
        value={`${avgChange > 0 ? "+" : ""}${avgChange}%`}
        color={avgChange > 0 ? "text-green-400" : avgChange < 0 ? "text-red-400" : "text-foreground"}
      />
      <StatCard label="Occupancy" value={`${occupancy}%`} />
      <StatCard label="Pending" value={String(pending.length)} color="text-amber-400" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums text-foreground", color)}>{value}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const DOW_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PricingCalendarHeatmap({ listings }: Props) {
  const [selectedListing, setSelectedListing] = useState(listings[0]?.id || "");
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchCalendar = useCallback(async (listingId: string) => {
    if (!listingId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/calendar?listingId=${listingId}&days=365`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: CalendarData = await res.json();
      setCalendarData(data);
    } catch {
      setCalendarData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedListing) {
      fetchCalendar(selectedListing);
    }
  }, [selectedListing, fetchCalendar]);

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    if (calendarData) {
      for (const d of calendarData.days) {
        map.set(d.date, d);
      }
    }
    return map;
  }, [calendarData]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const monthCalendarDays = useMemo(() => {
    return monthDays
      .map((d) => {
        const ds = format(d, "yyyy-MM-dd");
        return dayMap.get(ds) || null;
      })
      .filter((d): d is CalendarDay => d !== null);
  }, [monthDays, dayMap]);

  const firstDayOffset = useMemo(() => {
    const dow = getDay(startOfMonth(currentMonth));
    return dow === 0 ? 6 : dow - 1;
  }, [currentMonth]);

  const canGoPrev = isSameMonth(currentMonth, new Date()) || currentMonth > new Date();
  const prevMonth = () => {
    const prev = subMonths(currentMonth, 1);
    if (prev >= startOfMonth(new Date())) setCurrentMonth(prev);
  };
  const nextMonth = () => {
    const maxMonth = addMonths(new Date(), 11);
    const next = addMonths(currentMonth, 1);
    if (next <= maxMonth) setCurrentMonth(next);
  };

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Calendar className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No listings found. Run a sync first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Listing Selector + Month Nav */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedListing} onValueChange={setSelectedListing}>
            <SelectTrigger className="h-9 w-72 text-sm bg-background border-border/70 text-foreground shadow-sm dark:bg-white/[0.04] dark:border-white/15">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent className="max-h-64 overflow-y-auto">
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-sm">
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            disabled={!canGoPrev}
            className="h-8 w-8 rounded-md bg-background border border-border/70 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-30 transition-colors dark:bg-white/[0.04] dark:border-white/15 dark:hover:bg-white/[0.08]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={nextMonth}
            className="h-8 w-8 rounded-md bg-background border border-border/70 flex items-center justify-center text-foreground hover:bg-muted transition-colors dark:bg-white/[0.04] dark:border-white/15 dark:hover:bg-white/[0.08]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading calendar…</span>
        </div>
      ) : !calendarData ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Info className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No inventory data. Run the pricing engine first.
          </p>
        </div>
      ) : (
        <>
          {/* Month Stats */}
          <MonthStats days={monthCalendarDays} currency={calendarData.currency} />

          {/* Heatmap Grid */}
          <div className="rounded-2xl border border-border/70 bg-card p-4 overflow-x-auto shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="grid grid-cols-7 gap-1 min-w-[600px]">
              {/* DOW Headers */}
              {DOW_HEADERS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1"
                >
                  {d}
                </div>
              ))}

              {/* Empty cells for offset */}
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Day Cells */}
              {monthDays.map((date) => {
                const ds = format(date, "yyyy-MM-dd");
                const day = dayMap.get(ds);
                const dayNum = format(date, "d");
                const isHovered = hoveredDate === ds;
                const isToday = ds === format(new Date(), "yyyy-MM-dd");

                if (!day) {
                  return (
                    <div
                      key={ds}
                      className="aspect-square rounded-lg bg-background border border-border/60 flex flex-col items-center justify-center dark:bg-white/[0.02] dark:border-white/[0.06]"
                    >
                      <span className="text-[10px] text-muted-foreground">{dayNum}</span>
                    </div>
                  );
                }

                const heatClass = getHeatColor(day.changePct, day.status, day.proposalStatus);
                const displayPrice = day.proposedPrice ?? day.currentPrice;
                const label = statusLabel(day.status, day.proposalStatus);
                const columnIndex = (getDay(date) + 6) % 7;
                const tooltipAlign =
                  columnIndex <= 1 ? "left" : columnIndex >= 5 ? "right" : "center";

                return (
                  <div
                    key={ds}
                    className={cn(
                      "relative aspect-square rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm",
                      heatClass,
                      isToday && "ring-1 ring-amber/50",
                      isHovered && "ring-2 ring-amber scale-[1.03] z-10"
                    )}
                    onMouseEnter={() => setHoveredDate(ds)}
                    onMouseLeave={() => setHoveredDate(null)}
                  >
                    <span className={cn("text-[10px] leading-none", isToday ? "font-bold text-amber" : "text-inherit opacity-80")}>
                      {dayNum}
                    </span>
                    <span className="text-[11px] font-bold leading-none mt-0.5 tabular-nums">
                      {displayPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                    {day.changePct !== null && day.changePct !== 0 && (
                      <span className="text-[8px] leading-none mt-0.5 flex items-center gap-px">
                        {day.changePct > 0 ? (
                          <TrendingUp className="h-2 w-2" />
                        ) : (
                          <TrendingDown className="h-2 w-2" />
                        )}
                        {day.changePct > 0 ? "+" : ""}
                        {day.changePct}%
                      </span>
                    )}
                    {label && (
                      <span className="text-[7px] font-bold uppercase tracking-wider leading-none mt-0.5 opacity-80">
                        {label}
                      </span>
                    )}

                    {/* Tooltip on hover */}
                    {isHovered && (
                      <DayDetail
                        day={day}
                        currency={calendarData.currency}
                        basePrice={calendarData.basePrice}
                        align={tooltipAlign}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-muted-foreground">
            <span className="font-bold uppercase tracking-wider">Legend:</span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-green-500/20 border border-green-500/30" />
              Increase
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-red-500/20 border border-red-500/30" />
              Decrease
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-card border border-border/70 dark:bg-white/[0.03] dark:border-white/[0.08]" />
              No change
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-blue-500/20 border border-blue-500/30" />
              Booked
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-zinc-700/40 border border-zinc-600/30" />
              Blocked
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded ring-1 ring-amber/50" />
              Today
            </span>
          </div>

          {/* Guardrail indicators */}
          {(calendarData.priceFloor > 0 || calendarData.priceCeiling > 0) && (
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground border-t border-border/70 pt-3 dark:border-white/10">
              <span className="font-bold uppercase tracking-wider">Guardrails:</span>
              {calendarData.priceFloor > 0 && (
                <span>
                  Floor: <strong className="text-foreground">{calendarData.currency} {calendarData.priceFloor.toLocaleString("en-US")}</strong>
                </span>
              )}
              {calendarData.priceCeiling > 0 && (
                <span>
                  Ceiling: <strong className="text-foreground">{calendarData.currency} {calendarData.priceCeiling.toLocaleString("en-US")}</strong>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
