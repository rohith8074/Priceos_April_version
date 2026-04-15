"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Globe2, Building2, Key,
  Zap, RefreshCw, Home, Check, X, Sparkles, TrendingUp, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────────

type WizardStep = "connect" | "select" | "market" | "strategy" | "complete";
type StrategyMode = "conservative" | "balanced" | "aggressive";

interface Listing {
  id: string;
  name: string;
  bedrooms: number;
  city: string;
  type: string;
  thumbnail: string | null;
}

interface MarketTemplate {
  code: string;
  name: string;
  country: string;
  currency: string;
  flag: string;
  weekend: string;
  maxChangePct: number;
}

// ── Market Templates ───────────────────────────────────────────────────────────

const MARKETS: MarketTemplate[] = [
  { code: "UAE_DXB", name: "Dubai", country: "UAE", currency: "AED", flag: "🇦🇪", weekend: "Thu–Fri", maxChangePct: 15 },
  { code: "GBR_LON", name: "London", country: "UK", currency: "GBP", flag: "🇬🇧", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "USA_NYC", name: "New York", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "FRA_PAR", name: "Paris", country: "France", currency: "EUR", flag: "🇫🇷", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "NLD_AMS", name: "Amsterdam", country: "Netherlands", currency: "EUR", flag: "🇳🇱", weekend: "Fri–Sat", maxChangePct: 10 },
  { code: "ESP_BCN", name: "Barcelona", country: "Spain", currency: "EUR", flag: "🇪🇸", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "USA_MIA", name: "Miami", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 20 },
  { code: "PRT_LIS", name: "Lisbon", country: "Portugal", currency: "EUR", flag: "🇵🇹", weekend: "Fri–Sat", maxChangePct: 12 },
  { code: "USA_NSH", name: "Nashville", country: "USA", currency: "USD", flag: "🇺🇸", weekend: "Fri–Sat", maxChangePct: 20 },
  { code: "AUS_SYD", name: "Sydney", country: "Australia", currency: "AUD", flag: "🇦🇺", weekend: "Fri–Sat", maxChangePct: 15 },
];

// ── Demo Listings (for client demos — no API key needed) ───────────────────────

const DEMO_LISTINGS: Listing[] = [
  { id: "demo-1", name: "Luxury Marina View Suite",         bedrooms: 2, city: "Dubai Marina",      type: "apartment",  thumbnail: null },
  { id: "demo-2", name: "Downtown Burj Khalifa Studio",     bedrooms: 1, city: "Downtown Dubai",    type: "studio",     thumbnail: null },
  { id: "demo-3", name: "JBR Beachfront 3BR Villa",         bedrooms: 3, city: "JBR",               type: "villa",      thumbnail: null },
  { id: "demo-4", name: "Palm Jumeirah Signature Villa",    bedrooms: 5, city: "Palm Jumeirah",     type: "villa",      thumbnail: null },
  { id: "demo-5", name: "Business Bay Executive Studio",    bedrooms: 1, city: "Business Bay",      type: "studio",     thumbnail: null },
  { id: "demo-6", name: "Dubai Hills Garden Apartment",     bedrooms: 2, city: "Dubai Hills",       type: "apartment",  thumbnail: null },
  { id: "demo-7", name: "DIFC Premium 1BR Apartment",       bedrooms: 1, city: "DIFC",              type: "apartment",  thumbnail: null },
  { id: "demo-8", name: "Meydan Racecourse View Penthouse", bedrooms: 4, city: "Meydan",            type: "penthouse",  thumbnail: null },
];

const STEPS: { id: WizardStep; label: string; icon: React.ElementType }[] = [
  { id: "connect",  label: "Connect",  icon: Key },
  { id: "select",   label: "Select",   icon: Home },
  { id: "market",   label: "Market",   icon: Globe2 },
  { id: "strategy", label: "Strategy", icon: Sparkles },
  { id: "complete", label: "Complete", icon: CheckCircle2 },
];

