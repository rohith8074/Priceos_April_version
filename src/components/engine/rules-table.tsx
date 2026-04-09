"use client";

import { useEffect, useState } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface PricingRule {
    id: number;
    name: string;
    ruleType: string;
    startDate: string | null;
    endDate: string | null;
    enabled: boolean;
    priceAdjPct: string | null;
    priceOverride: string | null;
}

export function RulesTable({ listingId }: { listingId: string }) {
    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<PricingRule[]>([]);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // New rule state
    const [newRule, setNewRule] = useState({
        name: "",
        ruleType: "SEASON",
        startDate: "",
        endDate: "",
        priceAdjPct: "",
        priceOverride: "",
        priority: 0,
    });

    useEffect(() => {
        fetchRules();
    }, [listingId]);

    const fetchRules = async () => {
        try {
            const res = await fetch(`/api/listings/${listingId}/rules`);
            if (!res.ok) {
                throw new Error("Failed to fetch");
            }
            const data = await res.json();
            setRules(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error("Failed to load rules");
            setRules([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (ruleId: number) => {
        if (!confirm("Are you sure you want to delete this rule?")) return;
        try {
            const res = await fetch(`/api/listings/${listingId}/rules?ruleId=${ruleId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                toast.success("Rule deleted");
                setRules(rules.filter(r => r.id !== ruleId));
            }
        } catch (err) {
            toast.error("Failed to delete rule");
        }
    };

    const handleAddRule = async () => {
        if (!newRule.name || !newRule.startDate || !newRule.endDate) {
            toast.error("Please fill in Name and Dates");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/listings/${listingId}/rules`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newRule,
                    // Convert empty strings to null for the backend
                    priceAdjPct: newRule.priceAdjPct || null,
                    priceOverride: newRule.priceOverride || null,
                }),
            });
            if (res.ok) {
                const added = await res.json();
                setRules([...rules, added]);
                setOpen(false);
                setNewRule({
                    name: "",
                    ruleType: "SEASON",
                    startDate: "",
                    endDate: "",
                    priceAdjPct: "",
                    priceOverride: "",
                    priority: 0,
                });
                toast.success("Rule added successfully");
            }
        } catch (err) {
            toast.error("Failed to add rule");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h3 className="text-lg font-medium">Seasonal & Event Rules</h3>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Rule
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Pricing Rule</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Rule Name</Label>
                                <Input
                                    placeholder="e.g., Christmas Peak"
                                    value={newRule.name}
                                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select
                                        value={newRule.ruleType}
                                        onValueChange={(val) => setNewRule({ ...newRule, ruleType: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SEASON">Season</SelectItem>
                                            <SelectItem value="EVENT">Event</SelectItem>
                                            <SelectItem value="LOS_DISCOUNT">LOS Discount</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Priority</Label>
                                    <Input
                                        type="number"
                                        value={newRule.priority}
                                        onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Input
                                        type="date"
                                        value={newRule.startDate}
                                        onChange={(e) => setNewRule({ ...newRule, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Date</Label>
                                    <Input
                                        type="date"
                                        value={newRule.endDate}
                                        onChange={(e) => setNewRule({ ...newRule, endDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Price Adjustment %</Label>
                                    <Input
                                        type="text"
                                        placeholder="+/- %"
                                        value={newRule.priceAdjPct}
                                        onChange={(e) => setNewRule({ ...newRule, priceAdjPct: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fixed Price Override (optional)</Label>
                                    <Input
                                        type="text"
                                        placeholder="e.g. 500"
                                        value={newRule.priceOverride}
                                        onChange={(e) => setNewRule({ ...newRule, priceOverride: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button onClick={handleAddRule} disabled={saving}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Create Rule
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead>Adjustment</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No rules configured for this property.
                                </TableCell>
                            </TableRow>
                        ) : rules.map((rule) => (
                            <TableRow key={rule.id}>
                                <TableCell className="font-medium">{rule.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{rule.ruleType}</Badge>
                                </TableCell>
                                <TableCell className="text-sm">
                                    {rule.startDate} to {rule.endDate}
                                </TableCell>
                                <TableCell>
                                    {rule.priceOverride ? `$${rule.priceOverride}` : `${rule.priceAdjPct}%`}
                                </TableCell>
                                <TableCell>
                                    <Switch checked={rule.enabled} />
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
