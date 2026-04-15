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
  if (status === "booked") return "bg-blue-500/20 border-blue-500/30 text-blue-300";
  if (status === "blocked") return "bg-zinc-700/40 border-zinc-600/30 text-zinc-400";
  if (proposalStatus === "approved") return "bg-green-500/15 border-green-500/25 text-green-300";
  if (proposalStatus === "rejected") return "bg-red-500/10 border-red-500/20 text-red-400";
  if (proposalStatus === "pushed") return "bg-blue-500/10 border-blue-500/20 text-blue-300";

  if (changePct === null || changePct === 0) return "bg-white/[0.03] border-white/[0.06] text-text-secondary";

  const abs = Math.abs(changePct);
  if (changePct > 0) {
    if (abs >= 20) return "bg-green-500/25 border-green-500/35 text-green-300";
    if (abs >= 10) return "bg-green-500/18 border-green-500/25 text-green-300";
    if (abs >= 5) return "bg-green-500/12 border-green-500/18 text-green-400";
    return "bg-green-500/8 border-green-500/12 text-green-400";
  } else {
    if (abs >= 20) return "bg-red-500/25 border-red-500/35 text-red-300";
    if (abs >= 10) return "bg-red-500/18 border-red-500/25 text-red-300";
    if (abs >= 5) return "bg-red-500/12 border-red-500/18 text-red-400";
    return "bg-red-500/8 border-red-500/12 text-red-400";
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
}: {
  day: CalendarDay;
  currency: string;
  basePrice: number;
}) {
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg border border-border-default bg-surface-1 shadow-xl p-3 space-y-2 text-xs pointer-events-none">
      <div className="flex justify-between items-center">
        <span className="font-bold text-text-primary">
          {format(parseISO(day.date), "EEEE, d MMM yyyy")}
        </span>
        {day.status !== "available" && (
          <Badge className="text-[9px] bg-blue-500/10 text-blue-400 border-blue-500/20">
            {day.status}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
        <span className="text-text-tertiary">Base price</span>
        <span className="text-right font-medium text-text-primary">
          {currency} {basePrice.toLocaleString("en-US")}
        </span>
        <span className="text-text-tertiary">Current</span>
        <span className="text-right font-medium text-text-primary">
          {currency} {day.currentPrice.toLocaleString("en-US")}
        </span>
        {day.proposedPrice !== null && (
          <>
            <span className="text-text-tertiary">Proposed</span>
            <span className="text-right font-bold text-amber">
              {currency} {day.proposedPrice.toLocaleString("en-US")}
            </span>
          </>
        )}
        {day.changePct !== null && day.changePct !== 0 && (
          <>
            <span className="text-text-tertiary">Change</span>
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
            <span className="text-text-tertiary">Min stay</span>
            <span className="text-right text-text-primary">{day.minStay}N</span>
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
        color={avgChange > 0 ? "text-green-400" : avgChange < 0 ? "text-red-400" : "text-text-primary"}
      />
      <StatCard label="Occupancy" value={`${occupancy}%`} />
      <StatCard label="Pending" value={String(pending.length)} color="text-amber-400" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", color || "text-text-primary")}>{value}</p>
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
        <Calendar className="h-8 w-8 text-text-disabled" />
        <p className="text-text-tertiary text-sm">No listings found. Run a sync first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Listing Selector + Month Nav */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Calendar className="h-4 w-4 text-text-tertiary" />
          <Select value={selectedListing} onValueChange={setSelectedListing}>
            <SelectTrigger className="h-9 w-72 text-sm bg-white/5 border-white/10">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent>
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
            className="h-8 w-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-text-secondary hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-text-primary min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={nextMonth}
            className="h-8 w-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-text-secondary hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-text-disabled">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading calendar…</span>
        </div>
      ) : !calendarData ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Info className="h-8 w-8 text-text-disabled" />
          <p className="text-text-tertiary text-sm">
            No inventory data. Run the pricing engine first.
          </p>
        </div>
      ) : (
        <>
          {/* Month Stats */}
          <MonthStats days={monthCalendarDays} currency={calendarData.currency} />

          {/* Heatmap Grid */}
          <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[600px]">
              {/* DOW Headers */}
              {DOW_HEADERS.map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-bold text-text-disabled uppercase tracking-wider py-1"
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
                      className="aspect-square rounded-md bg-white/[0.01] border border-white/[0.03] flex flex-col items-center justify-center"
                    >
                      <span className="text-[10px] text-text-disabled">{dayNum}</span>
                    </div>
                  );
                }

                const heatClass = getHeatColor(day.changePct, day.status, day.proposalStatus);
                const displayPrice = day.proposedPrice ?? day.currentPrice;
                const label = statusLabel(day.status, day.proposalStatus);

                return (
                  <div
                    key={ds}
                    className={cn(
                      "relative aspect-square rounded-md border flex flex-col items-center justify-center cursor-pointer transition-all",
                      heatClass,
                      isToday && "ring-1 ring-amber/50",
                      isHovered && "ring-2 ring-amber scale-105 z-10"
                    )}
                    onMouseEnter={() => setHoveredDate(ds)}
                    onMouseLeave={() => setHoveredDate(null)}
                  >
                    <span className={cn("text-[10px] leading-none", isToday ? "font-bold text-amber" : "text-inherit opacity-60")}>
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
                      <span className="text-[7px] font-bold uppercase tracking-wider leading-none mt-0.5 opacity-70">
                        {label}
                      </span>
                    )}

                    {/* Tooltip on hover */}
                    {isHovered && (
                      <DayDetail day={day} currency={calendarData.currency} basePrice={calendarData.basePrice} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap text-[10px] text-text-tertiary">
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
              <span className="h-3 w-3 rounded bg-white/[0.03] border border-white/[0.06]" />
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
            <div className="flex items-center gap-4 text-[10px] text-text-tertiary border-t border-white/5 pt-3">
              <span className="font-bold uppercase tracking-wider">Guardrails:</span>
              {calendarData.priceFloor > 0 && (
                <span>
                  Floor: <strong className="text-text-primary">{calendarData.currency} {calendarData.priceFloor.toLocaleString("en-US")}</strong>
                </span>
              )}
              {calendarData.priceCeiling > 0 && (
                <span>
                  Ceiling: <strong className="text-text-primary">{calendarData.currency} {calendarData.priceCeiling.toLocaleString("en-US")}</strong>
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
