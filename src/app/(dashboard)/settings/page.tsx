"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Bot,
  Link2,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Check,
  Webhook,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Market {
  code: string;
  name: string;
  country: string;
  currency: string;
  timezone: string;
  weekend: string;
  flag: string;
}

interface OrgSettings {
  id: string;
  name: string;
  fullName: string;
  email: string;
  role: string;
  plan: string;
  marketCode: string;
  currency: string;
  timezone: string;
  hostawayApiKey: string;
  hostawayAccountId: string;
  systemState: string;
  settings: {
    guardrails: {
      maxSingleDayChangePct: number;
      autoApproveThreshold: number;
      absoluteFloorMultiplier: number;
      absoluteCeilingMultiplier: number;
    };
    automation: {
      autoPushApproved: boolean;
      dailyPipelineRun: boolean;
    };
    overrides: {
      currency: string | null;
      timezone: string | null;
      weekendDefinition: string | null;
    };
  };
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

const PLAN_LIMITS: Record<string, string> = {
  starter: "Up to 10 active property units.",
  growth: "Up to 50 active property units and 5 team seats.",
  scale: "Unlimited properties and team seats.",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable form state
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [selectedMarket, setSelectedMarket] = useState("");
  const [useCurrencyOverride, setUseCurrencyOverride] = useState(false);
  const [currencyOverride, setCurrencyOverride] = useState("");

  // ── Webhook state ────────────────────────────────────────────────────────────
  type WebhookStatus = {
    hasCredentials: boolean;
    connected: boolean;
    webhookRegistered: boolean;
    webhookUrl: string;
    webhookId?: string | null;
  };
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookAction, setWebhookAction] = useState<"register" | "remove" | "test" | "mark" | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [manualRequired, setManualRequired] = useState(false);

  const fetchWebhookStatus = useCallback(async () => {
    setWebhookLoading(true);
    try {
      const res = await fetch("/api/hostaway/webhook-status");
      if (res.ok) setWebhookStatus(await res.json());
    } catch { /* silent */ }
    finally { setWebhookLoading(false); }
  }, []);

  const handleTestConnection = useCallback(async () => {
    setWebhookAction("test");
    try {
      const res = await fetch("/api/hostaway/webhook-status");
      const data = res.ok ? await res.json() : null;
      if (data?.connected) {
        toast.success("Hostaway connection verified");
      } else if (data?.connectionError) {
        toast.error(data.connectionError);
      } else if (data?.hasCredentials) {
        toast.error("Credentials saved but connection failed — check your API key");
      } else {
        toast.error("No credentials saved — add Account ID and API Key first");
      }
      if (data) setWebhookStatus(data);
    } catch {
      toast.error("Connection test failed");
    } finally {
      setWebhookAction(null);
    }
  }, []);

  const handleRegisterWebhook = useCallback(async () => {
    setWebhookAction("register");
    try {
      const res = await fetch("/api/hostaway/webhook-manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      if (data.error === "manual_required") {
        setManualRequired(true);
        toast.info("Manual setup required", {
          description: "Hostaway has disabled programmatic webhook creation for this account. Follow the steps below.",
          duration: 6000,
        });
        return;
      }
      toast.success("Webhook registered with Hostaway");
      setManualRequired(false);
      await fetchWebhookStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register webhook");
    } finally {
      setWebhookAction(null);
    }
  }, [fetchWebhookStatus]);

  const handleMarkManual = useCallback(async () => {
    setWebhookAction("mark");
    try {
      const res = await fetch("/api/hostaway/webhook-manage/mark-manual", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark webhook");
      toast.success("Webhook marked as registered");
      setManualRequired(false);
      await fetchWebhookStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark webhook");
    } finally {
      setWebhookAction(null);
    }
  }, [fetchWebhookStatus]);

  const handleRemoveWebhook = useCallback(async () => {
    setWebhookAction("remove");
    try {
      const res = await fetch("/api/hostaway/webhook-manage", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Removal failed");
      toast.success(data.removed ? "Webhook removed from Hostaway" : "No active webhook to remove");
      await fetchWebhookStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove webhook");
    } finally {
      setWebhookAction(null);
    }
  }, [fetchWebhookStatus]);

  const handleCopyUrl = useCallback(() => {
    if (!webhookStatus?.webhookUrl) return;
    navigator.clipboard.writeText(webhookStatus.webhookUrl).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    });
  }, [webhookStatus]);

