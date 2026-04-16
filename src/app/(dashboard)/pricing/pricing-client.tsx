"use client";

import { useState, useMemo } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  XCircle,
  AlertTriangle,
  Clock,
  Building2,
  ArrowUpDown,
  Pencil,
  X,
  Upload,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProposalData = {
  id: string;
  listingId: string;
  date: string;
  currentPrice: string;
  proposedPrice: string | null;
  changePct: number | null;
  reasoning: string | null;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  proposalStatus: string;
  listingName: string;
  currencyCode?: string;
};

type StatusTab = "pending" | "approved" | "rejected" | "pushed";
type SortKey = "date" | "changePct" | "property";

// ── Helpers ───────────────────────────────────────────────────────────────────

// PRD Agent 6 Approval Classification Rules (page 13):
// < 5% no event context = Low (auto-approve)
// 5–15% single signal   = Medium (human approval)
// > 15% any level       = High (human approval)
function riskLevel(pct: number | null): "high" | "medium" | "low" {
  const abs = Math.abs(pct ?? 0);
  if (abs > 15) return "high";
  if (abs >= 5) return "medium";
  return "low";
}

function isStale(dateStr: string): boolean {
  try {
    return differenceInDays(parseISO(dateStr), new Date()) <= 1;
  } catch {
    return false;
  }
}

function fmtDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), "EEE, d MMM");
  } catch {
    return dateStr;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === 0)
    return <span className="text-muted-foreground text-xs">—</span>;
  const up = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-bold tabular-nums",
        up ? "text-green-400" : "text-red-400"
      )}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function RiskBadge({ pct }: { pct: number | null }) {
  const level = riskLevel(pct);
  const styles = {
    high: "bg-red-500/10 text-red-400 border-red-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-green-500/10 text-green-400 border-green-500/20",
  };
  return (
    <span
      className={cn(
        "text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide",
        styles[level]
      )}
    >
      {level}
    </span>
  );
}

