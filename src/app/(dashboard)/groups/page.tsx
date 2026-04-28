"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getOrgId } from "@/lib/auth/client";
import {
  Layers,
  Plus,
  Loader2,
  Home,
  ChevronRight,
  MapPin,
  X,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  _id: string;
  name: string;
  area?: string;
  bedroomsNumber?: number;
}

interface PropertyGroup {
  _id: string;
  name: string;
  description?: string;
  color: string;
  listingIds: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

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

function extractCategory(name: string): string {
  const parts = name.split(" · ");
  if (parts.length > 1) {
    const loc = parts[0].trim();
    return loc === "Unknown" ? "Other" : loc;
  }
  return "Other";
}

const LOCATION_COLORS: Record<string, string> = {
  Dubai: "#f97316",
  JVC: "#6366f1",
  "Down Town": "#ec4899",
  Downtown: "#ec4899",
  "Emaar Beachfront": "#14b8a6",
  JBR: "#3b82f6",
  "Business Bay": "#22c55e",
  Other: "#6b7280",
};

function getCategoryColor(cat: string) {
  return LOCATION_COLORS[cat] ?? "#8b5cf6";
}

// ── Group-create form (modal overlay) ─────────────────────────────────────────

function GroupCreateForm({
  allListings,
  onSave,
  onCancel,
}: {
  allListings: Listing[];
  onSave: (g: PropertyGroup) => void;
  onCancel: () => void;
}) {
  const safeListings = Array.isArray(allListings) ? allListings : [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [locationFilter, setLocationFilter] = useState("all");
  const [bedroomFilter, setBedroomFilter] = useState("all");

  const locations = useMemo(
    () =>
      Array.from(
        new Set(safeListings.map((l) => l.area?.trim()).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b)),
    [safeListings]
  );

  const bedroomBuckets = useMemo(
    () =>
      Array.from(
        new Set(
          safeListings.map((l) =>
            l.bedroomsNumber && l.bedroomsNumber > 0 ? `${l.bedroomsNumber}BR` : "Studio / Other"
          )
        )
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [safeListings]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const matchesFilters = (l: Listing) => {
    const loc = l.area?.trim() || "Unknown";
    const br = l.bedroomsNumber && l.bedroomsNumber > 0 ? `${l.bedroomsNumber}BR` : "Studio / Other";
    return (locationFilter === "all" || loc === locationFilter) && (bedroomFilter === "all" || br === bedroomFilter);
  };

  const visibleListings = safeListings.filter((l) =>
    locationFilter === "all" && bedroomFilter === "all" ? true : matchesFilters(l)
  );

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    const orgId = getOrgId();
    if (!orgId) { toast.error("Session expired, please log in again"); return; }
    setSaving(true);
    try {
      const saved = await api(`/api/groups?orgId=${orgId}`, {
        method: "POST",
        body: JSON.stringify({ name, description, color, listingIds: [...selectedIds] }),
      });
      onSave(saved);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-border-default rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Create new group</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Group rules override overlapping property rules.
            </p>
          </div>
          <button onClick={onCancel} className="text-text-tertiary hover:text-text-primary p-1 rounded-lg hover:bg-surface-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Name + colour */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Marina Portfolio"
            />
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

        <div className="space-y-1.5">
          <Label>
            Description{" "}
            <span className="text-text-tertiary text-xs">(optional)</span>
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Dubai Marina beachfront units"
          />
        </div>

        {/* Property selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              Properties{" "}
              <span className="text-text-tertiary text-xs">({selectedIds.size} selected)</span>
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={bedroomFilter} onValueChange={setBedroomFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {bedroomBuckets.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="border border-border-default rounded-lg divide-y divide-border-default max-h-52 overflow-y-auto">
            {visibleListings.length === 0 && (
              <p className="p-3 text-xs text-text-tertiary">No properties found.</p>
            )}
            {visibleListings.map((l) => (
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
                {l.area && <span className="text-xs text-text-tertiary shrink-0">{l.area}</span>}
                {l.bedroomsNumber != null && (
                  <span className="text-xs text-text-tertiary shrink-0">{l.bedroomsNumber}BR</span>
                )}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Create group
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Group card ─────────────────────────────────────────────────────────────────

function GroupCard({ group, onClick }: { group: PropertyGroup; onClick: () => void }) {
  const typeLabel = (() => {
    const parts = group.name.split(" · ");
    return parts.length > 1 ? parts[1].replace(" Group", "").trim() : "";
  })();

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer rounded-xl border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-primary/40 hover:shadow-lg transition-all overflow-hidden"
    >
      {/* Color accent top strip */}
      <div className="h-1" style={{ background: group.color }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
              style={{ background: group.color }}
            />
            <p className="text-sm font-semibold text-text-primary leading-tight truncate">
              {group.name}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
        </div>

        {group.description && (
          <p className="text-xs text-text-tertiary mb-3 line-clamp-2 leading-relaxed">
            {group.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-xs text-text-tertiary">
              {group.listingIds.length}{" "}
              {group.listingIds.length === 1 ? "property" : "properties"}
            </span>
          </div>
          {typeLabel && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: `${group.color}22`,
                color: group.color,
                border: `1px solid ${group.color}44`,
              }}
            >
              {typeLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = getOrgId();
    if (!orgId) { setLoading(false); return; }
    try {
      const [gs, ls] = await Promise.all([
        api(`/api/groups?orgId=${orgId}`),
        api(`/api/properties?orgId=${orgId}`),
      ]);
      const normalizedGroups = Array.isArray(gs) ? gs : gs?.groups ?? [];
      const rawListings = Array.isArray(ls) ? ls : ls?.properties ?? [];
      const normalizedListings = (rawListings as any[])
        .map((l) => ({ ...l, _id: String(l?._id ?? l?.id ?? "") }))
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

  // Categorise by location extracted from group name
  const categorized = useMemo(() => {
    const map: Record<string, PropertyGroup[]> = {};
    for (const g of groups) {
      const cat = extractCategory(g.name);
      if (!map[cat]) map[cat] = [];
      map[cat].push(g);
    }
    return Object.entries(map).sort(([a], [b]) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
  }, [groups]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
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
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> New group
        </Button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <GroupCreateForm
          allListings={listings}
          onSave={(g) => {
            setGroups((prev) => [g, ...prev]);
            setShowCreate(false);
            router.push(`/groups/${g._id}`);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-8">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-5 w-5 rounded-full bg-surface-2" />
                <div className="h-5 w-28 rounded-lg bg-surface-2" />
                <div className="flex-1 h-px bg-border-subtle" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="rounded-xl border border-border-default bg-surface-1 overflow-hidden">
                    <div className="h-1 bg-surface-2" />
                    <div className="p-4 space-y-3">
                      <div className="h-4 w-3/4 rounded-md bg-surface-2" />
                      <div className="h-3 w-1/2 rounded-md bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div className="border border-dashed border-border-default rounded-2xl p-16 text-center flex flex-col items-center">
          <Layers className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-base font-medium text-text-primary">No groups yet</p>
          <p className="text-sm text-text-tertiary mt-1 mb-4">
            Create a group to apply pricing rules to multiple properties at once.
          </p>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Create first group
          </Button>
        </div>
      )}

      {/* Categorised card grid */}
      {!loading && categorized.map(([category, catGroups]) => (
        <section key={category}>
          {/* Category header */}
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="w-4 h-4 shrink-0" style={{ color: getCategoryColor(category) }} />
            <h2 className="text-base font-bold text-text-primary">{category}</h2>
            <span className="text-xs text-text-tertiary bg-surface-2 border border-border-subtle px-2 py-0.5 rounded-full">
              {catGroups.length} {catGroups.length === 1 ? "group" : "groups"}
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {catGroups.map((g) => (
              <GroupCard
                key={g._id}
                group={g}
                onClick={() => router.push(`/groups/${g._id}`)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
