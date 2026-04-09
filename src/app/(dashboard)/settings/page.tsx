"use client";

import { useState, useEffect } from "react";
import { 
  Building2, 
  Settings2, 
  Globe2, 
  Link2, 
  Users2, 
  Home, 
  ShieldCheck, 
  Activity, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  Trash2,
  ChevronRight,
  Sun,
  Moon,
  Monitor
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- MOCK DATA ---

const mockOrg = {
  name: "Dubai Stays Management",
  marketCode: "UAE_DXB",
  currency: "AED",
  timezone: "Asia/Dubai",
  plan: "growth"
};

const mockMarkets = [
  { code: "UAE_DXB", name: "Dubai", country: "UAE", currency: "AED", weekend: "thu_fri", flag: "🇦🇪" },
  { code: "GBR_LON", name: "London", country: "UK", currency: "GBP", weekend: "fri_sat", flag: "🇬🇧" },
  { code: "USA_NYC", name: "New York", country: "USA", currency: "USD", weekend: "fri_sat", flag: "🇺🇸" },
  { code: "FRA_PAR", name: "Paris", country: "France", currency: "EUR", weekend: "fri_sat", flag: "🇫🇷" },
  { code: "NLD_AMS", name: "Amsterdam", country: "Netherlands", currency: "EUR", weekend: "fri_sat", flag: "🇳🇱" },
  { code: "ESP_BCN", name: "Barcelona", country: "Spain", currency: "EUR", weekend: "fri_sat", flag: "🇪🇸" },
  { code: "USA_MIA", name: "Miami", country: "USA", currency: "USD", weekend: "fri_sat", flag: "🇺🇸" },
  { code: "PRT_LIS", name: "Lisbon", country: "Portugal", currency: "EUR", weekend: "fri_sat", flag: "🇵🇹" },
  { code: "USA_NSH", name: "Nashville", country: "USA", currency: "USD", weekend: "fri_sat", flag: "🇺🇸" },
  { code: "AUS_SYD", name: "Sydney", country: "Australia", currency: "AUD", weekend: "fri_sat", flag: "🇦🇺" }
];

const mockTeam = [
  { id: 1, name: "Rohith P", email: "rohith@priceos.ai", role: "Owner", avatar: "RP" },
  { id: 2, name: "Sarah Al-Maktoum", email: "sarah@dubaistays.com", role: "Admin", avatar: "SA" },
  { id: 3, name: "Michael Chen", email: "m.chen@dubaistays.com", role: "Viewer", avatar: "MC" },
];

const mockProperties = [
  { id: "prop_1", name: "Burj Khalifa Tower - Luxury Studio", location: "Downtown Dubai", beds: 1, market: "UAE_DXB", status: "synced", lastSync: "2 mins ago" },
  { id: "prop_2", name: "Palm Jumeirah Villa - Signature", location: "The Palm", beds: 5, market: "UAE_DXB", status: "pending", lastSync: "1 hour ago" },
  { id: "prop_3", name: "Marina Heights Penthouse", location: "Dubai Marina", beds: 3, market: "UAE_DXB", status: "error", lastSync: "Failed 4h ago" },
];

// --- COMPONENTS ---

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("ha_live_6723948572039485723049587234");
  const [selectedMarket, setSelectedMarket] = useState(mockOrg.marketCode);
  const [useMarketDefaultCurrency, setUseMarketDefaultCurrency] = useState(true);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeMarket = mockMarkets.find(m => m.code === selectedMarket);

  const handleTestConnection = () => {
    toast.success("Hostaway Connection Successful", {
      description: "Successfully fetched 42 active properties.",
    });
  };

  return (
    <div className="flex flex-col gap-8 p-10 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary text-body">Manage your organization, properties, and AI pipeline guardrails.</p>
      </div>

      <Tabs defaultValue="connections" className="w-full">
        <TabsList className="bg-surface-1 border border-border-subtle p-1 h-12">
          <TabsTrigger value="connections" className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6">
            <Link2 className="h-3.5 w-3.5 mr-2" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="organization" className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6">
            <Building2 className="h-3.5 w-3.5 mr-2" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="properties" className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6">
            <Home className="h-3.5 w-3.5 mr-2" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="automation" className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6">
            <Activity className="h-3.5 w-3.5 mr-2" />
            Automation
          </TabsTrigger>
          <TabsTrigger value="display" className="data-[state=active]:bg-surface-2 data-[state=active]:text-amber text-body-xs font-medium px-6">
            <Monitor className="h-3.5 w-3.5 mr-2" />
            Display
          </TabsTrigger>
        </TabsList>

        {/* TAB: Connections */}
        <TabsContent value="connections" className="mt-8 space-y-8 animate-in fade-in-50 duration-500">
          <div className="grid gap-6">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">PMS Integration</h3>
                <p className="text-body-xs text-text-tertiary">Sync your property data and push pricing changes to Hostaway.</p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="hostaway-api" className="text-body-xs text-text-secondary">Hostaway API Key</Label>
                  <div className="relative">
                    <Input 
                      id="hostaway-api"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="bg-surface-2 border-border-default h-10 pr-10 font-mono text-body-xs"
                    />
                    <button 
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button 
                  onClick={handleTestConnection}
                  className="bg-amber hover:bg-amber/90 text-black font-bold h-10 px-6 rounded-md text-body-xs w-fit transition-all flex items-center"
                >
                  Test Connection
                </button>
              </div>
            </div>

            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">Market Configuration</h3>
                <p className="text-body-xs text-text-tertiary">Select your primary operating market for AI intelligence templates.</p>
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
                        {mockMarkets.map((m) => (
                          <SelectItem key={m.code} value={m.code}>
                            <span className="flex items-center gap-2">
                              <span>{m.flag}</span>
                              <span>{m.name}, {m.country}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px] bg-amber-dim text-amber border-amber/20 h-5">
                        {selectedMarket === mockOrg.marketCode ? "Auto-detected from Hostaway" : "Custom"}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-border-subtle pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <Label className="text-body-xs text-text-primary font-medium">Currency Configuration</Label>
                        <p className="text-[10px] text-text-tertiary">Market Default: {activeMarket?.currency}</p>
                      </div>
                      <Switch 
                        checked={useMarketDefaultCurrency} 
                        onCheckedChange={setUseMarketDefaultCurrency}
                      />
                    </div>
                    
                    {!useMarketDefaultCurrency && (
                      <div className="space-y-2 animate-in slide-in-from-top-1 duration-200">
                        <Label className="text-body-xs text-text-secondary">Custom Currency Override</Label>
                        <Input 
                          placeholder="e.g. USD, EUR, AED"
                          className="bg-surface-2 border-border-default h-10 text-body-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-surface-2/50 rounded-lg p-4 border border-border-subtle flex flex-col gap-3">
                  <h4 className="text-body-xs font-bold text-text-tertiary uppercase tracking-wider">Market Intelligence Spec</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-tertiary">Currency</span>
                      <span className="text-body-xs font-medium text-text-primary">{activeMarket?.currency}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-tertiary">Weekend</span>
                      <span className="text-body-xs font-medium text-text-primary uppercase">{activeMarket?.weekend.replace("_", " & ")}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-tertiary">AI Model</span>
                      <span className="text-body-xs font-medium text-text-primary">PriceOS-A1-DXB</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-tertiary">Sources</span>
                      <span className="text-body-xs font-medium text-text-primary">12 Connected</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Organization */}
        <TabsContent value="organization" className="mt-8 space-y-8 animate-in fade-in-50 duration-500">
          <div className="grid gap-6">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Organization Name</Label>
                    <Input 
                      defaultValue={mockOrg.name}
                      className="bg-surface-2 border-border-default h-10 text-body-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-body-xs text-text-secondary">Timezone</Label>
                    <Select defaultValue={mockOrg.timezone}>
                      <SelectTrigger className="bg-surface-2 border-border-default h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-surface-2 border-border-default text-text-primary">
                        <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT+0)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (GMT-5)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-2 p-6 rounded-xl bg-amber-dim border border-amber/10">
                  <span className="text-body-xs font-bold text-amber uppercase tracking-widest">Active Plan</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-text-primary">Growth Plan</span>
                    <span className="text-body-xs text-text-tertiary">Standard</span>
                  </div>
                  <p className="text-[11px] text-text-secondary">Your plan allows up to 50 active property units and 5 team seats.</p>
                </div>
              </div>
            </div>

            <div className="bg-surface-1 border border-border-subtle rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
                <h3 className="text-title font-semibold text-text-primary">Team Members</h3>
                <button className="text-amber hover:text-amber/80 text-[11px] font-bold uppercase tracking-wider transition-colors">Invited Members (2)</button>
              </div>
              <Table>
                <TableHeader className="bg-surface-2/50 border-b border-border-subtle">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="text-2xs uppercase tracking-widest text-text-tertiary h-10">Member</TableHead>
                    <TableHead className="text-2xs uppercase tracking-widest text-text-tertiary h-10">Email</TableHead>
                    <TableHead className="text-2xs uppercase tracking-widest text-text-tertiary h-10">Role</TableHead>
                    <TableHead className="text-2xs uppercase tracking-widest text-text-tertiary h-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTeam.map((member) => (
                    <TableRow key={member.id} className="border-border-subtle hover:bg-surface-2/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-lg bg-surface-3">
                            <AvatarFallback className="text-[10px] font-bold text-text-secondary">{member.avatar}</AvatarFallback>
                          </Avatar>
                          <span className="text-body-xs font-medium text-text-primary">{member.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-body-xs text-text-secondary">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          "text-[10px] border-none font-semibold",
                          member.role === "Owner" ? "bg-amber-dim text-amber" : "bg-surface-3 text-text-tertiary"
                        )}>
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right px-6">
                        <button className="text-text-tertiary hover:text-red-400 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Properties */}
        <TabsContent value="properties" className="mt-8 space-y-8 animate-in fade-in-50 duration-500">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockProperties.map((prop) => (
                <div key={prop.id} className="bg-surface-1 border border-border-default rounded-xl p-5 flex flex-col gap-4 group hover:border-amber/30 transition-all">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-body font-semibold text-text-primary leading-snug group-hover:text-amber transition-colors line-clamp-1">{prop.name}</h4>
                      <div className="flex items-center gap-1.5 text-text-tertiary">
                        <Globe2 className="h-3 w-3" />
                        <span className="text-[10px]">{prop.location}</span>
                      </div>
                    </div>
                    <Badge className={cn(
                      "text-[9px] uppercase tracking-tighter px-1.5 py-0 border-none",
                      prop.status === "synced" ? "bg-emerald-500/10 text-emerald-500" :
                      prop.status === "pending" ? "bg-amber-500/10 text-amber-500" :
                      "bg-red-500/10 text-red-500"
                    )}>
                      {prop.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-disabled uppercase">Bedrooms</span>
                      <span className="text-body-xs font-bold text-text-secondary">{prop.beds} BR</span>
                    </div>
                    <div className="h-6 w-[1px] bg-border-subtle" />
                    <div className="flex-1">
                      <label className="text-[10px] text-text-disabled uppercase block mb-1">Market Template</label>
                      <Select defaultValue={prop.market}>
                        <SelectTrigger className="h-7 bg-surface-2 border-border-subtle py-0 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-surface-2 border-border-default text-text-primary">
                          <SelectItem value="UAE_DXB">Dubai Master</SelectItem>
                          <SelectItem value="GBR_LON">London Core</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                       <Clock className="h-3 w-3 text-text-tertiary" />
                       <span className="text-[10px] text-text-tertiary">Sync Profile: {prop.lastSync}</span>
                    </div>
                    <button className="h-6 w-6 rounded-md bg-surface-2 flex items-center justify-center text-text-secondary hover:bg-amber-dim hover:text-amber transition-all">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              <button className="bg-surface-0 border-2 border-dashed border-border-subtle rounded-xl p-5 flex flex-col items-center justify-center gap-2 hover:bg-surface-1 hover:border-amber/50 transition-all text-text-tertiary hover:text-amber">
                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <span className="text-body-xs font-medium">Re-sync from Hostaway</span>
              </button>
           </div>
        </TabsContent>

        {/* TAB: Automation */}
        <TabsContent value="automation" className="mt-8 space-y-8 animate-in fade-in-50 duration-500">
          <div className="grid gap-6">
            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-8">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">Pricing Guardrails</h3>
                <p className="text-body-xs text-text-tertiary">Define safety limits for automated pricing adjustments.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-xs text-text-secondary font-medium">Max Single-Day Change %</Label>
                      <span className="text-body-xs font-bold text-amber">15%</span>
                    </div>
                    {/* Range Slider implementation is simplified here as we are using shadcn components */}
                    <div className="h-1.5 w-full bg-surface-2 rounded-full relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-full w-[15%] bg-amber" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-tertiary">Market default: 15%</span>
                      <button className="text-[10px] text-amber hover:underline">Reset to market default</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-body-xs text-text-secondary font-medium">Auto-Approve Threshold</Label>
                      <span className="text-body-xs font-bold text-amber">5%</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-2 rounded-full relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-full w-[5%] bg-amber" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-tertiary">Market default: 5%</span>
                      <button className="text-[10px] text-amber hover:underline">Reset to market default</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-surface-2 border border-border-subtle p-5 space-y-4">
                   <div className="flex items-start gap-3">
                     <ShieldCheck className="h-5 w-5 text-amber shrink-0" />
                     <div className="flex flex-col gap-1">
                        <span className="text-body-xs font-bold text-text-primary">Safety Intelligence Active</span>
                        <p className="text-[11px] text-text-secondary leading-relaxed">Changes exceeding these limits will require manual human-in-the-loop (HITL) approval before pushing to PMS.</p>
                     </div>
                   </div>
                </div>
              </div>
            </div>

            <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <h3 className="text-title font-semibold text-text-primary">Pipeline Schedule</h3>
                <p className="text-body-xs text-text-tertiary">Configure the orchestration frequency for the intelligence engine.</p>
              </div>

              <div className="grid gap-4 mt-2">
                {[
                  { title: "Auto-run pipeline", description: "Daily at midnight, run Sources → Detectors → Insights cycle.", default: true },
                  { title: "Auto-push prices", description: "Automatically push approved price changes to Hostaway.", default: false },
                  { title: "High-severity alerts", description: "Email notifications for insights categorized as high impact.", default: true },
                ].map((toggle, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border-subtle bg-surface-2/20 hover:bg-surface-2/40 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body-xs font-bold text-text-primary">{toggle.title}</span>
                      <span className="text-[10px] text-text-tertiary">{toggle.description}</span>
                    </div>
                    <Switch defaultChecked={toggle.default} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: Display */}
        <TabsContent value="display" className="mt-8 space-y-8 animate-in fade-in-50 duration-500">
          <div className="bg-surface-1 border border-border-subtle rounded-xl p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-title font-semibold text-text-primary">Theme Settings</h3>
              <p className="text-body-xs text-text-tertiary">Select how PriceOS looks on your device.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { id: 'light', name: 'Light', icon: Sun },
                { id: 'dark', name: 'Dark', icon: Moon },
                { id: 'system', name: 'System', icon: Monitor },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-xl border transition-all duration-200",
                    (mounted && theme === t.id)
                      ? "bg-amber-dim border-amber text-amber"
                      : "bg-surface-2 border-border-subtle text-text-secondary hover:border-border-strong"
                  )}
                >
                  <t.icon className={cn("h-6 w-6", (mounted && theme === t.id) ? "text-amber" : "text-text-tertiary")} />
                  <span className="text-body-xs font-bold uppercase tracking-widest">{t.name}</span>
                </button>
              ))}
            </div>
            
            <div className="p-4 rounded-lg bg-surface-2 border border-border-subtle">
              <p className="text-[11px] text-text-tertiary leading-relaxed text-center">
                System mode will automatically switch between light and dark based on your device settings.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
