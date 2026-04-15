"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Home,
  MapPin,
  BedDouble,
  Bath,
  Users,
  DollarSign,
  BarChart3,
  CalendarCheck2,
  Loader2,
  CheckCircle2,
  Plus,
  ChevronRight,
  X,
  ShieldCheck,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChannelRevenue {
  channel: string;
  revenue: number;
  count: number;
}

interface Property {
  id: string;
  name: string;
  city: string;
  area: string;
  bedrooms: number;
  bathrooms: number;
  basePrice: number;
  currency: string;
  priceFloor: number;
  priceCeiling: number;
  capacity: number | null;
  hostawayId: string | null;
  propertyType: string;
  isActive: boolean;
  isActivated: boolean;
  occupancyPct: number;
  avgPrice: number;
  pendingProposals: number;
  totalReservations: number;
  totalRevenue: number;
  revenueByChannel: ChannelRevenue[];
  createdAt: string;
}

type TabId = "selected" | "all";

// ── Main Page ────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("selected");
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((data) => setProperties(data.properties || []))
      .catch(() => toast.error("Failed to load properties"))
      .finally(() => setLoading(false));
  }, []);

  const selectedProperties = useMemo(
    () => properties.filter((p) => p.isActivated),
    [properties]
  );

  const displayList = activeTab === "selected" ? selectedProperties : properties;

  const handleActivate = async (id: string) => {
    setActivating(id);
    try {
      const res = await fetch("/api/properties/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: id }),
      });
      if (!res.ok) throw new Error();
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isActivated: true, isActive: true } : p))
      );
      toast.success("Property activated");
    } catch {
      toast.error("Failed to activate property");
    } finally {
      setActivating(null);
    }
  };

  const selectedCount = selectedProperties.length;
  const totalCount = properties.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-2 text-text-disabled">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading properties…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Properties</h1>
        <p className="text-text-secondary text-sm">
          {selectedCount} of {totalCount} properties activated. Select properties to enable AI
          pricing.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-default">
        {([
          { id: "selected" as TabId, label: "Selected", count: selectedCount },
          { id: "all" as TabId, label: "All Properties", count: totalCount },
        ]).map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === id
                ? "border-amber text-amber"
                : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default"
            )}
          >
            {label}
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                activeTab === id ? "bg-amber/10 text-amber" : "bg-white/5 text-text-disabled"
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Property Grid */}
      {displayList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-white/5 bg-white/[0.02]">
          <Home className="h-8 w-8 text-text-disabled" />
          <p className="text-text-tertiary text-sm">
            {activeTab === "selected"
              ? "No properties selected yet. Go to \"All Properties\" to activate."
              : "No properties found. Run a Hostaway sync first."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayList.map((prop) => (
            <PropertyCard
              key={prop.id}
              property={prop}
              onActivate={handleActivate}
              activating={activating === prop.id}
              onOpenDetail={() => setDetailProperty(prop)}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {detailProperty && (
        <PropertyDetailDrawer
          property={detailProperty}
          onClose={() => setDetailProperty(null)}
        />
      )}
    </div>
  );
}

// ── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({
  property: p,
  onActivate,
  activating,
  onOpenDetail,
}: {
  property: Property;
  onActivate: (id: string) => void;
  activating: boolean;
  onOpenDetail: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-surface-1 border rounded-xl p-5 flex flex-col gap-4 group transition-all cursor-pointer",
        p.isActivated
          ? "border-border-default hover:border-amber/30"
          : "border-dashed border-border-subtle hover:border-amber/50"
      )}
      onClick={onOpenDetail}
    >
      {/* Header */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary leading-snug group-hover:text-amber transition-colors line-clamp-2">
            {p.name}
          </h3>
          <div className="flex items-center gap-1.5 text-text-tertiary">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="text-[10px] truncate">{p.area || p.city || "—"}</span>
          </div>
        </div>
        {p.isActivated ? (
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[9px] border shrink-0">
            Active
          </Badge>
        ) : (
          <Badge className="bg-white/5 text-text-disabled text-[9px] border border-white/10 shrink-0">
            Inactive
          </Badge>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1 text-text-secondary">
          <BedDouble className="h-3 w-3" /> {p.bedrooms} BR
        </span>
        <span className="flex items-center gap-1 text-text-secondary">
          <Bath className="h-3 w-3" /> {p.bathrooms}
        </span>
        {p.capacity && (
          <span className="flex items-center gap-1 text-text-secondary">
            <Users className="h-3 w-3" /> {p.capacity}
          </span>
        )}
        <span className="flex items-center gap-1 text-text-primary font-bold ml-auto">
          <DollarSign className="h-3 w-3" /> {p.currency} {p.basePrice.toLocaleString("en-US")}
        </span>
      </div>

      {/* Metrics (only for activated) */}
      {p.isActivated && (
        <>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-subtle">
            <MiniStat label="Occupancy" value={`${p.occupancyPct}%`} icon={BarChart3} />
            <MiniStat label="Avg Price" value={`${p.avgPrice}`} icon={TrendingUp} />
            <MiniStat
              label="Pending"
              value={String(p.pendingProposals)}
              icon={Clock}
              highlight={p.pendingProposals > 0}
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
            <span className="text-[9px] text-text-disabled uppercase tracking-wider flex items-center gap-1">
              <DollarSign className="h-2.5 w-2.5" /> Revenue
            </span>
            <span className="text-sm font-bold text-amber tabular-nums">
              {p.currency} {p.totalRevenue.toLocaleString("en-US")}
            </span>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        {p.isActivated ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            className="text-[11px] text-text-secondary hover:text-amber flex items-center gap-1 transition-colors"
          >
            View Details <ChevronRight className="h-3 w-3" />
          </button>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onActivate(p.id);
            }}
            disabled={activating}
            className="h-8 px-4 text-xs bg-amber text-black hover:bg-amber/90 gap-1.5"
          >
            {activating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Activate
          </Button>
        )}
        {p.hostawayId && (
          <span className="text-[9px] text-text-disabled font-mono">
            HW#{p.hostawayId}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-text-disabled uppercase tracking-wider flex items-center gap-1">
        <Icon className="h-2.5 w-2.5" /> {label}
      </span>
      <span
        className={cn(
          "text-xs font-bold tabular-nums",
          highlight ? "text-amber" : "text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function PropertyDetailDrawer({
  property: p,
  onClose,
}: {
  property: Property;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-surface-0 border-l border-border-default z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-text-primary">{p.name}</h2>
              <div className="flex items-center gap-2 text-text-tertiary text-xs">
                <MapPin className="h-3.5 w-3.5" />
                {p.area || p.city || "Unknown location"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-md bg-surface-2 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {p.isActivated ? (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 border">
                Active
              </Badge>
            ) : (
              <Badge className="bg-white/5 text-text-disabled border border-white/10">
                Inactive
              </Badge>
            )}
            {p.hostawayId && (
              <Badge variant="outline" className="text-[10px] text-text-tertiary border-border-subtle">
                Hostaway #{p.hostawayId}
              </Badge>
            )}
          </div>

          {/* Property Details */}
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
              Property Details
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
              <DetailRow label="Bedrooms" value={`${p.bedrooms}`} icon={BedDouble} />
              <DetailRow label="Bathrooms" value={`${p.bathrooms}`} icon={Bath} />
              {p.capacity && <DetailRow label="Capacity" value={`${p.capacity} guests`} icon={Users} />}
              <DetailRow label="Base Price" value={`${p.currency} ${p.basePrice.toLocaleString("en-US")}`} icon={DollarSign} />
              <DetailRow label="City" value={p.city || "—"} icon={MapPin} />
              <DetailRow label="Area" value={p.area || "—"} icon={MapPin} />
            </div>
          </div>

          {/* Pricing & Guardrails */}
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
              Pricing Configuration
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
              <DetailRow label="Price Floor" value={p.priceFloor > 0 ? `${p.currency} ${p.priceFloor.toLocaleString("en-US")}` : "Not set"} icon={ShieldCheck} />
              <DetailRow label="Price Ceiling" value={p.priceCeiling > 0 ? `${p.currency} ${p.priceCeiling.toLocaleString("en-US")}` : "Not set"} icon={ShieldCheck} />
              <DetailRow label="Avg Price (30d)" value={`${p.currency} ${p.avgPrice.toLocaleString("en-US")}`} icon={TrendingUp} />
              <DetailRow label="Pending Proposals" value={`${p.pendingProposals}`} icon={Clock} />
            </div>
          </div>

          {/* Performance */}
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
              Performance (30-day)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-surface-2/50 p-3 text-center">
                <p className="text-2xl font-bold text-text-primary tabular-nums">{p.occupancyPct}%</p>
                <p className="text-[10px] text-text-tertiary">Occupancy</p>
              </div>
              <div className="rounded-lg bg-surface-2/50 p-3 text-center">
                <p className="text-2xl font-bold text-text-primary tabular-nums">{p.totalReservations}</p>
                <p className="text-[10px] text-text-tertiary">Total Reservations</p>
              </div>
            </div>
          </div>

          {/* Revenue */}
          <div className="rounded-xl border border-amber/20 bg-amber/[0.03] p-4">
            <h3 className="text-xs font-bold text-amber uppercase tracking-wider mb-3">
              Revenue
            </h3>
            <div className="rounded-lg bg-surface-2/50 p-4 text-center mb-4">
              <p className="text-3xl font-bold text-amber tabular-nums">
                {p.currency} {p.totalRevenue.toLocaleString("en-US")}
              </p>
              <p className="text-[10px] text-text-tertiary mt-1">Total Revenue</p>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Home className="h-3 w-3 text-text-tertiary" />
              <span className="text-[10px] text-text-disabled uppercase tracking-wider font-bold">
                Property Type
              </span>
            </div>
            <div className="rounded-lg bg-surface-2/30 px-3 py-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">{p.propertyType}</span>
                <span className="text-xs font-bold text-text-primary tabular-nums">
                  {p.currency} {p.totalRevenue.toLocaleString("en-US")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-3 w-3 text-text-tertiary" />
              <span className="text-[10px] text-text-disabled uppercase tracking-wider font-bold">
                Revenue By Channel
              </span>
            </div>
            {p.revenueByChannel.length > 0 ? (
              <div className="space-y-1.5">
                {p.revenueByChannel.map((ch) => {
                  const pct = p.totalRevenue > 0 ? Math.round((ch.revenue / p.totalRevenue) * 100) : 0;
                  return (
                    <div key={ch.channel} className="rounded-lg bg-surface-2/30 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-text-secondary">{ch.channel}</span>
                        <span className="text-xs font-bold text-text-primary tabular-nums">
                          {p.currency} {ch.revenue.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className="h-full bg-amber rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-text-disabled tabular-nums w-8 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-text-disabled text-center py-2">No booking data yet</p>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-border-subtle bg-surface-1 p-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider mb-3">
              History
            </h3>
            <div className="space-y-2 text-xs text-text-secondary">
              <div className="flex items-center gap-2">
                <CalendarCheck2 className="h-3.5 w-3.5 text-text-tertiary" />
                <span>
                  Added on{" "}
                  <strong className="text-text-primary">
                    {p.createdAt ? format(parseISO(p.createdAt), "d MMM yyyy") : "Unknown"}
                  </strong>
                </span>
              </div>
              {p.isActivated && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                  <span>
                    Activated — AI pricing engine running
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: any;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
      <div className="flex flex-col">
        <span className="text-[10px] text-text-disabled">{label}</span>
        <span className="text-xs font-medium text-text-primary">{value}</span>
      </div>
    </div>
  );
}
