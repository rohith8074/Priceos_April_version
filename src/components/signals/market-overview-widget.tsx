"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, BarChart3, Loader2 } from "lucide-react";
import { useContextStore } from "@/stores/context-store";

interface MarketOverview {
    adr: number;
    revpar: number;
    occupancy: number;
}

export function MarketOverviewWidget({ month, marketId = "2286", currency = "AED" }: { month: string, marketId?: string, currency?: string }) {
    const [overview, setOverview] = useState<MarketOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const { isMarketAnalysisRunning } = useContextStore();

    const fetchOverview = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/agent-tools/market-overview?month=${month}&marketId=${marketId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.source !== "none") {
                    setOverview({
                        adr: data.adr || 0,
                        revpar: data.revpar || 0,
                        occupancy: data.occupancy || 0
                    });
                } else {
                    setOverview(null);
                }
            }
        } catch (e) {
            console.error("MarketOverviewWidget fetch error:", e);
        } finally {
            setLoading(false);
        }
    }, [month, marketId]);

    useEffect(() => {
        fetchOverview();
    }, [fetchOverview]);

    const isPending = loading || isMarketAnalysisRunning;

    if (!overview && !isPending) return null;

    return (
        <div className="border border-border/50 rounded-xl overflow-hidden bg-background text-foreground shadow-sm mb-3">
            <div className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Market Overview ({month.substring(0, 7)})</span>
                </div>
                {!isPending && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/30">
                        Airbtics API
                    </span>
                )}
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
                ) : null}
            </div>
        </div>
    );
}