  // ── Guest Communications state ───────────────────────────────────────────────
  // Defaults: Live + Approval (applied for new orgs before DB value loads)
  const [commsLiveMode, setCommsLiveMode] = useState(true);
  const [commsAutoReply, setCommsAutoReply] = useState(false);
  const [commsSavedLive, setCommsSavedLive] = useState(true);
  const [commsSavedAuto, setCommsSavedAuto] = useState(false);
  const [isSavingComms, setIsSavingComms] = useState(false);
  const hasUnsavedComms = commsLiveMode !== commsSavedLive || commsAutoReply !== commsSavedAuto;

  const saveCommsSettings = async () => {
    const orgId = org?.id;
    if (!orgId) { toast.error("Could not resolve org — please reload"); return; }
    setIsSavingComms(true);
    try {
      const res = await fetch("/api/comms-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, liveMode: commsLiveMode, autoReply: commsAutoReply }),
      });
      if (!res.ok) throw new Error("Save failed");
      setCommsSavedLive(commsLiveMode);
      setCommsSavedAuto(commsAutoReply);
      toast.success("Communications settings saved");
    } catch {
      toast.error("Could not save communications settings");
    } finally {
      setIsSavingComms(false);
    }
  };

  // Fetch webhook status once credentials are loaded
  useEffect(() => { fetchWebhookStatus(); }, [fetchWebhookStatus]);

  // Fetch org settings + markets + comms in parallel
  useEffect(() => {
    Promise.all([
      fetch("/api/user/settings").then((r) => r.json()),
      fetch("/api/markets").then((r) => r.json()),
    ])
      .then(([orgData, marketsData]) => {
        setOrg(orgData);
        setMarkets(marketsData.markets ?? []);

        // Populate form state from DB
        setApiKey(orgData.hostawayApiKey || "");
        setAccountId(orgData.hostawayAccountId || "");
        setOrgName(orgData.name || "");
        setTimezone(orgData.timezone || "Asia/Dubai");
        setSelectedMarket(orgData.marketCode || "UAE_DXB");
        const hasCurrOverride = !!orgData.settings?.overrides?.currency;
        setUseCurrencyOverride(hasCurrOverride);
        setCurrencyOverride(orgData.settings?.overrides?.currency || "");

        // Load comms settings
        const orgId = orgData._id ?? orgData.id;
        if (orgId) {
          fetch(`/api/comms-settings?orgId=${orgId}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => {
              if (!d) return;
              setCommsLiveMode(d.liveMode);
              setCommsAutoReply(d.autoReply);
              setCommsSavedLive(d.liveMode);
              setCommsSavedAuto(d.autoReply);
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load settings");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeMarket = markets.find((m) => m.code === selectedMarket);

  const handleSave = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      setSaved(false);
      try {
        const res = await fetch("/api/user/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Save failed");
        }
        const savedData = await res.json();
        setOrg((prev) =>
          prev
            ? {
                ...prev,
                marketCode: (savedData.marketCode ?? prev.marketCode) as string,
                currency: (savedData.currency ?? prev.currency) as string,
                timezone: (savedData.timezone ?? prev.timezone) as string,
                settings: savedData.settings ?? prev.settings,
                name: (savedData.name ?? prev.name) as string,
              }
            : prev
        );
        setSaved(true);
        toast.success("Settings saved");
        setTimeout(() => setSaved(false), 2000);
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-2 text-text-disabled">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-10 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary text-body">
          Manage your organization, connections, and market configuration.
        </p>
      </div>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="bg-surface-1 border border-border-subtle p-1 h-12">
          <TabsTrigger
            value="connections"
            className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6"
          >
            <Link2 className="h-3.5 w-3.5 mr-2" />
            Connections
          </TabsTrigger>
          <TabsTrigger
            value="organization"
            className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6"
          >
            <Building2 className="h-3.5 w-3.5 mr-2" />
            Organization
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: Connections ──────────────────────────────────────────── */}
        <TabsContent
          value="connections"
          className="mt-8 space-y-8 animate-in fade-in-50 duration-500"
        >
          <div className="grid gap-6">
            {/* PMS Integration */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">PMS Integration</h3>
                <p className="text-body-xs text-text-tertiary">
                  Sync your property data and push pricing changes to Hostaway.
                </p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="hostaway-account-id" className="text-body-xs text-text-secondary">
                    Account ID
                  </Label>
                  <Input
                    id="hostaway-account-id"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="bg-surface-2 border-border-default h-10 text-body-xs"
                    placeholder="e.g. 12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hostaway-api" className="text-body-xs text-text-secondary">
                    Hostaway API Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="hostaway-api"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-surface-2 border-border-default h-10 pr-10 font-mono text-body-xs"
                      placeholder="ha_live_..."
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-3">
                  <p className="text-[10px] font-semibold text-text-primary mb-1">
                    Sync behavior
                  </p>
                  <p className="text-[11px] text-text-tertiary leading-relaxed">
                    These credentials are saved per organization in MongoDB and used when you click
                    {" "}
                    <span className="font-medium text-text-primary">Sync Hostaway</span>.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSave({ hostawayApiKey: apiKey.trim(), hostawayAccountId: accountId.trim() })}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Credentials
                  </button>
                </div>
              </div>
            </div>

            {/* ── Webhook Integration ──────────────────────────────────── */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-title font-semibold text-text-primary flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-amber" />
                    Webhook Integration
                  </h3>
                  <p className="text-body-xs text-text-tertiary">
                    Register this URL in Hostaway so guest messages appear in your Inbox automatically.
                  </p>
                </div>
                {/* Status pill */}
                {webhookLoading ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-text-tertiary shrink-0">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                  </span>
                ) : webhookStatus?.webhookRegistered ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> Live
                  </span>
                ) : webhookStatus?.connected ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber bg-amber/10 border border-amber/20 px-2.5 py-1 rounded-full shrink-0">
                    <AlertCircle className="h-3 w-3" /> Not registered
                  </span>
                ) : webhookStatus?.hasCredentials ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full shrink-0">
                    <XCircle className="h-3 w-3" /> Credentials invalid
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-text-disabled bg-surface-2 border border-border-subtle px-2.5 py-1 rounded-full shrink-0">
                    <AlertCircle className="h-3 w-3" /> No credentials
                  </span>
                )}
              </div>

              {/* Webhook URL row */}
              <div className="flex flex-col gap-2 max-w-xl">
                <Label className="text-body-xs text-text-secondary">Webhook URL</Label>

                {/* Auto-derived URL (read-only, shown for reference) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-2 border border-border-default rounded-md px-3 h-10 flex items-center overflow-hidden">
                    <span className="text-[11px] font-mono text-text-tertiary truncate select-all">
                      {webhookStatus?.webhookUrl ?? "Loading…"}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    disabled={!webhookStatus?.webhookUrl}
                    title="Copy webhook URL"
                    className="h-10 w-10 flex items-center justify-center rounded-md bg-surface-2 border border-border-default hover:border-amber/40 hover:text-amber transition-colors disabled:opacity-40 shrink-0"
                  >
                    {urlCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <p className="text-[10px] text-text-tertiary leading-relaxed">
                  PriceOS registers this URL with Hostaway automatically. When developing locally, the production URL (<span className="font-mono">priceos-april-version.vercel.app</span>) is used so Hostaway can reach it.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={webhookAction !== null || !webhookStatus?.hasCredentials}
                  className="h-10 px-5 rounded-md border border-border-default bg-surface-2 hover:border-amber/40 hover:text-amber text-body-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-40"
                >
                  {webhookAction === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                  Test Connection
                </button>

                {!webhookStatus?.webhookRegistered ? (
                  <button
                    onClick={handleRegisterWebhook}
                    disabled={webhookAction !== null || !webhookStatus?.connected}
                    className="h-10 px-5 rounded-md bg-amber hover:bg-amber/90 text-black font-bold text-body-xs transition-colors flex items-center gap-2 disabled:opacity-40"
                  >
                    {webhookAction === "register" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Register Webhook
                  </button>
                ) : (
                  <button
                    onClick={handleRemoveWebhook}
                    disabled={webhookAction !== null}
                    className="h-10 px-5 rounded-md bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold text-body-xs transition-colors flex items-center gap-2 disabled:opacity-40"
                  >
                    {webhookAction === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Remove Webhook
                  </button>
                )}
              </div>

              {/* Manual Instructions — always visible, highlighted when manual_required */}
              <div className={cn(
                "rounded-lg border p-4 space-y-4 transition-colors",
                manualRequired
                  ? "border-amber/40 bg-amber/5"
                  : "border-border-subtle bg-surface-2/30"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <p className={cn("text-[11px] font-semibold", manualRequired ? "text-amber" : "text-text-primary")}>
                      {manualRequired ? "⚠ Manual Setup Required" : "Manual Setup"}
                    </p>
                    <p className="text-[10px] text-text-tertiary leading-relaxed">
                      {manualRequired
                        ? "Hostaway has disabled programmatic webhook creation for this account. Add the URL below in your Hostaway dashboard, then click \"Done — Mark as Registered\"."
                        : "If the Register button fails (Hostaway 404), set up the webhook manually in your Hostaway dashboard:"}
                    </p>
                  </div>
                </div>

                <ol className="text-[10px] text-text-tertiary leading-relaxed space-y-2 list-decimal list-inside px-1">
                  <li>Log in to your <a href="https://dashboard.hostaway.com" target="_blank" rel="noopener noreferrer" className="text-amber hover:underline">Hostaway Dashboard</a>.</li>
                  <li>Go to <span className="font-medium text-text-primary">Settings</span> → <span className="font-medium text-text-primary">Integrations</span> → <span className="font-medium text-text-primary">Webhooks</span>.</li>
                  <li>Click <span className="font-medium text-text-primary">+ Add Webhook</span>.</li>
                  <li>Paste the <span className="font-medium text-text-primary">Webhook URL</span> shown above.</li>
                  <li>Select <span className="font-medium text-text-primary">newMessage</span> as the action/event.</li>
                  <li>Save the webhook in Hostaway.</li>
                </ol>

                {manualRequired && (
                  <div className="pt-2 border-t border-amber/20">
                    <button
                      onClick={handleMarkManual}
                      disabled={webhookAction !== null}
                      className="h-9 px-5 rounded-md bg-amber hover:bg-amber/90 text-black font-bold text-body-xs transition-colors flex items-center gap-2 disabled:opacity-40"
                    >
                      {webhookAction === "mark" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Done — Mark as Registered
                    </button>
                  </div>
                )}
              </div>
              
              {/* Info box */}
              <div className="rounded-lg border border-border-subtle bg-surface-2/30 p-3">
                <p className="text-[10px] font-semibold text-text-primary mb-1">How it works</p>
                <ul className="text-[10px] text-text-tertiary leading-relaxed space-y-1 list-disc list-inside">
                  <li>Save your Account ID and API Key above first.</li>
                  <li>Click <span className="font-medium text-text-primary">Register Webhook</span> — PriceOS calls Hostaway's API on your behalf.</li>
                  <li>Hostaway will POST new guest messages to this URL automatically.</li>
                  <li>Tokens are refreshed silently in the background — you never need to re-authenticate.</li>
                  <li>Your API key is never shown in the browser or logs — stored only in your database.</li>
                </ul>
              </div>
            </div>

            {/* ── Guest Communications ─────────────────────────────────── */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary flex items-center gap-2">
                  <Bot className="h-4 w-4 text-amber" />
                  Guest Communications
                </h3>
                <p className="text-body-xs text-text-tertiary">
                  Control how the AI assistant handles incoming guest messages.
                </p>
              </div>

              {/* AI Mode toggle */}
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border-subtle bg-surface-2/40">
                  <div>
                    <p className="text-body-xs font-semibold text-text-primary">AI Mode</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {commsLiveMode
                        ? "AI is active — it reads each new guest message and prepares a reply."
                        : "AI is off — new messages are stored for you to reply to manually."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] font-bold", !commsLiveMode ? "text-text-primary" : "text-text-muted")}>Manual</span>
                    <Switch
                      checked={commsLiveMode}
                      onCheckedChange={setCommsLiveMode}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                    <span className={cn("text-[10px] font-bold", commsLiveMode ? "text-emerald-400" : "text-text-muted")}>Live</span>
                  </div>
                </div>

                {/* Reply Mode — only relevant when AI is Live */}
                <div className={cn(
                  "flex items-start justify-between gap-4 p-4 rounded-xl border border-border-subtle bg-surface-2/40 transition-opacity",
                  !commsLiveMode && "opacity-40 pointer-events-none"
                )}>
                  <div>
                    <p className="text-body-xs font-semibold text-text-primary">Reply Mode</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">
                      {commsAutoReply
                        ? "Auto — AI reply is sent directly to the guest. No approval needed."
                        : "Approval — AI reply appears in your Inbox for review before sending."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-surface-2 border border-border-default rounded-full p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCommsAutoReply(true)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all",
                        commsAutoReply ? "bg-amber text-black shadow-sm" : "text-text-muted hover:text-text-secondary"
                      )}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommsAutoReply(false)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all",
                        !commsAutoReply ? "bg-surface-3 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
                      )}
                    >
                      Approval
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={saveCommsSettings}
                disabled={!hasUnsavedComms || isSavingComms}
                className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-40"
              >
                {isSavingComms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {isSavingComms ? "Saving…" : hasUnsavedComms ? "Save Changes" : "Saved"}
              </button>
            </div>

            {/* Market Configuration */}
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">
                  Market Configuration
                </h3>
                <p className="text-body-xs text-text-tertiary">
                  Select your primary operating market for AI intelligence templates.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Primary Market</Label>
                    <Select value={selectedMarket} onValueChange={setSelectedMarket}>
                      <SelectTrigger className="bg-surface-2 border-border-default h-10">
                        <SelectValue placeholder="Select a market" />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-2 border-border-default text-text-primary">
                        {markets.map((m) => (
                          <SelectItem key={m.code} value={m.code}>
                            <span className="flex items-center gap-2">
                              <span>{m.flag}</span>
                              <span>
                                {m.name}, {m.country}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedMarket === org?.marketCode && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-dim text-amber border-amber/20 h-5"
                      >
                        Current market
                      </Badge>
                    )}
                    <div className="mt-2 rounded-md border border-border-subtle bg-surface-2/30 p-2.5">
                      <p className="text-[10px] font-semibold text-text-primary mb-1">
                        What market code means
                      </p>
                      <p className="text-[10px] text-text-tertiary leading-relaxed">
                        Event intelligence source changes with this code. Run Aria and Market Sync use the selected
                        market code to fetch local events. Example: <span className="font-medium text-text-primary">ESP_MAD</span> means Madrid
                        event feed, <span className="font-medium text-text-primary">UAE_DXB</span> means Dubai event feed.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-border-subtle pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <Label className="text-body-xs text-text-primary font-medium">
                          Currency Override
                        </Label>
                        <p className="text-[10px] text-text-tertiary">
                          Market default: {activeMarket?.currency || org?.currency || "AED"}
                        </p>
                      </div>
                      <Switch
                        checked={useCurrencyOverride}
                        onCheckedChange={setUseCurrencyOverride}
                      />
                    </div>

                    {useCurrencyOverride && (
                      <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                        <Label className="text-body-xs text-text-secondary">Custom Currency</Label>
                        <Input
                          value={currencyOverride}
                          onChange={(e) => setCurrencyOverride(e.target.value.toUpperCase())}
                          placeholder="e.g. USD, EUR, AED"
                          className="bg-surface-2 border-border-default h-10 text-body-xs"
                          maxLength={3}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      const previousMarket = org?.marketCode;
                      const marketChanged = selectedMarket !== previousMarket;
                      const ok = await handleSave({
                        marketCode: selectedMarket,
                        settings: {
                          overrides: {
                            currency: useCurrencyOverride ? currencyOverride : null,
                          },
                        },
                      });
                      if (ok && marketChanged) {
                        toast.info("Primary market updated", {
                          description:
                            "Run Aria to refresh market events and pricing context for the new market.",
                          duration: 7000,
                        });
                      }
                    }}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Market
                  </button>
                </div>

                {/* Market Spec Card */}
                <div className="bg-surface-2/50 rounded-lg p-4 border border-border-subtle flex flex-col gap-3">
                  <h4 className="text-body-xs font-bold text-text-tertiary uppercase tracking-wider">
                    Market Intelligence Spec
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SpecRow label="Currency" value={activeMarket?.currency || "—"} />
                    <SpecRow
                      label="Weekend"
                      value={(activeMarket?.weekend || "sat_sun").replace("_", " & ").toUpperCase()}
                    />
                    <SpecRow label="Timezone" value={activeMarket?.timezone || "—"} />
                    <SpecRow label="Market Code" value={selectedMarket} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: Organization ─────────────────────────────────────────── */}
        <TabsContent
          value="organization"
          className="mt-8 space-y-8 animate-in fade-in-50 duration-500"
        >
          <div className="grid gap-6">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Organization Name</Label>
                    <Input
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="bg-surface-2 border-border-default h-10 text-body-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Email</Label>
                    <Input
                      value={org?.email || ""}
                      disabled
                      className="bg-surface-2 border-border-default h-10 text-body-xs opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="bg-surface-2 border-border-default h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-2 border-border-default text-text-primary max-h-60">
                        {[
                          "Asia/Dubai",
                          "Asia/Kolkata",
                          "Asia/Tokyo",
                          "Asia/Singapore",
                          "Europe/London",
                          "Europe/Paris",
                          "Europe/Amsterdam",
                          "Europe/Lisbon",
                          "America/New_York",
                          "America/Chicago",
                          "America/Los_Angeles",
                          "America/Sao_Paulo",
                          "Australia/Sydney",
                          "Africa/Cape_Town",
                          "Pacific/Auckland",
                        ].map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    onClick={() => handleSave({ name: orgName, timezone })}
                    disabled={saving}
                    className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <SaveIcon saving={saving} saved={saved} />
                    Save Organization
                  </button>
                </div>

                {/* Plan Card */}
                <div className="flex flex-col justify-center gap-2 p-6 rounded-xl bg-amber-dim border border-amber/10">
                  <span className="text-body-xs font-bold text-amber uppercase tracking-widest">
                    Active Plan
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-text-primary">
                      {PLAN_LABELS[org?.plan || "starter"] || "Starter"} Plan
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    {PLAN_LIMITS[org?.plan || "starter"]}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-surface-2 text-text-tertiary border-border-subtle"
                    >
                      Role: {org?.role || "owner"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] border-none",
                        org?.systemState === "active"
                          ? "bg-green-500/10 text-green-400"
                          : "bg-amber-500/10 text-amber-400"
                      )}
                    >
                      System: {org?.systemState || "connected"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ── Small Components ─────────────────────────────────────────────────────────

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-text-tertiary">{label}</span>
      <span className="text-body-xs font-medium text-text-primary">{value}</span>
    </div>
  );
}


function SaveIcon({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (saved) return <Check className="h-3.5 w-3.5" />;
  return <Save className="h-3.5 w-3.5" />;
}
