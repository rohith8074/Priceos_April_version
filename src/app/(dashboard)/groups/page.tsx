"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Home,
  X,
  Loader2,
  Save,
  ShieldCheck,
  Sun,

  TrendingDown,
  AlignLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  _id: string;
  name: string;
  area?: string;
  bedroomsNumber?: number;
}

interface PricingRule {
  _id: string;
  ruleType: "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
  ruleCategory?:
    | "GUARDRAILS"
    | "SEASONS"
    | "LEAD_TIME"
    | "GAP_LOGIC"
    | "LOS_DISCOUNTS"
    | "DATE_OVERRIDES"
    | "OCCUPANCY";
  name: string;
  enabled: boolean;
  priority: number;
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  minNights?: number;
  priceAdjPct?: number;
  priceOverride?: number;
  minPriceOverride?: number;
  maxPriceOverride?: number;
  minStayOverride?: number;
  isBlocked?: boolean;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  suspendLastMinute?: boolean;
  suspendGapFill?: boolean;
}

interface PropertyGroup {
  _id: string;
  name: string;
  description?: string;
  color: string;
  listingIds: string[];
}

// ── Colour palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

// ── Rule type icons ────────────────────────────────────────────────────────────

const RULE_ICONS: Record<string, React.ReactNode> = {
  SEASON: <Sun className="w-3.5 h-3.5" />,
  EVENT: <ShieldCheck className="w-3.5 h-3.5" />,
  ADMIN_BLOCK: <AlignLeft className="w-3.5 h-3.5" />,
  LOS_DISCOUNT: <TrendingDown className="w-3.5 h-3.5" />,
};

const RULE_TYPE_LABELS: Record<string, string> = {
  SEASON: "Seasonal",
  EVENT: "Event",
  ADMIN_BLOCK: "Block",
  LOS_DISCOUNT: "LOS Discount",
};
const RULE_CATEGORY_LABELS: Record<string, string> = {
  GUARDRAILS: "Guardrails",
  SEASONS: "Seasons",
  LEAD_TIME: "Lead Time",
  GAP_LOGIC: "Gap Logic",
  LOS_DISCOUNTS: "LOS Discounts",
  DATE_OVERRIDES: "Date Overrides",
  OCCUPANCY: "Occupancy",
};
const CATEGORY_TO_RULE_TYPE: Record<string, PricingRule["ruleType"]> = {
  GUARDRAILS: "EVENT",
  SEASONS: "SEASON",
  LEAD_TIME: "EVENT",
  GAP_LOGIC: "EVENT",
  LOS_DISCOUNTS: "LOS_DISCOUNT",
  DATE_OVERRIDES: "ADMIN_BLOCK",
  OCCUPANCY: "EVENT",
};
function fallbackCategoryFromRuleType(ruleType: PricingRule["ruleType"]) {
  if (ruleType === "SEASON") return "SEASONS";
  if (ruleType === "ADMIN_BLOCK") return "DATE_OVERRIDES";
  if (ruleType === "LOS_DISCOUNT") return "LOS_DISCOUNTS";
  return "LEAD_TIME";
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
];

// ── API helpers ────────────────────────────────────────────────────────────────

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Group form (create / edit) ─────────────────────────────────────────────────

