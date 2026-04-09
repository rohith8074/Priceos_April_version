"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

interface AutopilotConfig {
    lastMinuteEnabled: boolean;
    lastMinuteDaysOut: number;
    lastMinuteDiscountPct: string;
    lastMinuteMinStay: number | null;
    farOutEnabled: boolean;
    farOutDaysOut: number;
    farOutMarkupPct: string;
    farOutMinStay: number | null;
    dowPricingEnabled: boolean;
    dowDays: number[];
    dowPriceAdjPct: string;
    dowMinStay: number | null;
    gapPreventionEnabled: boolean;
    minFragmentThreshold: number;
    gapFillEnabled: boolean;
    gapFillLengthMin: number;
    gapFillLengthMax: number;
    gapFillDiscountPct: string;
    gapFillOverrideCico: boolean;
    allowedCheckinDays: number[];
    allowedCheckoutDays: number[];
    lowestMinStayAllowed: number;
    defaultMaxStay: number;
}

export function AutopilotSettings({ listingId }: { listingId: string }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [config, setConfig] = useState<AutopilotConfig | null>(null);

    useEffect(() => {
        fetchConfig();
    }, [listingId]);

    const fetchConfig = async () => {
        try {
            const res = await fetch(`/api/listings/${listingId}/engine-config`);
            const data = await res.json();
            setConfig(data);
        } catch (err) {
            toast.error("Failed to load autopilot configuration");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/listings/${listingId}/engine-config`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config),
            });
            if (res.ok) {
                toast.success("Settings saved successfully");
            } else {
                throw new Error("Failed to save");
            }
        } catch (err) {
            toast.error("Cloud not save settings");
        } finally {
            setSaving(false);
        }
    };

    const handleRunEngine = async () => {
        setRunning(true);
        try {
            const res = await fetch(`/api/listings/${listingId}/run-engine`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ triggerDetail: "UI Manual Refresh" }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Engine run success! ${data.daysChanged} days updated.`);
            } else {
                throw new Error(data.error || "Execution failed");
            }
        } catch (err: any) {
            toast.error(`Engine Error: ${err.message}`);
        } finally {
            setRunning(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    if (!config) return <div>Configuration not found</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h3 className="text-lg font-medium">Autopilot Configuration</h3>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleRunEngine} disabled={running}>
                        {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Recalculate Prices
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Settings
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Last Minute */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last-Minute Discount</CardTitle>
                        <Switch
                            checked={config.lastMinuteEnabled}
                            onCheckedChange={(val) => setConfig({ ...config, lastMinuteEnabled: val })}
                        />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Days Out</Label>
                                <Input
                                    type="number"
                                    value={config.lastMinuteDaysOut ?? 0}
                                    onChange={(e) => setConfig({ ...config, lastMinuteDaysOut: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Discount %</Label>
                                <Input
                                    type="number"
                                    value={config.lastMinuteDiscountPct ?? ""}
                                    onChange={(e) => setConfig({ ...config, lastMinuteDiscountPct: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Min Stay Override (optional)</Label>
                            <Input
                                type="number"
                                placeholder="PMS Default"
                                value={config.lastMinuteMinStay ?? ""}
                                onChange={(e) => setConfig({ ...config, lastMinuteMinStay: e.target.value ? parseInt(e.target.value) : null })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Far Out */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Far-Out Premium</CardTitle>
                        <Switch
                            checked={config.farOutEnabled}
                            onCheckedChange={(val) => setConfig({ ...config, farOutEnabled: val })}
                        />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Days Out</Label>
                                <Input
                                    type="number"
                                    value={config.farOutDaysOut ?? 0}
                                    onChange={(e) => setConfig({ ...config, farOutDaysOut: parseInt(e.target.value) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Markup %</Label>
                                <Input
                                    type="number"
                                    value={config.farOutMarkupPct ?? ""}
                                    onChange={(e) => setConfig({ ...config, farOutMarkupPct: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Min Stay Override (optional)</Label>
                            <Input
                                type="number"
                                placeholder="PMS Default"
                                value={config.farOutMinStay ?? ""}
                                onChange={(e) => setConfig({ ...config, farOutMinStay: e.target.value ? parseInt(e.target.value) : null })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Day of Week */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Weekend Pricing (DOW)</CardTitle>
                        <Switch
                            checked={config.dowPricingEnabled}
                            onCheckedChange={(val) => setConfig({ ...config, dowPricingEnabled: val })}
                        />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Adjustment days</Label>
                            <div className="flex gap-1">
                                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                                    <Button
                                        key={i}
                                        variant={config.dowDays.includes(i) ? "default" : "outline"}
                                        size="sm"
                                        className="h-8 w-8 p-0 text-xs"
                                        onClick={() => {
                                            const newDays = config.dowDays.includes(i)
                                                ? config.dowDays.filter(d => d !== i)
                                                : [...config.dowDays, i];
                                            setConfig({ ...config, dowDays: newDays });
                                        }}
                                    >
                                        {day}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Adjustment %</Label>
                                <Input
                                    type="number"
                                    value={config.dowPriceAdjPct ?? ""}
                                    onChange={(e) => setConfig({ ...config, dowPriceAdjPct: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Min Stay</Label>
                                <Input
                                    type="number"
                                    placeholder="No change"
                                    value={config.dowMinStay ?? ""}
                                    onChange={(e) => setConfig({ ...config, dowMinStay: e.target.value ? parseInt(e.target.value) : null })}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Gaps */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Gap Handling</CardTitle>
                        <Switch
                            checked={config.gapFillEnabled}
                            onCheckedChange={(val) => setConfig({ ...config, gapFillEnabled: val })}
                        />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-medium">Gap Prevention</Label>
                                <p className="text-[10px] text-muted-foreground">Block fragments too short to rent</p>
                            </div>
                            <Switch
                                checked={config.gapPreventionEnabled}
                                onCheckedChange={(val) => setConfig({ ...config, gapPreventionEnabled: val })}
                            />
                        </div>
                        {config.gapPreventionEnabled && (
                            <div className="space-y-2">
                                <Label className="text-xs">Min Fragment (days)</Label>
                                <Input
                                    type="number"
                                    className="h-8"
                                    value={config.minFragmentThreshold ?? 0}
                                    onChange={(e) => setConfig({ ...config, minFragmentThreshold: parseInt(e.target.value) })}
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 pb-2 border-b">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-medium">Gap Fill</Label>
                                <p className="text-[10px] text-muted-foreground">Discount mid-week gaps</p>
                            </div>
                            <Switch
                                checked={config.gapFillEnabled}
                                onCheckedChange={(val) => setConfig({ ...config, gapFillEnabled: val })}
                            />
                        </div>
                        {config.gapFillEnabled && (
                            <div className="space-y-4 pt-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Min Length</Label>
                                        <Input
                                            type="number"
                                            className="h-8"
                                            value={config.gapFillLengthMin ?? 0}
                                            onChange={(e) => setConfig({ ...config, gapFillLengthMin: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Max Length</Label>
                                        <Input
                                            type="number"
                                            className="h-8"
                                            value={config.gapFillLengthMax ?? 0}
                                            onChange={(e) => setConfig({ ...config, gapFillLengthMax: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Discount %</Label>
                                    <Input
                                        type="number"
                                        className="h-8"
                                        value={config.gapFillDiscountPct ?? ""}
                                        onChange={(e) => setConfig({ ...config, gapFillDiscountPct: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        checked={config.gapFillOverrideCico}
                                        onCheckedChange={(val) => setConfig({ ...config, gapFillOverrideCico: val })}
                                    />
                                    <Label className="text-xs">Override CICO rules</Label>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Base Operations Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base font-medium">Base Operations & Stay Limits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Stay Limits */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Absolute Minimum Stay</Label>
                                <Input
                                    type="number"
                                    value={config.lowestMinStayAllowed ?? 0}
                                    onChange={(e) => setConfig({ ...config, lowestMinStayAllowed: parseInt(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground">Engine will NEVER go below this, even for gaps</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Maximum Stay</Label>
                                <Input
                                    type="number"
                                    value={config.defaultMaxStay ?? 365}
                                    onChange={(e) => setConfig({ ...config, defaultMaxStay: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        {/* CICO Restrictions */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm">Allowed Check-in Days</Label>
                                <div className="flex gap-1">
                                    {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                                        <Button
                                            key={i}
                                            variant={config.allowedCheckinDays?.[i] === 1 ? "default" : "outline"}
                                            size="sm"
                                            className="h-8 w-8 p-0 text-xs"
                                            onClick={() => {
                                                const newDays = [...(config.allowedCheckinDays || [1, 1, 1, 1, 1, 1, 1])];
                                                newDays[i] = newDays[i] === 1 ? 0 : 1;
                                                setConfig({ ...config, allowedCheckinDays: newDays });
                                            }}
                                        >
                                            {day}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">Allowed Check-out Days</Label>
                                <div className="flex gap-1">
                                    {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                                        <Button
                                            key={i}
                                            variant={config.allowedCheckoutDays?.[i] === 1 ? "default" : "outline"}
                                            size="sm"
                                            className="h-8 w-8 p-0 text-xs"
                                            onClick={() => {
                                                const newDays = [...(config.allowedCheckoutDays || [1, 1, 1, 1, 1, 1, 1])];
                                                newDays[i] = newDays[i] === 1 ? 0 : 1;
                                                setConfig({ ...config, allowedCheckoutDays: newDays });
                                            }}
                                        >
                                            {day}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