function ReasoningCell({ reasoning }: { reasoning: string | null }) {
  const [open, setOpen] = useState(false);
  if (!reasoning) return <span className="text-muted-foreground text-xs">—</span>;
  const short = reasoning.length > 90;
  return (
    <div className="text-xs text-foreground/80 leading-relaxed">
      <span>{open || !short ? reasoning : `${reasoning.slice(0, 90)}…`}</span>
      {short && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="ml-1.5 text-amber-600 hover:text-amber-500 dark:text-amber/80 dark:hover:text-amber inline-flex items-center gap-0.5"
        >
          {open ? (
            <>
              <ChevronUp className="h-3 w-3" />less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function ConstraintBadges({ row }: { row: ProposalData }) {
  const tags: { label: string; color: string }[] = [];
  if (row.minStay && row.minStay > 1)
    tags.push({
      label: `${row.minStay}N min`,
      color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    });
  if (row.maxStay && row.maxStay < 30)
    tags.push({
      label: `${row.maxStay}N max`,
      color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    });
  if (row.closedToArrival)
    tags.push({
      label: "No arrival",
      color: "bg-red-500/10 text-red-400 border-red-500/20",
    });
  if (row.closedToDeparture)
    tags.push({
      label: "No depart",
      color: "bg-red-500/10 text-red-400 border-red-500/20",
    });
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((t) => (
        <span
          key={t.label}
          className={cn("text-[9px] font-medium px-1.5 py-0.5 rounded border", t.color)}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PricingClient({
  initialProposals,
}: {
  initialProposals: ProposalData[];
}) {
  const [proposals, setProposals] = useState<ProposalData[]>(initialProposals);
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // Modify state — inline price edit
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modifyPrice, setModifyPrice] = useState("");
  const [isSavingModify, setIsSavingModify] = useState(false);

  // Filters
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterDirection, setFilterDirection] = useState<"all" | "up" | "down">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Unique properties for filter dropdown
  const propertyOptions = useMemo(() => {
    const names = [...new Set(proposals.map((p) => p.listingName))].sort();
    return names;
  }, [proposals]);

  // Filtered + sorted proposals for current tab
  const displayProposals = useMemo(() => {
    let list = proposals.filter((p) => p.proposalStatus === activeTab);

    if (filterProperty !== "all") {
      list = list.filter((p) => p.listingName === filterProperty);
    }
    if (activeTab === "pending") {
      if (filterDirection === "up") list = list.filter((p) => (p.changePct ?? 0) > 0);
      if (filterDirection === "down") list = list.filter((p) => (p.changePct ?? 0) < 0);
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "changePct")
        cmp = (Math.abs(a.changePct ?? 0)) - (Math.abs(b.changePct ?? 0));
      else if (sortKey === "property")
        cmp = a.listingName.localeCompare(b.listingName);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [proposals, activeTab, filterProperty, filterDirection, sortKey, sortDir]);

  // Tab counts
  const counts = useMemo(
    () => ({
      pending: proposals.filter((p) => p.proposalStatus === "pending").length,
      approved: proposals.filter((p) => p.proposalStatus === "approved").length,
      rejected: proposals.filter((p) => p.proposalStatus === "rejected").length,
      pushed: proposals.filter((p) => p.proposalStatus === "pushed").length,
    }),
    [proposals]
  );

  // Pending KPIs
  const pendingList = proposals.filter((p) => p.proposalStatus === "pending");
  const increases = pendingList.filter((p) => (p.changePct ?? 0) > 0).length;
  const decreases = pendingList.filter((p) => (p.changePct ?? 0) < 0).length;
  const avgDelta =
    pendingList.length > 0
      ? Math.round(
          pendingList.reduce((s, p) => s + (p.changePct ?? 0), 0) / pendingList.length
        )
      : 0;

  // Selection helpers
  const pendingDisplay = displayProposals.filter((p) => p.proposalStatus === "pending");
  const approvedDisplay = displayProposals.filter((p) => p.proposalStatus === "approved");
  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === pendingDisplay.length
        ? new Set()
        : new Set(pendingDisplay.map((p) => p.id))
    );
  };
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch(`/api/proposals/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: ids }),
      });
      if (!res.ok) throw new Error();
      const { count } = await res.json();
      toast.success(`${count} proposals ${action}d and saved to MongoDB.`);
      setProposals((prev) =>
        prev.map((p) =>
          selectedIds.has(p.id)
            ? { ...p, proposalStatus: action === "approve" ? "approved" : "rejected" }
            : p
        )
      );
      setSelectedIds(new Set());
    } catch {
      toast.error(`Failed to ${action} proposals.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSingleAction = async (id: string, action: "approve" | "reject") => {
    try {
      const res = await fetch(`/api/proposals/bulk-${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: [id] }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Proposal ${action}d and saved to MongoDB.`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, proposalStatus: action === "approve" ? "approved" : "rejected" }
            : p
        )
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      toast.error(`Failed to ${action} proposal.`);
    }
  };

  const handlePushAction = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsProcessing(true);
    try {
      const res = await fetch("/api/v1/revenue/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _ids: ids, action: "push" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || payload?.message || "Failed to push proposals");
      setProposals((prev) =>
        prev.map((p) => (ids.includes(p.id) ? { ...p, proposalStatus: "pushed" } : p))
      );
      setSelectedIds(new Set());
      toast.success(`${ids.length} approved proposal${ids.length > 1 ? "s" : ""} pushed to MongoDB.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to push proposals.");
    } finally {
      setIsProcessing(false);
    }
  };

  const openModify = (row: ProposalData) => {
    setModifyingId(row.id);
    setModifyPrice(row.proposedPrice ?? row.currentPrice);
  };

  const cancelModify = () => {
    setModifyingId(null);
    setModifyPrice("");
  };

  const handleModify = async (id: string) => {
    const price = Number(modifyPrice);
    if (!price || price <= 0) {
      toast.error("Enter a valid price.");
      return;
    }
    setIsSavingModify(true);
    try {
      const res = await fetch("/api/proposals/bulk-modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: [id], newPrice: price }),
      });
      if (!res.ok) throw new Error();
      const current = proposals.find((p) => p.id === id)?.currentPrice ?? "0";
      const changePct = Number(current) > 0
        ? Math.round(((price - Number(current)) / Number(current)) * 100)
        : null;
      const currency = proposals.find((p) => p.id === id)?.currencyCode || "AED";
      toast.success(`Price modified to ${currency} ${price.toLocaleString("en-US")} and saved.`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, proposedPrice: String(price), changePct } : p
        )
      );
      cancelModify();
    } catch {
      toast.error("Failed to save modified price.");
    } finally {
      setIsSavingModify(false);
    }
  };

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const STATUS_TABS: { id: StatusTab; label: string; color: string }[] = [
    { id: "pending", label: "Pending", color: "text-amber-400" },
    { id: "approved", label: "Approved", color: "text-green-400" },
    { id: "rejected", label: "Rejected", color: "text-red-400" },
    { id: "pushed", label: "Pushed", color: "text-blue-400" },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Strip — pending only */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pending", value: counts.pending, color: "text-amber-400" },
          { label: "Increases", value: increases, color: "text-green-400" },
          { label: "Decreases", value: decreases, color: "text-red-400" },
          {
            label: "Avg Change",
            value: `${avgDelta > 0 ? "+" : ""}${avgDelta}%`,
            color: avgDelta >= 0 ? "text-green-400" : "text-red-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]"
          >
            <p className="text-[11px] text-muted-foreground mb-1 font-medium">{s.label}</p>
            <p className={cn("text-2xl font-bold tabular-nums text-foreground", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 border-b border-border/70 dark:border-white/10">
        {STATUS_TABS.map(({ id, label, color }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSelectedIds(new Set()); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === id
                ? `border-current ${color}`
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {counts[id] > 0 && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === id ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filter + Sort Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Select value={filterProperty} onValueChange={setFilterProperty}>
          <SelectTrigger className="h-8 w-44 text-xs bg-background border-border/70 text-foreground shadow-sm">
            <SelectValue placeholder="All properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All properties</SelectItem>
            {propertyOptions.map((name) => (
              <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeTab === "pending" && (
          <Select value={filterDirection} onValueChange={(v) => setFilterDirection(v as typeof filterDirection)}>
            <SelectTrigger className="h-8 w-36 text-xs bg-background border-border/70 text-foreground shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All directions</SelectItem>
              <SelectItem value="up" className="text-xs">Increases only</SelectItem>
              <SelectItem value="down" className="text-xs">Decreases only</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2 py-1 shadow-sm">
          <span className="text-[11px] font-semibold text-foreground">Sort:</span>
          {(["date", "changePct", "property"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => cycleSort(key)}
              className={cn(
                "flex items-center gap-0.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium",
                sortKey === key
                  ? "border-amber/40 bg-amber/10 text-amber"
                  : "border-border/60 bg-muted/30 text-foreground hover:border-border"
              )}
            >
              {key === "date" ? "Date" : key === "changePct" ? "Change %" : "Property"}
              {sortKey === key && (
                <ArrowUpDown className="h-2.5 w-2.5" />
              )}
            </button>
          ))}
          <button
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="text-[11px] px-2.5 py-1 rounded-md border border-border/60 bg-muted/30 text-foreground font-medium hover:border-border"
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>

      {/* Bulk Actions (pending tab only) */}
      {activeTab === "pending" && pendingDisplay.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-xs text-foreground font-medium cursor-pointer rounded-lg border border-border/60 bg-background px-3 py-2 shadow-sm">
            <Checkbox
              checked={
                selectedIds.size === pendingDisplay.length && pendingDisplay.length > 0
              }
              onCheckedChange={toggleSelectAll}
            />
            Select all ({pendingDisplay.length})
          </label>
          {selectedIds.size > 0 && (
            <span className="text-xs text-amber font-medium">
              {selectedIds.size} selected
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0 || isProcessing}
              onClick={() => handleBulkAction("reject")}
              className="h-8 px-3 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10 gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject Selected
            </Button>
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || isProcessing}
              onClick={() => handleBulkAction("approve")}
              className="h-8 px-4 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
            >
              {isProcessing ? (
                <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve Selected
            </Button>
          </div>
        </div>
      )}

      {activeTab === "approved" && approvedDisplay.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={approvedDisplay.length === 0 || isProcessing}
            onClick={() => handlePushAction(approvedDisplay.map((p) => p.id))}
            className="h-8 px-4 text-xs bg-blue-600 text-white hover:bg-blue-500 gap-1.5"
          >
            {isProcessing ? (
              <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Push All Approved
          </Button>
        </div>
      )}

      {/* Proposal List */}
      {displayProposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            {activeTab === "pending"
              ? "No pending proposals — all caught up."
              : `No ${activeTab} proposals in the last 14 days.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/70 overflow-hidden bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-3 bg-muted/40 border-b border-border/70 text-[10px] text-muted-foreground uppercase tracking-[0.18em] dark:border-white/10 dark:bg-white/[0.04]">
            {activeTab === "pending" && <div className="w-4" />}
            <div>Date · Property</div>
            <div className="text-right">Price</div>
            <div className="text-center">Risk</div>
            <div>Reasoning</div>
            {(activeTab === "pending" || activeTab === "approved") && <div>Actions</div>}
          </div>

          <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
            {displayProposals.map((row) => {
              const stale = activeTab === "pending" && isStale(row.date);

              return (
                <div
                  key={row.id}
                  className={cn(
                    "grid gap-x-4 px-4 py-3.5 hover:bg-muted/35 transition-colors dark:hover:bg-white/[0.03]",
                    activeTab === "pending" || activeTab === "approved"
                      ? "grid-cols-[auto_1fr_auto_auto_auto_auto]"
                      : "grid-cols-[1fr_auto_auto_auto]",
                    stale && "border-l-2 border-l-amber/40"
                  )}
                >
                  {/* Checkbox */}
                  {activeTab === "pending" && (
                    <div className="flex items-center">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => toggleSelect(row.id)}
                      />
                    </div>
                  )}

                  {/* Date + Property */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-foreground">
                        {fmtDate(row.date)}
                      </span>
                      {stale && (
                        <span className="flex items-center gap-0.5 text-[9px] text-amber">
                          <Clock className="h-2.5 w-2.5" />
                          Expiring
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{row.listingName}</div>
                    <ConstraintBadges row={row} />
                  </div>

                  {/* Price */}
                  <div className="text-right shrink-0">
                    {activeTab === "pending" && row.proposedPrice ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground line-through">
                          {row.currencyCode || "AED"} {Number(row.currentPrice).toLocaleString("en-US")}
                        </div>
                        <div className="text-sm font-bold text-foreground">
                          {row.currencyCode || "AED"} {Number(row.proposedPrice).toLocaleString("en-US")}
                        </div>
                        <DeltaBadge pct={row.changePct} />
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-bold text-foreground">
                          {row.currencyCode || "AED"} {Number(row.currentPrice).toLocaleString("en-US")}
                        </div>
                        <span className={cn(
                          "text-[10px] font-medium",
                          activeTab === "approved" ? "text-green-400" :
                          activeTab === "rejected" ? "text-red-400" :
                          "text-blue-400"
                        )}>
                          {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Risk */}
                  <div className="flex items-start pt-0.5 shrink-0">
                    {activeTab === "pending" ? (
                      <RiskBadge pct={row.changePct} />
                    ) : (
                      <Badge
                        className={cn(
                          "text-[9px] border",
                          activeTab === "approved"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : activeTab === "rejected"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        )}
                      >
                        {activeTab}
                      </Badge>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div className="min-w-0 max-w-xs">
                    <ReasoningCell reasoning={row.reasoning} />
                  </div>

                  {/* Row Actions (pending only) */}
                  {(activeTab === "pending" || activeTab === "approved") && (
                    <div className="flex flex-col gap-1 shrink-0">
                      {activeTab === "pending" && modifyingId === row.id ? (
                        // ── Inline modify form ──
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{row.currencyCode || "AED"}</span>
                          <Input
                            type="number"
                            value={modifyPrice}
                            onChange={(e) => setModifyPrice(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleModify(row.id);
                              if (e.key === "Escape") cancelModify();
                            }}
                            className="h-6 w-20 text-xs bg-background border-border/70 px-1.5 text-foreground dark:bg-white/[0.04] dark:border-white/15"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            disabled={isSavingModify}
                            onClick={() => handleModify(row.id)}
                            className="h-6 px-2 text-[10px] bg-amber text-black hover:bg-amber/90"
                          >
                            {isSavingModify ? <RefreshCcw className="h-2.5 w-2.5 animate-spin" /> : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelModify}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : activeTab === "pending" ? (
                        // ── Default action buttons ──
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSingleAction(row.id, "approve")}
                            className="h-7 px-2 text-[11px] text-green-400 hover:bg-green-500/10 hover:text-green-300 gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openModify(row)}
                            className="h-7 px-2 text-[11px] text-amber/80 hover:bg-amber/10 hover:text-amber gap-1"
                          >
                            <Pencil className="h-3 w-3" />
                            Modify
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSingleAction(row.id, "reject")}
                            className="h-7 px-2 text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => handlePushAction([row.id])}
                            className="h-7 px-2.5 text-[11px] bg-blue-600 text-white hover:bg-blue-500 gap-1"
                          >
                            <Upload className="h-3 w-3" />
                            Push
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* High-risk warning */}
          {activeTab === "pending" && displayProposals.filter((p) => riskLevel(p.changePct) === "high").length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/5 border-t border-red-500/10">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">
                <strong>{displayProposals.filter((p) => riskLevel(p.changePct) === "high").length} high-risk proposals</strong> (&gt;15% change) — review individually before bulk approving.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