// ── Helper ─────────────────────────────────────────────────────────────────────
async function saveProgress(data: Partial<{
  step: WizardStep;
  selectedListingIds: string[];
  activatedListingIds: string[];
  marketCode: string;
  listings: Listing[];
  strategy: StrategyMode;
}>) {
  await fetch("/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Step Components ────────────────────────────────────────────────────────────

function StepConnect({ onNext }: { onNext: (listings: Listing[]) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [fallbackListings, setFallbackListings] = useState<Listing[] | null>(null);

  const handleValidate = async () => {
    if (!apiKey.trim()) { toast.error("Please enter your Hostaway API Key"); return; }
    setLoading(true);
    setFallbackReason(null);
    setFallbackListings(null);
    try {
      const res = await fetch(`/api/hostaway/metadata?apiKey=${encodeURIComponent(apiKey.trim())}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || data.message || "Connection failed");

      if (data?.success && data?.mode === "real") {
        toast.success(`✅ Connected! Found ${data.total} properties.`);
        onNext(data.listings);
        return;
      }

      if (data?.mode === "fallback_available" && Array.isArray(data?.listings)) {
        setFallbackReason(data.reason || "Real Hostaway connection failed.");
        setFallbackListings(data.listings);
        toast.warning("Real connection failed. Demo fallback is available.");
        return;
      }

      throw new Error(data?.reason || data?.message || "Connection failed");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Could not connect to Hostaway");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    // Simulate a brief "loading" for realism
    await new Promise(r => setTimeout(r, 900));
    toast.success("🎮 Demo mode — 8 sample properties loaded");
    onNext(DEMO_LISTINGS);
    setDemoLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Demo Mode Banner */}
      <div
        className="flex items-center justify-between p-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-all group"
        onClick={handleDemo}
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Try Demo Mode</p>
            <p className="text-xs text-zinc-500">8 sample Dubai properties — no API key needed</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDemo(); }}
          disabled={demoLoading}
          className="h-8 px-4 text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg flex items-center gap-1.5 transition-all shrink-0"
        >
          {demoLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {demoLoading ? "Loading…" : "Launch Demo"}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-xs text-zinc-600 font-medium">or connect your account</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex items-center gap-4 p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
        <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
          <Key className="h-5 w-5 text-zinc-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white mb-0.5">Connect Hostaway</h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            PriceOS fetches <strong className="text-zinc-300">only your property names</strong> — no pricing, no reservations yet.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hostaway API Key</label>
        <div className="relative">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleValidate()}
            placeholder="ha_live_xxxxxxxxxxxx"
            className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-xl px-4 pr-12 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-mono"
          />
          {apiKey && (
            <button onClick={() => setApiKey("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-600">
          Hostaway → Settings → API Keys → Create new key
        </p>
      </div>

      <button
        onClick={handleValidate}
        disabled={loading || !apiKey.trim()}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
        {loading ? "Connecting…" : "Validate & Fetch Properties"}
      </button>

      {fallbackListings && fallbackReason && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
          <p className="text-xs text-amber-300 font-semibold">Real connection failed</p>
          <p className="text-xs text-zinc-300 leading-relaxed">{fallbackReason}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleValidate}
              disabled={loading}
              className="h-9 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-semibold"
            >
              Retry Real Connection
            </button>
            <button
              onClick={() => {
                toast.success("Continuing with demo listings.");
                onNext(fallbackListings);
              }}
              className="h-9 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
            >
              Continue with Demo Listings
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { icon: "🔒", text: "Key stored encrypted" },
          { icon: "⚡", text: "~1 API call only" },
          { icon: "✅", text: "Read-only access" },
        ].map((item) => (
          <div key={item.text} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="text-xl mb-1">{item.icon}</div>
            <p className="text-[11px] text-zinc-500">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepSelect({ listings, onNext }: { listings: Listing[]; onNext: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === listings.length ? new Set() : new Set(listings.map(l => l.id)));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Select which properties PriceOS should manage:</p>
        <button onClick={toggleAll} className="text-xs text-amber-400 hover:text-amber-300 font-semibold">
          {selected.size === listings.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {listings.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Home className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No properties found. Check your API key.</p>
          </div>
        ) : listings.map((listing) => {
          const isSelected = selected.has(listing.id);
          return (
            <button
              key={listing.id}
              onClick={() => toggle(listing.id)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                isSelected
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              )}
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                isSelected ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"
              )}>
                {isSelected ? <Check className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold truncate", isSelected ? "text-white" : "text-zinc-300")}>
                  {listing.name}
                </p>
                <p className="text-xs text-zinc-600">
                  {listing.bedrooms > 0 ? `${listing.bedrooms} BR` : listing.type} · {listing.city || "Unknown location"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <span className="text-sm text-zinc-500">
          <span className="text-amber-400 font-bold">{selected.size}</span> of {listings.length} selected
        </span>
        <button
          onClick={() => onNext(Array.from(selected))}
          disabled={selected.size === 0}
          className="h-10 px-6 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl flex items-center gap-2 text-sm transition-all"
        >
          Next <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StepMarket({ initialMarket, onNext }: { initialMarket: string; onNext: (code: string) => void }) {
  const [selected, setSelected] = useState(initialMarket || "UAE_DXB");

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm text-zinc-300 font-medium">Select your primary operating market</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          This pre-loads a <strong className="text-zinc-300">city-specific pricing rulebook</strong> — public holidays, 
          peak seasons, local events, weekend pattern, and daily price-change guardrails.
          You can customise any rule after setup.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {MARKETS.map((m) => (
          <button
            key={m.code}
            onClick={() => setSelected(m.code)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
              selected === m.code
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
            )}
          >
            <span className="text-2xl">{m.flag}</span>
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", selected === m.code ? "text-white" : "text-zinc-300")}>
                {m.name}
              </p>
              <p className="text-[11px] text-zinc-600">{m.currency} · {m.weekend}</p>
            </div>
          </button>
        ))}
      </div>

      {selected && (() => {
        const m = MARKETS.find(x => x.code === selected)!;
        return (
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Currency", value: m.currency },
                { label: "Weekend", value: m.weekend },
                { label: "Max Price Swing", value: `${m.maxChangePct}%/day` },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{item.label}</p>
                  <p className="text-sm font-bold text-amber-400">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              <strong className="text-zinc-500">Max price swing</strong> = the largest single-day price change Aria is 
              allowed to make automatically. Larger moves go to your Proposals inbox for approval.
            </p>
          </div>
        );
      })()}

      <button
        onClick={() => onNext(selected)}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        Apply Market Template <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Strategy mode definitions ──────────────────────────────────────────────────

const STRATEGY_OPTIONS: {
  mode: StrategyMode;
  label: string;
  tagline: string;
  autoApprove: number;
  maxChangePct: (marketMax: number) => number;
  floorMultiplier: number;
  color: string;
  border: string;
  bg: string;
  badge: string;
}[] = [
  {
    mode: "conservative",
    label: "Conservative",
    tagline: "Safer moves, human reviews most changes",
    autoApprove: 3,
    maxChangePct: (m) => Math.round(m * 0.7),
    floorMultiplier: 0.6,
    color: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    badge: "Recommended for new users",
  },
  {
    mode: "balanced",
    label: "Balanced",
    tagline: "Market defaults, steady automation",
    autoApprove: 5,
    maxChangePct: (m) => m,
    floorMultiplier: 0.5,
    color: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    badge: "Most popular",
  },
  {
    mode: "aggressive",
    label: "Aggressive",
    tagline: "Max automation, larger swings allowed",
    autoApprove: 10,
    maxChangePct: (m) => Math.round(m * 1.5),
    floorMultiplier: 0.4,
    color: "text-rose-400",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    badge: "For experienced managers",
  },
];

function StepStrategy({
  selectedCount,
  marketCode,
  strategy,
  onStrategyChange,
  onActivate,
}: {
  selectedCount: number;
  marketCode: string;
  strategy: StrategyMode;
  onStrategyChange: (s: StrategyMode) => void;
  onActivate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const market = MARKETS.find(m => m.code === marketCode) ?? MARKETS[0];
  const selected = STRATEGY_OPTIONS.find(s => s.mode === strategy) ?? STRATEGY_OPTIONS[0];

  const handleActivate = async () => {
    setLoading(true);
    try {
      await onActivate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Choose your pricing strategy</p>
          <p className="text-xs text-zinc-500">
            {selectedCount} {selectedCount === 1 ? "property" : "properties"} · {market.name} market
          </p>
        </div>
      </div>

      {/* Strategy cards */}
      <div className="space-y-2">
        {STRATEGY_OPTIONS.map((opt) => {
          const isSelected = strategy === opt.mode;
          const effectiveMax = opt.maxChangePct(market.maxChangePct);
          return (
            <button
              key={opt.mode}
              onClick={() => onStrategyChange(opt.mode)}
              className={cn(
                "w-full p-4 rounded-xl border text-left transition-all",
                isSelected ? `${opt.border} ${opt.bg}` : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={cn("text-sm font-bold", isSelected ? opt.color : "text-zinc-300")}>
                      {opt.label}
                    </p>
                    {isSelected && (
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", opt.bg, opt.color, opt.border, "border")}>
                        SELECTED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mb-2">{opt.tagline}</p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-zinc-600">
                      Auto-approve <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>&lt;{opt.autoApprove}%</span>
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      Max swing <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>{effectiveMax}%/day</span>
                    </span>
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">
                      Floor <span className={cn("font-bold", isSelected ? opt.color : "text-zinc-400")}>{Math.round(opt.floorMultiplier * 100)}%</span>
                    </span>
                  </div>
                </div>
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all",
                  isSelected ? `${opt.border} ${opt.bg}` : "border-zinc-700"
                )}>
                  {isSelected && <div className={cn("h-2 w-2 rounded-full", opt.color.replace("text-", "bg-"))} />}
                </div>
              </div>
              {opt.badge && isSelected && (
                <p className={cn("text-[10px] mt-2 font-medium", opt.color)}>{opt.badge}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: TrendingUp, label: "Seasonal Engine", desc: "12-month demand patterns loaded", color: "text-green-400", bg: "bg-green-500/5 border-green-500/15" },
          { icon: Shield, label: "Guardrails", desc: `Max ${selected.maxChangePct(market.maxChangePct)}%/day change`, color: selected.color, bg: `${selected.bg} ${selected.border}` },
          { icon: Zap, label: "Auto-Approve", desc: `Changes <${selected.autoApprove}% push live`, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/15" },
        ].map(item => (
          <div key={item.label} className={cn("p-3 rounded-xl border text-center", item.bg)}>
            <item.icon className={cn("h-4 w-4 mx-auto mb-1.5", item.color)} />
            <p className={cn("text-[10px] font-bold mb-0.5", item.color)}>{item.label}</p>
            <p className="text-[10px] text-zinc-600 leading-tight">{item.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={handleActivate}
        disabled={loading}
        className="w-full h-12 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {loading ? "Activating Pricing Engine…" : `Go Live — ${selected.label} Strategy`}
      </button>

      <p className="text-center text-xs text-zinc-600">
        You can switch strategy mode at any time in Settings.
      </p>
    </div>
  );
}

function StepComplete({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <div className="text-center space-y-8 py-4">
      <div className="relative mx-auto w-24 h-24">
        <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
        <div className="relative h-24 w-24 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-amber-400" />
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-white mb-2">You&apos;re live on PriceOS 🚀</h3>
        <p className="text-zinc-400 text-sm max-w-xs mx-auto">
          Your properties are connected, your market is configured, and Aria is already analyzing pricing opportunities.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-left max-w-xs mx-auto">
        {[
          { icon: "✅", text: "Hostaway connected" },
          { icon: "✅", text: "Market template loaded" },
          { icon: "✅", text: "Guardrails active" },
          { icon: "✅", text: "First proposals generating…" },
        ].map(item => (
          <div key={item.text} className="flex items-center gap-2 text-xs text-zinc-400">
            <span>{item.icon}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onGoToDashboard}
        className="w-full max-w-xs mx-auto h-12 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-sm"
      >
        Go to Dashboard <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

export function OnboardingWizard({ initialStep = "connect" }: { initialStep?: WizardStep }) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marketCode, setMarketCode] = useState("UAE_DXB");
  const [strategy, setStrategy] = useState<StrategyMode>("conservative");
  const currentIndex = STEPS.findIndex(s => s.id === step);

  const goToStep = useCallback((next: WizardStep) => setStep(next), []);

  // Step 1 → 2
  const handleConnect = useCallback((fetchedListings: Listing[]) => {
    setListings(fetchedListings);
    goToStep("select");
  }, [goToStep]);

  // Step 2 → 3
  const handleSelect = useCallback(async (ids: string[]) => {
    setSelectedIds(ids);
    await saveProgress({ step: "market", selectedListingIds: ids });
    goToStep("market");
  }, [goToStep]);

  // Step 3 → 4
  const handleMarket = useCallback(async (code: string) => {
    setMarketCode(code);
    await saveProgress({ step: "strategy", marketCode: code });
    goToStep("strategy");
  }, [goToStep]);

  // Step 4 → 5: Activation — sends listing snapshot + strategy, refreshes JWT, then navigates
  const handleActivate = useCallback(async () => {
    const activatedListings = listings.filter(l => selectedIds.includes(l.id));

    // Trigger calendar sync (non-blocking)
    try {
      fetch("/api/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: selectedIds, scope: "calendar_90d" }),
      });
    } catch { /* non-fatal */ }

    // Save completion + seed listings + strategy mode + get fresh JWT
    await saveProgress({
      step: "complete",
      activatedListingIds: selectedIds,
      listings: activatedListings,
      strategy,
    });

    goToStep("complete");
  }, [listings, selectedIds, strategy, goToStep]);

  const handleBack = () => {
    const prevIndex = Math.max(0, currentIndex - 1);
    setStep(STEPS[prevIndex].id);
  };

  const handleGoToDashboard = useCallback(() => {
    // router.push respects the updated cookie from the PATCH response
    router.push("/dashboard");
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Zap className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-bold text-white">PriceOS</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {step === "complete" ? "Welcome aboard" : "Let's get you set up"}
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            {step === "complete" ? "Your revenue engine is ready." : "Takes less than 3 minutes"}
          </p>
        </div>

        {/* Step Progress Bar */}
        {step !== "complete" && (
          <div className="flex items-center gap-1 mb-8">
            {STEPS.filter(s => s.id !== "complete").map((s, i) => {
              const isDone = i < currentIndex;
              const isActive = i === currentIndex;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={cn(
                    "h-1 flex-1 rounded-full transition-all duration-500",
                    isDone ? "bg-amber-500" : isActive ? "bg-amber-500/40" : "bg-zinc-800"
                  )} />
                </div>
              );
            })}
          </div>
        )}

        {/* Step Label */}
        {step !== "complete" && (
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              Step {currentIndex + 1} of {STEPS.length - 1}
            </span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500 capitalize">{step}</span>
          </div>
        )}

        {/* Card */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-7 shadow-2xl">
          {step === "connect"  && <StepConnect onNext={handleConnect} />}
          {step === "select"   && <StepSelect listings={listings} onNext={handleSelect} />}
          {step === "market"   && <StepMarket initialMarket={marketCode} onNext={handleMarket} />}
          {step === "strategy" && (
            <StepStrategy
              selectedCount={selectedIds.length}
              marketCode={marketCode}
              strategy={strategy}
              onStrategyChange={setStrategy}
              onActivate={handleActivate}
            />
          )}
          {step === "complete" && (
            <StepComplete onGoToDashboard={handleGoToDashboard} />
          )}
        </div>

        {/* Back button */}
        {step !== "connect" && step !== "complete" && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 mt-4 mx-auto transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back
          </button>
        )}
      </div>
    </div>
  );
}
