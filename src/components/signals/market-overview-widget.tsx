"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Loader2, RefreshCw } from "lucide-react";
import { useContextStore } from "@/stores/context-store";

interface MarketOverview {
    adr: number;
    revpar: number;
    occupancy: number;
    activeListings?: number;
}

export function MarketOverviewWidget({
    listingId,
    month,
    currency = "AED",
}: {
    listingId: string | null;
    month: string;
    currency?: string;
}) {
    const [overview, setOverview] = useState<MarketOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const { isMarketAnalysisRunning } = useContextStore();

    const fetchOverview = useCallback(async () => {
        if (!listingId) {
            setOverview(null);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`/api/agent-tools/market-overview?listingId=${listingId}&month=${month}`);
            if (res.ok) {
                const data = await res.json();
                if (data.source === "serp") {
                    setOverview({
                        adr: data.adr || 0,
                        revpar: data.revpar || 0,
                        occupancy: data.occupancy || 0,
                        activeListings: data.activeListings,
                    });
                } else {
                    setOverview(null);
                }
            } else {
                setOverview(null);
            }
        } catch (e) {
            console.error("MarketOverviewWidget fetch error:", e);
            setOverview(null);
        } finally {
            setLoading(false);
        }
    }, [listingId, month, refreshTick]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    const isPending = loading || isMarketAnalysisRunning;

    return (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-background text-foreground shadow-sm mb-3">
            <div className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Market Overview ({month.substring(0, 7)})</span>
                </div>
                <div className="flex items-center gap-2">
                    {!isPending && overview && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/30">
                            SERP API
                        </span>
                    )}
                    {!isPending && overview?.activeListings != null && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                            {overview.activeListings} comps
                        </span>
                    )}
                    <button
                        onClick={() => setRefreshTick((t) => t + 1)}
                        disabled={isPending}
                        className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
                        title="Refresh from SERP (cached 4hrs per property)"
                    >
                        <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            <div className="p-3">
                {isPending ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                    </div>
                ) : overview ? (
                    <div className="grid grid-cols-3 gap-2">
                        <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">ADR</span>
                            <p className="text-[13px] font-black mt-0.5">{currency} {Math.round(overview.adr)}</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">RevPAR</span>
                            <p className="text-[13px] font-black mt-0.5">{currency} {Math.round(overview.revpar)}</p>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-2 border border-border/30 text-center">
                            <span className="text-[8px] font-black uppercase text-muted-foreground tracking-wider">Occupancy</span>
                            <p className="text-[13px] font-black mt-0.5">{Math.round(overview.occupancy * 100)}%</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-4 text-muted-foreground">
                        <p className="text-[10px] opacity-60">No market data yet. SERP returned no comps for this area + bedroom count.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
