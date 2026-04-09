"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  Sun,
  Clock,
  Layers,
  TrendingDown,
  AlignLeft,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Season Profiles ──────────────────────────────────────────────────────────

const DEFAULT_SEASONS = [
  { name: "Peak Winter", from: "12-01", to: "03-31", adjustment: 30, type: "percent" as const },
  { name: "Summer Trough", from: "06-01", to: "08-31", adjustment: -40, type: "percent" as const },
  { name: "Shoulder", from: "09-01", to: "11-30", adjustment: 0, type: "percent" as const },
];

function SeasonProfiles() {
  const [seasons, setSeasons] = useState(DEFAULT_SEASONS);

  const updateSeason = (i: number, key: string, value: unknown) =>
    setSeasons((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: value } : s)));

  const removeSeason = (i: number) =>
    setSeasons((prev) => prev.filter((_, idx) => idx !== i));

  const addSeason = () =>
    setSeasons((prev) => [
      ...prev,
      { name: "New Season", from: "01-01", to: "12-31", adjustment: 0, type: "percent" as const },
    ]);

  const handleSave = () => toast.success("Season profiles saved.");

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Define named seasons with a % adjustment from your base price. The most specific rule wins.
      </p>

      <div className="space-y-3">
        {seasons.map((s, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex flex-wrap gap-4 items-end"
          >
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs text-text-tertiary mb-1 block">Season Name</Label>
              <Input
                value={s.name}
                onChange={(e) => updateSeason(i, "name", e.target.value)}
                className="h-8 text-sm bg-white/5 border-white/10"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs text-text-tertiary mb-1 block">From (MM-DD)</Label>
              <Input
                value={s.from}
                onChange={(e) => updateSeason(i, "from", e.target.value)}
                placeholder="12-01"
                className="h-8 text-sm bg-white/5 border-white/10 font-mono"
              />
            </div>
            <div className="w-28">
              <Label className="text-xs text-text-tertiary mb-1 block">To (MM-DD)</Label>
              <Input
                value={s.to}
                onChange={(e) => updateSeason(i, "to", e.target.value)}
                placeholder="03-31"
                className="h-8 text-sm bg-white/5 border-white/10 font-mono"
              />
            </div>
            <div className="w-36">
              <Label className="text-xs text-text-tertiary mb-1 block">
                Adjustment: <span className={cn("font-bold", s.adjustment > 0 ? "text-green-400" : s.adjustment < 0 ? "text-red-400" : "text-text-secondary")}>{s.adjustment > 0 ? "+" : ""}{s.adjustment}%</span>
              </Label>
              <Slider
                min={-60}
                max={100}
                step={5}
                value={[s.adjustment]}
                onValueChange={([v]) => updateSeason(i, "adjustment", v)}
                className="mt-2"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-disabled hover:text-red-400 shrink-0"
              onClick={() => removeSeason(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={addSeason} className="gap-1.5 h-8 text-xs border-white/10">
          <Plus className="h-3.5 w-3.5" /> Add Season
        </Button>
        <Button size="sm" onClick={handleSave} className="bg-amber text-black hover:bg-amber/90 h-8 text-xs">
          Save Seasons
        </Button>
      </div>
    </div>
  );
}

// ── Day of Week ───────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DEFAULT_DOW = [0, 0, 0, 0, 10, 15, 10]; // % adjustment per day

function DayOfWeekTab() {
  const [adjustments, setAdjustments] = useState(DEFAULT_DOW);
  const [weekendDef, setWeekendDef] = useState<"fri_sat" | "sat_sun" | "thu_fri">("fri_sat");

  const updateDay = (i: number, v: number) =>
    setAdjustments((prev) => prev.map((a, idx) => (idx === i ? v : a)));

  const isWeekend = (i: number) => {
    if (weekendDef === "fri_sat") return i === 4 || i === 5;
    if (weekendDef === "sat_sun") return i === 5 || i === 6;
    return i === 3 || i === 4;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Label className="text-xs text-text-tertiary shrink-0">Weekend Definition:</Label>
        <div className="flex gap-2">
          {(["fri_sat", "sat_sun", "thu_fri"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setWeekendDef(opt)}
              className={cn(
                "text-xs px-3 py-1 rounded-full border transition-colors",
                weekendDef === opt
                  ? "bg-amber text-black border-amber"
                  : "border-white/10 text-text-secondary hover:border-white/20"
              )}
            >
              {opt === "fri_sat" ? "Fri / Sat (UAE)" : opt === "sat_sun" ? "Sat / Sun (Global)" : "Thu / Fri (Legacy)"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAYS.map((day, i) => (
          <div key={day} className="flex flex-col items-center gap-2">
            <span
              className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded-full",
                isWeekend(i) ? "bg-amber/10 text-amber" : "text-text-tertiary"
              )}
            >
              {day}
            </span>
            <div className="h-32 flex flex-col items-center justify-end gap-2 w-full">
              <span
                className={cn(
                  "text-xs font-bold",
                  adjustments[i] > 0 ? "text-green-400" : adjustments[i] < 0 ? "text-red-400" : "text-text-disabled"
                )}
              >
                {adjustments[i] > 0 ? "+" : ""}{adjustments[i]}%
              </span>
              <div className="relative h-24 w-full flex items-center justify-center">
                <Slider
                  min={-30}
                  max={50}
                  step={5}
                  value={[adjustments[i]]}
                  onValueChange={([v]) => updateDay(i, v)}
                  orientation="vertical"
                  className="h-24"
                />
              </div>
            </div>
            <div
              className={cn(
                "w-full h-1 rounded-full",
                isWeekend(i) ? "bg-amber/30" : "bg-white/5"
              )}
            />
          </div>
        ))}
      </div>

      <Button
        size="sm"
        onClick={() => toast.success("Day-of-week adjustments saved.")}
        className="bg-amber text-black hover:bg-amber/90 h-8 text-xs"
      >
        Save Day-of-Week
      </Button>
    </div>
  );
}

// ── Last-Minute Curve ─────────────────────────────────────────────────────────

function LastMinuteTab() {
  const [enabled, setEnabled] = useState(true);
  const [maxDiscount, setMaxDiscount] = useState(30);
  const [rampDays, setRampDays] = useState(15);

  // Preview curve: linear ramp from maxDiscount% at day 1 to 5% at rampDays
  const curvePoints = Array.from({ length: rampDays }, (_, i) => {
    const day = i + 1;
    const pct = Math.round(maxDiscount - ((maxDiscount - 5) / (rampDays - 1)) * i);
    return { day, pct };
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <Label className="text-sm text-text-primary">Enable last-minute discount curve</Label>
      </div>

      {enabled && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-text-tertiary mb-2 block">
                Max Discount at Day 1: <span className="font-bold text-red-400">-{maxDiscount}%</span>
              </Label>
              <Slider min={5} max={60} step={5} value={[maxDiscount]} onValueChange={([v]) => setMaxDiscount(v)} />
            </div>
            <div>
              <Label className="text-xs text-text-tertiary mb-2 block">
                Ramp Period: <span className="font-bold text-text-primary">{rampDays} days</span>
              </Label>
              <Slider min={3} max={30} step={1} value={[rampDays]} onValueChange={([v]) => setRampDays(v)} />
            </div>
          </div>

          {/* Preview table */}
          <div>
            <p className="text-xs text-text-tertiary mb-2">Discount curve preview:</p>
            <div className="flex gap-px overflow-x-auto pb-2">
              {curvePoints.map(({ day, pct }) => (
                <div key={day} className="flex flex-col items-center gap-1 min-w-[28px]">
                  <span className="text-[9px] text-red-400 font-bold">-{pct}%</span>
                  <div
                    className="w-5 bg-red-500/30 rounded-t"
                    style={{ height: `${Math.round((pct / 60) * 48)}px` }}
                  />
                  <span className="text-[9px] text-text-disabled">{day}d</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-text-tertiary bg-white/[0.02] border border-white/5 rounded-lg p-3">
            <Info className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
            Discount never goes below your floor price. For dates within {rampDays} days, the AI applies a
            -5% to -{maxDiscount}% sliding discount to fill vacancies.
          </div>
        </>
      )}

      <Button
        size="sm"
        onClick={() => toast.success("Last-minute curve saved.")}
        className="bg-amber text-black hover:bg-amber/90 h-8 text-xs"
      >
        Save Curve
      </Button>
    </div>
  );
}

// ── Gap Fill Rules ────────────────────────────────────────────────────────────

const DEFAULT_GAP_RULES = [
  { nights: "1", discountPct: 10, label: "1-night orphan" },
  { nights: "2", discountPct: 15, label: "2-night micro-gap" },
  { nights: "3-4", discountPct: 5, label: "3-4 night gap" },
];

function GapFillTab() {
  const [rules, setRules] = useState(DEFAULT_GAP_RULES);

  const updateRule = (i: number, key: string, value: unknown) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Gap fill rules apply discount to short available windows between existing bookings.
        The AI prefers LOS relaxation over discounting — discounts are a fallback.
      </p>

      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex items-center gap-4 flex-wrap"
          >
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs text-text-tertiary mb-1 block">Gap Size (nights)</Label>
              <Input
                value={rule.nights}
                onChange={(e) => updateRule(i, "nights", e.target.value)}
                placeholder="1"
                className="h-8 text-sm bg-white/5 border-white/10 font-mono w-24"
              />
            </div>
            <div className="w-52">
              <Label className="text-xs text-text-tertiary mb-1 block">
                Discount: <span className="font-bold text-amber">-{rule.discountPct}%</span>
              </Label>
              <Slider
                min={0}
                max={25}
                step={1}
                value={[rule.discountPct]}
                onValueChange={([v]) => updateRule(i, "discountPct", v)}
              />
            </div>
            <div className="text-xs text-text-disabled">{rule.label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-text-tertiary bg-white/[0.02] border border-white/5 rounded-lg p-3">
        <Info className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
        Gap fill discounts are capped by your market guardrail profile (UAE/GCC: 20% max;
        Europe: 15%; US Leisure: 25%). Auto-revert after 48h if no booking received.
      </div>

      <Button
        size="sm"
        onClick={() => toast.success("Gap fill rules saved.")}
        className="bg-amber text-black hover:bg-amber/90 h-8 text-xs"
      >
        Save Gap Rules
      </Button>
    </div>
  );
}

// ── LOS Discounts ─────────────────────────────────────────────────────────────

function LOSDiscountsTab() {
  const [tiers, setTiers] = useState([
    { nights: 7, discountPct: 10, enabled: true },
    { nights: 14, discountPct: 15, enabled: true },
    { nights: 28, discountPct: 20, enabled: false },
  ]);

  const updateTier = (i: number, key: string, value: unknown) =>
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, [key]: value } : t)));

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Length-of-stay discounts encourage longer bookings. Applied as a % off total nightly rate.
      </p>

      <div className="space-y-3">
        {tiers.map((tier, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-4 flex items-center gap-4 flex-wrap"
          >
            <Switch
              checked={tier.enabled}
              onCheckedChange={(v) => updateTier(i, "enabled", v)}
            />
            <div className="flex-1 min-w-[120px]">
              <Label className="text-xs text-text-tertiary">{tier.nights}-night stay</Label>
              <p className="text-[10px] text-text-disabled">Minimum stay duration to qualify</p>
            </div>
            <div className="w-52">
              <Label className="text-xs text-text-tertiary mb-1 block">
                Discount: <span className={cn("font-bold", tier.enabled ? "text-green-400" : "text-text-disabled")}>
                  {tier.enabled ? `-${tier.discountPct}%` : "disabled"}
                </span>
              </Label>
              <Slider
                min={0}
                max={30}
                step={1}
                disabled={!tier.enabled}
                value={[tier.discountPct]}
                onValueChange={([v]) => updateTier(i, "discountPct", v)}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        onClick={() => toast.success("LOS discounts saved.")}
        className="bg-amber text-black hover:bg-amber/90 h-8 text-xs"
      >
        Save LOS Discounts
      </Button>
    </div>
  );
}

// ── Date Overrides ────────────────────────────────────────────────────────────

const SAMPLE_OVERRIDES = [
  { date: "2026-12-31", label: "New Year's Eve", fixedPrice: 1800, minStay: 3 },
  { date: "2026-12-25", label: "Christmas", fixedPrice: 1200, minStay: 2 },
];

function DateOverridesTab() {
  const [overrides, setOverrides] = useState(SAMPLE_OVERRIDES);
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const addOverride = () => {
    if (!newDate) return;
    setOverrides((prev) => [
      ...prev,
      { date: newDate, label: newLabel || newDate, fixedPrice: Number(newPrice) || 0, minStay: 1 },
    ]);
    setNewDate("");
    setNewLabel("");
    setNewPrice("");
    toast.success(`Override added for ${newDate}`);
  };

  const removeOverride = (i: number) =>
    setOverrides((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        Manual overrides take precedence over all other rules. Use for special events (F1, NYE, Eid).
      </p>

      <div className="space-y-2">
        {overrides.map((o, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex items-center gap-4"
          >
            <div className="font-mono text-xs text-text-secondary w-24 shrink-0">{o.date}</div>
            <div className="flex-1 text-sm text-text-primary">{o.label}</div>
            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">
              AED {o.fixedPrice.toLocaleString("en-US")}
            </Badge>
            <Badge className="bg-white/5 text-text-tertiary border-white/10 text-[10px]">
              {o.minStay}N min
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-text-disabled hover:text-red-400"
              onClick={() => removeOverride(i)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add override */}
      <div className="rounded-lg border border-dashed border-white/10 p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-text-tertiary mb-1 block">Date</Label>
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="h-8 text-sm bg-white/5 border-white/10 w-36"
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <Label className="text-xs text-text-tertiary mb-1 block">Label</Label>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Formula 1"
            className="h-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <div className="w-28">
          <Label className="text-xs text-text-tertiary mb-1 block">Fixed Price</Label>
          <Input
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="AED"
            className="h-8 text-sm bg-white/5 border-white/10"
          />
        </div>
        <Button size="sm" onClick={addOverride} className="bg-amber text-black hover:bg-amber/90 h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Override
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const RULE_TABS = [
  { value: "seasons", label: "Seasons", icon: Sun },
  { value: "dow", label: "Day of Week", icon: Calendar },
  { value: "lastminute", label: "Last-Minute", icon: Clock },
  { value: "gapfill", label: "Gap Fill", icon: Layers },
  { value: "los", label: "LOS Discounts", icon: TrendingDown },
  { value: "overrides", label: "Date Overrides", icon: AlignLeft },
];

export function PricingRulesStudio() {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-text-primary">Pricing Rules Studio</h2>
        <p className="text-xs text-text-tertiary mt-0.5">
          Configure the 10-layer pricing formula. Rules are applied in order — guardrails always win.
        </p>
      </div>

      <Tabs defaultValue="seasons" className="p-5">
        <TabsList className="flex flex-wrap gap-1 h-auto bg-white/5 p-1 rounded-lg mb-5">
          {RULE_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-1.5 text-xs data-[state=active]:bg-amber data-[state=active]:text-black"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="seasons"><SeasonProfiles /></TabsContent>
        <TabsContent value="dow"><DayOfWeekTab /></TabsContent>
        <TabsContent value="lastminute"><LastMinuteTab /></TabsContent>
        <TabsContent value="gapfill"><GapFillTab /></TabsContent>
        <TabsContent value="los"><LOSDiscountsTab /></TabsContent>
        <TabsContent value="overrides"><DateOverridesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
