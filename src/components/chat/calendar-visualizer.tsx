"use client";

import { format, startOfMonth, getDay, endOfMonth, eachMonthOfInterval } from "date-fns";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CalendarDayData {
    date: string;
    status: string; // 'available', 'booked', 'reserved', 'blocked'
    price: number;
}

export interface ReservationData {
    title: string;
    startDate: string;
    endDate: string;
    financials: {
        totalPrice?: number;
        reservationStatus?: string;
        channelName?: string;
    };
}

interface CalendarVisualizerProps {
    days: CalendarDayData[];
    reservations?: ReservationData[];
    dateRange: { from: string; to: string };
}

function DayTooltipContent({
    dateStr,
    data,
    reservation,
}: {
    dateStr: string;
    data: CalendarDayData | undefined;
    reservation: ReservationData | undefined;
}) {
    const displayDate = (() => {
        try { return format(new Date(dateStr), "EEE, MMM d yyyy"); } catch { return dateStr; }
    })();

    if (!data) {
        return (
            <div className="space-y-1">
                <p className="font-semibold text-xs">{displayDate}</p>
                <p className="text-xs opacity-70">Outside selected range</p>
            </div>
        );
    }

    const statusLabel =
        data.status === "booked" || data.status === "reserved"
            ? "Booked"
            : data.status === "blocked"
            ? "Blocked"
            : "Available";

    const statusColor =
        data.status === "booked" || data.status === "reserved"
            ? "bg-rose-500"
            : data.status === "blocked"
            ? "bg-slate-400"
            : "bg-emerald-500";

    return (
        <div className="space-y-2 min-w-[160px]">
            <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-xs">{displayDate}</p>
                <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full text-white ${statusColor}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="border-t border-white/20 pt-1.5 space-y-1">
                <div className="flex justify-between gap-4 text-xs">
                    <span className="opacity-70">Nightly rate</span>
                    <span className="font-semibold">AED {data.price.toLocaleString()}</span>
                </div>

                {reservation && (
                    <>
                        <div className="flex justify-between gap-4 text-xs">
                            <span className="opacity-70">Guest</span>
                            <span className="font-semibold truncate max-w-[100px]">{reservation.title}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-xs">
                            <span className="opacity-70">Check-in</span>
                            <span className="font-semibold">
                                {(() => { try { return format(new Date(reservation.startDate), "MMM d"); } catch { return reservation.startDate; } })()}
                            </span>
                        </div>
                        <div className="flex justify-between gap-4 text-xs">
                            <span className="opacity-70">Check-out</span>
                            <span className="font-semibold">
                                {(() => { try { return format(new Date(reservation.endDate), "MMM d"); } catch { return reservation.endDate; } })()}
                            </span>
                        </div>
                        {reservation.financials?.totalPrice ? (
                            <div className="flex justify-between gap-4 text-xs">
                                <span className="opacity-70">Total</span>
                                <span className="font-semibold">AED {reservation.financials.totalPrice.toLocaleString()}</span>
                            </div>
                        ) : null}
                        {reservation.financials?.channelName ? (
                            <div className="flex justify-between gap-4 text-xs">
                                <span className="opacity-70">Channel</span>
                                <span className="font-semibold">{reservation.financials.channelName}</span>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}

export function CalendarVisualizer({ days, reservations = [], dateRange }: CalendarVisualizerProps) {
    if (!dateRange || !dateRange.from || !dateRange.to) return null;

    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    const monthsInRange = eachMonthOfInterval({ start: startDate, end: endDate });

    const getReservationForDate = (dateStr: string) => {
        const targetDate = new Date(dateStr);
        return reservations.find(r => {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            return targetDate >= start && targetDate <= end;
        });
    };

    return (
        <TooltipProvider delayDuration={150}>
            <div className="flex flex-col space-y-6">
                <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Booked</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700"></span> Blocked</span>
                </div>

                {monthsInRange.map((monthDate) => {
                    const monthKey = format(monthDate, "yyyy-MM");
                    const firstDayDate = startOfMonth(monthDate);
                    const startDayOffset = getDay(firstDayDate);
                    const blankDays = Array.from({ length: startDayOffset }).map((_, i) => i);
                    const monthTitle = format(firstDayDate, "MMMM yyyy");
                    const daysInMonth = parseInt(format(endOfMonth(firstDayDate), "d"));

                    const gridDays = Array.from({ length: daysInMonth }).map((_, i) => {
                        const dateNumber = i + 1;
                        const fullDateStr = `${monthKey}-${String(dateNumber).padStart(2, "0")}`;
                        const foundDay = days.find(d => d.date === fullDateStr);
                        const res = getReservationForDate(fullDateStr);
                        return { dayNum: dateNumber, fullDateStr, data: foundDay, reservation: res };
                    });

                    return (
                        <div key={monthKey} className="flex flex-col">
                            <h4 className="font-semibold text-sm mb-3 text-foreground">{monthTitle}</h4>
                            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
                                <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {blankDays.map((b) => (
                                    <div key={`blank-${b}`} className="h-10 rounded-md border border-transparent pt-1" />
                                ))}
                                {gridDays.map((gridDay) => {
                                    let bgClass = "bg-muted/30 text-muted-foreground opacity-50 cursor-default";

                                    if (gridDay.data) {
                                        if (gridDay.data.status === "booked" || gridDay.data.status === "reserved") {
                                            bgClass = "bg-rose-500 text-white font-bold shadow-sm cursor-pointer";
                                        } else if (gridDay.data.status === "blocked") {
                                            bgClass = "bg-slate-300 dark:bg-slate-700 text-muted-foreground cursor-pointer";
                                        } else {
                                            bgClass = "bg-emerald-500 text-white font-bold shadow-sm cursor-pointer";
                                        }
                                    }

                                    return (
                                        <Tooltip key={gridDay.dayNum}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className={`h-10 rounded border border-border/50 flex flex-col items-center justify-center text-xs transition-opacity hover:opacity-80 ${bgClass} ${gridDay.reservation ? "ring-1 ring-offset-1 ring-amber-500" : ""}`}
                                                >
                                                    <span>{gridDay.dayNum}</span>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                side="top"
                                                className="bg-gray-900 text-white border-gray-700 shadow-xl"
                                            >
                                                <DayTooltipContent
                                                    dateStr={gridDay.fullDateStr}
                                                    data={gridDay.data}
                                                    reservation={gridDay.reservation}
                                                />
                                            </TooltipContent>
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </TooltipProvider>
    );
}
