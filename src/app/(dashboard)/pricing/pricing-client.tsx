"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Building2, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";

export type ProposalData = {
    id: string;
    listingId: string;
    date: string;
    currentPrice: string;
    proposedPrice: string | null;
    changePct: number | null;
    reasoning: string | null;
    listingName: string;
};

export function PricingClient({ initialProposals }: { initialProposals: ProposalData[] }) {
    const [proposals, setProposals] = useState<ProposalData[]>(initialProposals);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);

    const toggleSelectAll = () => {
        if (selectedIds.size === proposals.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(proposals.map(p => p.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkAction = async (action: 'approve' | 'reject') => {
        if (selectedIds.size === 0) return;
        setIsProcessing(true);
        const ids = Array.from(selectedIds);
        try {
            const response = await fetch(`/api/proposals/bulk-${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proposalIds: ids }),
            });
            if (!response.ok) throw new Error(`Failed to ${action} proposals`);

            const { count } = await response.json();
            toast.success(`Successfully ${action}d ${count} proposals! Syncing to PMS in the background...`);

            // Update local UI immediately
            setProposals(prev => prev.filter(p => !selectedIds.has(p.id)));
            setSelectedIds(new Set());
        } catch (err) {
            console.error(err);
            toast.error(`Error trying to ${action} proposals.`);
        } finally {
            setIsProcessing(false);
        }
    };

    if (proposals.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-background/40 backdrop-blur-xl border border-dashed border-border rounded-2xl h-full shadow-2xl">
                <div className="h-20 w-20 rounded-full bg-emerald-500/5 flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-foreground">All Caught Up!</h3>
                <p className="text-muted-foreground text-sm max-w-sm text-center leading-relaxed">
                    You have zero pending pricing proposals. As your AI identifies new market opportunities, they will automatically appear here for your review.
                </p>
            </div>
        );
    }

    return (
        <Card className="flex flex-col flex-1 overflow-hidden border-none bg-background/40 dark:bg-[#111113]/40 backdrop-blur-2xl shadow-2xl rounded-2xl relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-primary/5 pointer-events-none" />

            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-white/5 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">Approval Queue</span>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-foreground">Pricing Control</h2>
                            <Badge variant="outline" className="font-bold px-3 py-1 bg-amber-500/10 text-amber-600 border-amber-500/20 rounded-full text-[10px] uppercase tracking-wider">
                                {proposals.length} Proposals Pending
                            </Badge>
                        </div>
                    </div>
                    {selectedIds.size > 0 && (
                        <div className="h-8 w-px bg-border/50 mx-2" />
                    )}
                    {selectedIds.size > 0 && (
                        <span className="text-sm text-primary font-bold animate-in fade-in slide-in-from-left-2 uppercase tracking-tighter">
                            {selectedIds.size} Selected
                        </span>
                    )}
                </div>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={selectedIds.size === 0 || isProcessing}
                        onClick={() => handleBulkAction('reject')}
                        className="h-9 px-4 border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl transition-all font-bold uppercase tracking-wider text-[11px]"
                    >
                        Reject
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        disabled={selectedIds.size === 0 || isProcessing}
                        onClick={() => handleBulkAction('approve')}
                        className="h-9 px-6 bg-primary hover:bg-primary/90 text-primary-foreground min-w-[140px] rounded-xl shadow-lg shadow-primary/20 font-bold uppercase tracking-wider text-[11px] transition-all active:scale-95"
                    >
                        {isProcessing ? <RefreshCcw className="h-4 w-4 animate-spin" /> : "Approve Selected"}
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-transparent z-10 custom-scrollbar">
                <Table>
                    <TableHeader className="sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border/50 font-bold tracking-widest text-[10px] uppercase italic text-muted-foreground/70">
                        <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="w-[60px] text-center py-4 pl-4">
                                <Checkbox
                                    checked={selectedIds.size === proposals.length && proposals.length > 0}
                                    onCheckedChange={toggleSelectAll}
                                    aria-label="Select all"
                                    className="border-primary/50 data-[state=checked]:bg-primary"
                                />
                            </TableHead>
                            <TableHead className="py-4">Property</TableHead>
                            <TableHead className="py-4">Target Date</TableHead>
                            <TableHead className="text-right py-4">Current</TableHead>
                            <TableHead className="text-right py-4">Proposed</TableHead>
                            <TableHead className="text-center py-4">Delta</TableHead>
                            <TableHead className="max-w-[300px] py-4 pr-8">AI Reasoning & Context</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {proposals.map((prop) => (
                            <TableRow
                                key={prop.id}
                                className={`cursor-pointer group border-b border-border/30 hover:bg-white/5 transition-all duration-300 ${selectedIds.has(prop.id) ? 'bg-primary/5' : ''}`}
                                onClick={() => toggleSelect(prop.id)}
                            >
                                <TableCell className="text-center py-5 pl-4">
                                    <Checkbox
                                        checked={selectedIds.has(prop.id)}
                                        onCheckedChange={() => toggleSelect(prop.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Select row ${prop.id}`}
                                        className="border-primary/50 data-[state=checked]:bg-primary"
                                    />
                                </TableCell>
                                <TableCell className="py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-muted/40 flex items-center justify-center group-hover:bg-primary/10 transition-colors border border-border/50">
                                            <Building2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors opacity-60" />
                                        </div>
                                        <span className="font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">{prop.listingName}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-5">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-foreground text-sm">{format(parseISO(prop.date), "MMM dd, yyyy")}</span>
                                        <span className="text-[10px] text-muted-foreground/70 font-medium uppercase tracking-tighter italic">Optimization Slot</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums py-5 opacity-40 font-medium line-through decoration-muted-foreground/30">
                                    AED {prop.currentPrice}
                                </TableCell>
                                <TableCell className="text-right py-5">
                                    <span className="text-sm font-black text-foreground tabular-nums tracking-tighter pointer-events-none ring-1 ring-primary/10 bg-primary/5 px-2 py-1 rounded">
                                        AED {prop.proposedPrice}
                                    </span>
                                </TableCell>
                                <TableCell className="text-center py-5">
                                    {prop.changePct && prop.changePct !== 0 ? (
                                        <Badge variant="outline" className={`font-black text-[10px] uppercase tracking-tighter px-2 py-0.5 rounded-sm bg-transparent border-none ${prop.changePct > 0 ? "text-emerald-500" : "text-amber-500"}`}>
                                            {prop.changePct > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                            {Math.abs(prop.changePct)}%
                                        </Badge>
                                    ) : (
                                        <span className="text-muted-foreground/30">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[350px] py-5 pr-8 truncate group-hover:whitespace-normal group-hover:text-foreground transition-all">
                                    {prop.reasoning}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