function GroupForm({
  initial,
  allListings,
  onSave,
  onCancel,
}: {
  initial?: PropertyGroup;
  allListings: Listing[];
  onSave: (g: PropertyGroup) => void;
  onCancel: () => void;
}) {
  const safeListings = Array.isArray(allListings) ? allListings : [];
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#6366f1");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initial?.listingIds ?? [])
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    setSaving(true);
    try {
      const payload = { name, description, color, listingIds: [...selectedIds] };
      const saved = initial
        ? await api(`/api/groups/${initial._id}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/groups", { method: "POST", body: JSON.stringify(payload) });
      onSave(saved);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-1 border border-border-default rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">
          {initial ? "Edit Group" : "New Group"}
        </h3>
        <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name + colour */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Group name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marina Portfolio" />
        </div>
        <div className="space-y-1.5">
          <Label>Colour</Label>
          <div className="flex gap-2 flex-wrap pt-0.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform",
                  color === c ? "border-white scale-110 shadow-md" : "border-transparent"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description <span className="text-text-tertiary text-xs">(optional)</span></Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dubai Marina beachfront units" />
      </div>

      {/* Property selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Properties in this group <span className="text-text-tertiary text-xs">({selectedIds.size} selected)</span></Label>
          <span className="text-[11px] text-text-tertiary">{safeListings.length} total</span>
        </div>
        <div className="border border-border-default rounded-lg divide-y divide-border-default max-h-[26rem] overflow-y-auto">
          {safeListings.length === 0 && (
            <p className="p-3 text-xs text-text-tertiary">No properties found.</p>
          )}
          {safeListings.map((l) => (
            <label
              key={l._id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2 transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(l._id)}
                onChange={() => toggle(l._id)}
                className="rounded border-border-default"
              />
              <span className="flex-1 text-sm text-text-primary truncate">{l.name}</span>
              {l.bedroomsNumber != null && (
                <span className="text-xs text-text-tertiary shrink-0">{l.bedroomsNumber}BR</span>
              )}
            </label>
          ))}
        </div>
        {safeListings.length > 10 && (
          <p className="text-[11px] text-text-tertiary">Scroll to see all properties.</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          {initial ? "Save changes" : "Create group"}
        </Button>
      </div>
    </div>
  );
}

// ── Rule row ───────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  groupId,
  onToggle,
  onDelete,
}: {
  rule: PricingRule;
  groupId: string;
  onToggle: (r: PricingRule) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/groups/${groupId}/rules/${rule._id}`, { method: "DELETE" });
      onDelete(rule._id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    try {
      const updated = await api(`/api/groups/${groupId}/rules/${rule._id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      onToggle(updated);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const detail = rule.priceAdjPct != null
    ? `${rule.priceAdjPct > 0 ? "+" : ""}${rule.priceAdjPct}%`
    : rule.priceOverride != null
    ? `Fixed price`
    : rule.isBlocked
    ? "Blocked"
    : "—";
  const categoryLabel = RULE_CATEGORY_LABELS[
    (rule.ruleCategory || fallbackCategoryFromRuleType(rule.ruleType)) as keyof typeof RULE_CATEGORY_LABELS
  ];

  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
      rule.enabled
        ? "bg-surface-1 border-border-default"
        : "bg-surface-0 border-border-subtle opacity-60"
    )}>
      <span className="text-text-tertiary">{RULE_ICONS[rule.ruleType]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{rule.name}</p>
        <p className="text-xs text-text-tertiary">
          {categoryLabel} · {RULE_TYPE_LABELS[rule.ruleType]} · {detail}
          {rule.startDate && ` · ${rule.startDate} → ${rule.endDate ?? "?"}`}
        </p>
      </div>
      <Switch checked={rule.enabled} onCheckedChange={handleToggle} />
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-text-tertiary hover:text-red-500 transition-colors p-1"
      >
        {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ── Add-rule mini form ─────────────────────────────────────────────────────────

function AddRuleForm({
  groupId,
  initialCategory,
  onAdded,
  onCancel,
}: {
  groupId: string;
  initialCategory: NonNullable<PricingRule["ruleCategory"]>;
  onAdded: (r: PricingRule) => void;
  onCancel: () => void;
}) {
  const [ruleCategory] = useState<NonNullable<PricingRule["ruleCategory"]>>(initialCategory);
  const [name, setName] = useState("");
  const [priceAdjPct, setPriceAdjPct] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [minPriceOverride, setMinPriceOverride] = useState("");
  const [maxPriceOverride, setMaxPriceOverride] = useState("");
  const [minStayOverride, setMinStayOverride] = useState("");
  const [minNights, setMinNights] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [isBlocked, setIsBlocked] = useState(ruleCategory === "DATE_OVERRIDES");
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);
  const [suspendLastMinute, setSuspendLastMinute] = useState(ruleCategory === "GAP_LOGIC");
  const [suspendGapFill, setSuspendGapFill] = useState(ruleCategory === "GAP_LOGIC");
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Rule name is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ruleType: CATEGORY_TO_RULE_TYPE[ruleCategory],
        ruleCategory,
        name: name.trim(),
        enabled: true,
        priority: 0,
        isBlocked,
        closedToArrival,
        closedToDeparture,
        suspendLastMinute,
        suspendGapFill,
      };
      if (priceAdjPct !== "") payload.priceAdjPct = Number(priceAdjPct);
      if (priceOverride !== "") payload.priceOverride = Number(priceOverride);
      if (minPriceOverride !== "") payload.minPriceOverride = Number(minPriceOverride);
      if (maxPriceOverride !== "") payload.maxPriceOverride = Number(maxPriceOverride);
      if (minStayOverride !== "") payload.minStayOverride = Number(minStayOverride);
      if (minNights !== "") payload.minNights = Number(minNights);
      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
      if (daysOfWeek.length > 0) payload.daysOfWeek = daysOfWeek;

      const rule = await api(`/api/groups/${groupId}/rules`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onAdded(rule);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border-default bg-surface-0 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-text-primary">
            Add {RULE_CATEGORY_LABELS[ruleCategory]}
          </p>
          <p className="text-[11px] text-text-tertiary">
            This group rule applies to all properties in the selected group and overrides overlapping property rules.
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {RULE_CATEGORY_LABELS[ruleCategory]}
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Eid Uplift" />
        </div>
        {(ruleCategory === "SEASONS" || ruleCategory === "LEAD_TIME" || ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "OCCUPANCY") && (
          <div className="space-y-1">
            <Label className="text-xs">Price adj %</Label>
            <Input className="h-8 text-xs" type="number" value={priceAdjPct} onChange={(e) => setPriceAdjPct(e.target.value)} placeholder="e.g. 20" />
          </div>
        )}
        {(ruleCategory === "DATE_OVERRIDES" || ruleCategory === "GUARDRAILS") && (
          <div className="space-y-1">
            <Label className="text-xs">Fixed price</Label>
            <Input className="h-8 text-xs" type="number" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} placeholder="e.g. 950" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start date</Label>
          <Input className="h-8 text-xs" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End date</Label>
          <Input className="h-8 text-xs" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {(ruleCategory === "SEASONS" || ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "DATE_OVERRIDES" || ruleCategory === "GUARDRAILS") && (
          <div className="space-y-1">
            <Label className="text-xs">Min stay override</Label>
            <Input className="h-8 text-xs" type="number" value={minStayOverride} onChange={(e) => setMinStayOverride(e.target.value)} placeholder="e.g. 3" />
          </div>
        )}
      </div>

      {ruleCategory === "GUARDRAILS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Min price override</Label>
            <Input className="h-8 text-xs" type="number" value={minPriceOverride} onChange={(e) => setMinPriceOverride(e.target.value)} placeholder="e.g. 400" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max price override</Label>
            <Input className="h-8 text-xs" type="number" value={maxPriceOverride} onChange={(e) => setMaxPriceOverride(e.target.value)} placeholder="e.g. 2500" />
          </div>
        </div>
      )}

      {(ruleCategory === "LOS_DISCOUNTS" || ruleCategory === "LEAD_TIME" || ruleCategory === "GAP_LOGIC") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Minimum nights</Label>
            <Input className="h-8 text-xs" type="number" value={minNights} onChange={(e) => setMinNights(e.target.value)} placeholder="e.g. 2" />
          </div>
          {ruleCategory === "GAP_LOGIC" && (
            <div className="space-y-1">
              <Label className="text-xs">Min stay override</Label>
              <Input className="h-8 text-xs" type="number" value={minStayOverride} onChange={(e) => setMinStayOverride(e.target.value)} placeholder="e.g. 1" />
            </div>
          )}
        </div>
      )}

      {(ruleCategory === "LEAD_TIME" || ruleCategory === "OCCUPANCY") && (
        <div className="space-y-2">
          <Label className="text-xs">Days of week</Label>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = daysOfWeek.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "border-amber-500 bg-amber-500 text-black"
                      : "border-border-default bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(ruleCategory === "GAP_LOGIC" || ruleCategory === "DATE_OVERRIDES") && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Block date</span>
            <Switch checked={isBlocked} onCheckedChange={setIsBlocked} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Closed to arrival</span>
            <Switch checked={closedToArrival} onCheckedChange={setClosedToArrival} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
            <span className="text-xs text-foreground">Closed to departure</span>
            <Switch checked={closedToDeparture} onCheckedChange={setClosedToDeparture} />
          </label>
          {ruleCategory === "GAP_LOGIC" && (
            <>
              <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
                <span className="text-xs text-foreground">Suspend last-minute logic</span>
                <Switch checked={suspendLastMinute} onCheckedChange={setSuspendLastMinute} />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border-default bg-background px-3 py-2">
                <span className="text-xs text-foreground">Suspend gap-fill logic</span>
                <Switch checked={suspendGapFill} onCheckedChange={setSuspendGapFill} />
              </label>
            </>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border-default bg-background px-3 py-2 text-[11px] text-muted-foreground">
        {ruleCategory === "GUARDRAILS" && "Use this to enforce temporary min/max pricing bounds or fixed-rate exceptions across the whole group."}
        {ruleCategory === "SEASONS" && "Use date ranges plus price and stay changes for seasonal periods shared by all group members."}
        {ruleCategory === "LEAD_TIME" && "Use this to raise or lower pricing for selected weekdays or booking windows across the group."}
        {ruleCategory === "GAP_LOGIC" && "Use this to protect short gaps, change arrival/departure behavior, or suspend listing-level automation during special windows."}
        {ruleCategory === "LOS_DISCOUNTS" && "Use this to apply group-wide discounts or min-stay rules tied to booking length."}
        {ruleCategory === "DATE_OVERRIDES" && "Use this to block dates, set fixed prices, or force stay rules on specific dates for every property in the group."}
        {ruleCategory === "OCCUPANCY" && "Use this to add occupancy-driven price adjustments that the group should apply before any listing-specific rule."}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          Add rule
        </Button>
      </div>
    </div>
  );
}

// ── Group detail panel ─────────────────────────────────────────────────────────

function GroupDetail({
  group,
  allListings,
  onUpdated,
  onDeleted,
  onClose,
}: {
  group: PropertyGroup;
  allListings: Listing[];
  onUpdated: (g: PropertyGroup) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [activeRuleCategory, setActiveRuleCategory] = useState<NonNullable<PricingRule["ruleCategory"]>>("GUARDRAILS");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoadingRules(true);
    api(`/api/groups/${group._id}/rules`)
      .then(setRules)
      .catch(() => toast.error("Failed to load rules"))
      .finally(() => setLoadingRules(false));
  }, [group._id]);

  const memberListings = allListings.filter((l) => group.listingIds.includes(l._id));
  const filteredRules = rules.filter(
    (r) => (r.ruleCategory || fallbackCategoryFromRuleType(r.ruleType)) === activeRuleCategory
  );

  const handleDelete = async () => {
    if (!confirm(`Delete group "${group.name}" and all its rules?`)) return;
    setDeleting(true);
    try {
      await api(`/api/groups/${group._id}`, { method: "DELETE" });
      onDeleted(group._id);
    } catch (e: any) {
      toast.error(e.message);
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <GroupForm
        initial={group}
        allListings={allListings}
        onSave={(g) => { onUpdated(g); setEditing(false); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-surface-1 border border-border-default rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: group.color }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-primary truncate">{group.name}</p>
          {group.description && (
            <p className="text-xs text-text-tertiary truncate">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-500 hover:text-red-600"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Members */}
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            Properties ({memberListings.length})
          </p>
          {memberListings.length === 0 ? (
            <p className="text-xs text-text-tertiary italic">No properties assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {memberListings.map((l) => (
                <Badge key={l._id} variant="secondary" className="text-xs gap-1">
                  <Home className="w-3 h-3" />
                  {l.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Rules */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                Group Rules ({rules.length})
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                These rules apply to all {memberListings.length} properties in this group.
                When both levels define overlapping logic, group rules take precedence.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 shrink-0"
              onClick={() => setShowRuleForm(true)}
            >
              <Plus className="w-3 h-3" /> Add rule
            </Button>
          </div>
          <Tabs value={activeRuleCategory} onValueChange={(v) => { setActiveRuleCategory(v as NonNullable<PricingRule["ruleCategory"]>); setShowRuleForm(false); }} className="mb-4">
            <TabsList className="flex flex-wrap gap-1.5 h-auto bg-surface-2/60 p-1.5 rounded-lg border border-border-subtle">
              {(Object.entries(RULE_CATEGORY_LABELS) as [NonNullable<PricingRule["ruleCategory"]>, string][]).map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "gap-1.5 text-xs font-semibold transition-all rounded-md px-3 py-1.5 border relative",
                    activeRuleCategory === value
                      ? "bg-amber-500 text-black border-amber-500 shadow-lg ring-2 ring-amber-500/40 scale-[1.02]"
                      : "bg-transparent text-muted-foreground border-transparent hover:bg-background hover:text-foreground"
                  )}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {loadingRules ? (
            <div className="flex items-center gap-2 text-xs text-text-tertiary py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading rules…
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredRules.map((r) => (
                <RuleRow
                  key={r._id}
                  rule={r}
                  groupId={group._id}
                  onToggle={(updated) =>
                    setRules((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))
                  }
                  onDelete={(id) => setRules((prev) => prev.filter((x) => x._id !== id))}
                />
              ))}
              {filteredRules.length === 0 && !showRuleForm && (
                <p className="text-xs text-text-tertiary italic">
                  No {RULE_CATEGORY_LABELS[activeRuleCategory].toLowerCase()} group rules yet.
                </p>
              )}
            </div>
          )}

          {showRuleForm && (
            <div className="mt-2">
              <AddRuleForm
                groupId={group._id}
                initialCategory={activeRuleCategory}
                onAdded={(r) => { setRules((prev) => [...prev, r]); setShowRuleForm(false); }}
                onCancel={() => setShowRuleForm(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gs, ls] = await Promise.all([
        api("/api/groups"),
        api("/api/properties"),
      ]);
      const normalizedGroups = Array.isArray(gs) ? gs : gs?.groups ?? [];
      const rawListings = Array.isArray(ls) ? ls : ls?.properties ?? [];
      const normalizedListings = (rawListings as any[])
        .map((l) => ({
          ...l,
          _id: String(l?._id ?? l?.id ?? ""),
        }))
        .filter((l) => l._id.length > 0);
      setGroups(normalizedGroups);
      setListings(normalizedListings);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedGroup = groups.find((g) => g._id === selectedId) ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Layers className="w-6 h-6" /> Property Groups
          </h1>
          <p className="text-sm text-text-tertiary mt-1">
            Create groups of properties and set pricing rules that apply to all of them at once.
            Group rules override overlapping property rules.
          </p>
        </div>
        <Button onClick={() => { setShowCreate(true); setSelectedId(null); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> New group
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <GroupForm
          allListings={listings}
          onSave={(g) => { setGroups((prev) => [g, ...prev]); setShowCreate(false); setSelectedId(g._id); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Main layout: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* Group list */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-tertiary py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading groups…
            </div>
          ) : groups.length === 0 ? (
            <div className="border border-dashed border-border-default rounded-xl p-8 text-center">
              <Layers className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-sm font-medium text-text-primary">No groups yet</p>
              <p className="text-xs text-text-tertiary mt-1">
                Create a group to apply pricing rules to multiple properties at once.
              </p>
            </div>
          ) : (
            groups.map((g) => {
              const memberCount = g.listingIds.length;
              const isSelected = g._id === selectedId;
              return (
                <button
                  key={g._id}
                  onClick={() => { setSelectedId(g._id); setShowCreate(false); }}
                  className={cn(
                    "w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border-default bg-surface-1 hover:bg-surface-2"
                  )}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: g.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{g.name}</p>
                    <p className="text-xs text-text-tertiary">
                      {memberCount} {memberCount === 1 ? "property" : "properties"}
                    </p>
                  </div>
                  <ChevronRight className={cn("w-4 h-4 text-text-tertiary transition-transform", isSelected && "rotate-90")} />
                </button>
              );
            })
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedGroup ? (
            <GroupDetail
              key={selectedGroup._id}
              group={selectedGroup}
              allListings={listings}
              onUpdated={(g) => setGroups((prev) => prev.map((x) => (x._id === g._id ? g : x)))}
              onDeleted={(id) => { setGroups((prev) => prev.filter((x) => x._id !== id)); setSelectedId(null); }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            !showCreate && (
              <div className="border border-dashed border-border-default rounded-xl p-10 text-center h-full flex flex-col items-center justify-center">
                <Layers className="w-8 h-8 text-text-tertiary mb-2" />
                <p className="text-sm text-text-tertiary">Select a group to view details and manage rules.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
