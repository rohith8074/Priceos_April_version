"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Building2, TrendingUp, DollarSign, CalendarCheck, Search, Bot, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { addDays, format, isWithinInterval, parseISO } from 'date-fns';

interface PropertyMetric {
  id: string;
  name: string;
  area: string;
  bedroomsNumber?: number;
  price: number | string;
  occupancy: number;
  avgPrice: number;
  revenue: number;
  calendarDays?: {
    date: string;
    status: string;
    price: number;
    minimumStay?: number;
    maximumStay?: number;
  }[];
  reservations?: { title: string; email?: string; startDate: string; endDate: string; financials: any }[];
}

interface OverviewClientProps {
  properties: PropertyMetric[];
  totalProperties: number;
  avgPortfolioOccupancy: number;
  avgPortfolioPrice: number;
  totalPortfolioRevenue: number;
  totalHistoricalRevenue: number;
}

export function OverviewClient({
  properties,
  totalProperties,
  avgPortfolioOccupancy,
  avgPortfolioPrice,
  totalPortfolioRevenue,
  totalHistoricalRevenue
}: OverviewClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [calendarStartDate, setCalendarStartDate] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  // Agent status strip
  const [agentStatus, setAgentStatus] = useState<{
    activeCount: number;
    warningCount: number;
    errorCount: number;
    pendingProposals: number;
    criticalInsights: number;
    isStale: boolean;
    lastRunAt: string | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/agents/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.summary) setAgentStatus(data.summary); })
      .catch(() => {});
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    // VERSION: 2.1 - Sync UI Update
    try {
      const response = await fetch("/api/sync/trigger", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }
      toast.success("Sync started! Data is being updated in the background. The button will re-enable in 3 minutes.", {
        duration: 8000,
      });

      // Keep button disabled for 3 minutes to cover typical sync duration
      setTimeout(() => {
        setIsSyncing(false);
        toast.info("Sync timer completed. Refreshing data...");
        window.location.reload();
      }, 180000); // 3 minutes
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
      setIsSyncing(false);
    }
  };

  const [revenueFilter, setRevenueFilter] = useState("10");
  const [occupancyFilter, setOccupancyFilter] = useState("10");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  const filteredProperties = properties.filter((prop) =>
    prop.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prop.area.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dynamic KPIs based on search
  const filteredTotalProperties = filteredProperties.length;
  const filteredTotalRevenue = filteredProperties.reduce((sum, p) => sum + p.revenue, 0);

  const activePropsForOcc = filteredProperties.filter(p => p.occupancy > 0);
  const filteredAvgOccupancy = activePropsForOcc.length > 0
    ? Math.round(activePropsForOcc.reduce((sum, p) => sum + p.occupancy, 0) / activePropsForOcc.length)
    : 0;

  const activePropsForPrice = filteredProperties.filter(p => p.avgPrice > 0);
  const filteredAvgPrice = activePropsForPrice.length > 0
    ? Math.round(activePropsForPrice.reduce((sum, p) => sum + p.avgPrice, 0) / activePropsForPrice.length)
    : 0;

  // Generate an array of the next 30 days for the Global Calendar header
  const next30Days = Array.from({ length: 30 }).map((_, i) => addDays(calendarStartDate, i));

  const revenueLimit = revenueFilter === 'all' ? filteredProperties.length : parseInt(revenueFilter);
  const chartData = [...filteredProperties]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, revenueLimit);

  // Generate channel revenue data for Pie Chart
  const channelDataMap: Record<string, number> = {};
  filteredProperties.forEach(prop => {
    prop.reservations?.forEach(res => {
      const channel = res.financials?.channelName || res.financials?.channel || 'Direct';
      const revenue = res.financials?.hostPayout || res.financials?.totalPrice || 0;
      const normalizedChannel = channel.toLowerCase().includes('airbnb') ? 'Airbnb' :
        channel.toLowerCase().includes('booking') ? 'Booking.com' : 'Direct';

      channelDataMap[normalizedChannel] = (channelDataMap[normalizedChannel] || 0) + revenue;
    });
  });

  const channelDataAll = Object.keys(channelDataMap).map(key => ({
    name: key,
    value: channelDataMap[key]
  })).sort((a, b) => b.value - a.value);

  const channelLimit = channelFilter === 'all' ? channelDataAll.length : parseInt(channelFilter);
  const channelData = channelDataAll.slice(0, channelLimit);

  // Chart Data: Occupancy by Property
  const occupancyLimit = occupancyFilter === 'all' ? filteredProperties.length : parseInt(occupancyFilter);
  const occupancyData = [...filteredProperties]
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, occupancyLimit);

  // Chart Data: Revenue by Property Type
  const typeDataMap: Record<string, number> = {};
  filteredProperties.forEach(prop => {
    const bedrooms = prop.bedroomsNumber ?? 0;
    const type = bedrooms === 0 ? "Studio" : `${bedrooms} Bedroom`;
    typeDataMap[type] = (typeDataMap[type] || 0) + prop.revenue;
  });

  const typeData = Object.keys(typeDataMap).map(key => ({
    name: key,
    value: typeDataMap[key]
  })).sort((a, b) => b.value - a.value);

  const PIE_COLORS: Record<string, string> = {
    'Airbnb': '#ef4444',
    'Booking.com': '#3b82f6',
    'Direct': '#10b981'
  };

  const BAR_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
    '#f43f5e', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border/50 p-3 rounded-xl shadow-lg">
          <p className="font-semibold text-sm mb-1 text-foreground dark:text-white">{label}</p>
          <p className="text-emerald-600 dark:text-emerald-500 font-bold text-sm">
            {payload[0].name === "occupancy" ? `${payload[0].value}%` : `${payload[0].value.toLocaleString()} AED`}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {payload[0].name === "occupancy" ? "Occupancy Rate" : "Projected Revenue"}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto w-full p-8 bg-background text-foreground dark:bg-black relative">
      {/* Ambient background glow for glassmorphism */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vh] rounded-full bg-amber-500/20 dark:bg-amber-500/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vh] rounded-full bg-emerald-500/20 dark:bg-emerald-500/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-[40%] left-[30%] w-[30vw] h-[30vh] rounded-full bg-violet-500/20 dark:bg-violet-500/10 blur-[120px] pointer-events-none z-0" />

      <div className="z-10 relative flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-white">Portfolio Analytics</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            30-day forward-looking property performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            variant="outline"
            className="gap-2 bg-background/50 backdrop-blur-sm border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/10 text-amber-600 dark:text-amber-500"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Hostaway"}
          </Button>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter properties or locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50 border-muted-foreground/20 focus-visible:ring-amber-500/30"
            />
          </div>
        </div>
      </div>

      {/* ── Agent Status Strip ───────────────────────────────────────── */}
      {agentStatus && (
        <Link
          href="/agents"
          className="z-10 relative flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-5 py-3 mb-6 transition-colors group"
        >
          <div className="flex items-center gap-2 shrink-0">
            <Bot className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-text-primary">AI Engine</span>
          </div>
          <div className="w-px h-4 bg-white/10 shrink-0" />
          <div className="flex items-center gap-5 flex-1 min-w-0 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              <strong className="text-green-400">{agentStatus.activeCount}</strong> agents active
            </span>
            {agentStatus.warningCount + agentStatus.errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                <strong className="text-red-400">{agentStatus.warningCount + agentStatus.errorCount}</strong> warnings
              </span>
            )}
            {agentStatus.pendingProposals > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                <strong className="text-amber-400">{agentStatus.pendingProposals}</strong> pending proposals
              </span>
            )}
            {agentStatus.criticalInsights > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <strong className="text-amber-400">{agentStatus.criticalInsights}</strong> critical insights
              </span>
            )}
            {agentStatus.isStale && (
              <span className="text-[11px] text-red-400">· Data stale</span>
            )}
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-text-disabled opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
        <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-amber-500/20 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Total Properties</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            <div className="text-3xl font-light text-foreground dark:text-white">{filteredTotalProperties}</div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Active in portfolio
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-emerald-500/20 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-emerald-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Avg Occupancy (30D)</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
              <CalendarCheck className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            <div className="text-3xl font-light text-foreground dark:text-white">{filteredAvgOccupancy}%</div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Across all properties
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group hover:border-violet-500/20 transition-all duration-500">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-violet-500/10 transition-colors" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-widest text-[10px]">Avg Daily Rate</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-muted/50 dark:bg-black/40 border border-border dark:border-white/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-violet-500 dark:text-violet-400" />
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            <div className="text-3xl font-light text-foreground dark:text-white">{filteredAvgPrice} <span className="text-lg font-light text-muted-foreground">AED</span></div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Overall booked rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group border-t-amber-500">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-500/80 uppercase tracking-widest text-[10px]">Projected Revenue</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-500 to-amber-700 dark:from-amber-200 dark:to-amber-500">{filteredTotalRevenue.toLocaleString()} <span className="text-lg font-medium text-amber-500/50">AED</span></div>
            <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Estimated 30-day gross
            </p>
          </CardContent>
        </Card>

        <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden relative group border-t-emerald-500">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 z-10 relative">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-500/80 uppercase tracking-widest text-[10px]">Lifetime Earnings</CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent className="z-10 relative">
            <div className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-emerald-700 dark:from-emerald-200 dark:to-emerald-500">{(totalHistoricalRevenue).toLocaleString()} <span className="text-lg font-medium text-emerald-500/50">AED</span></div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> All-time booked revenue
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-8">
        {/* Top Drivers by Revenue */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Top Drivers by Revenue</CardTitle>
              <CardDescription className="text-muted-foreground">Highest performing properties.</CardDescription>
            </div>
            <Select value={revenueFilter} onValueChange={setRevenueFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#888888" opacity={0.2} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    dy={10}
                    tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                    dx={-10}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#888888', opacity: 0.1 }} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy Rate per Property */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Occupancy Rate by Property</CardTitle>
              <CardDescription className="text-muted-foreground">Highest occupancy rates.</CardDescription>
            </div>
            <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs border-border">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="20">Top 20</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={occupancyData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#888888" opacity={0.2} />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    domain={[0, 100]}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#888888' }}
                    width={100}
                    tickFormatter={(val) => val.length > 12 ? val.substring(0, 12) + '...' : val}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#888888', opacity: 0.1 }} />
                  <Bar dataKey="occupancy" radius={[0, 6, 6, 0]}>
                    {occupancyData.map((entry, index) => (
                      <Cell key={`cell-occ-${index}`} fill={BAR_COLORS[(index + 5) % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue By Property Type */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Revenue By Property Type</CardTitle>
              <CardDescription className="text-muted-foreground">Studio vs 1BR vs 2BR performance.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-0">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-type-${index}`} fill={BAR_COLORS[(index + 3) % BAR_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString()} AED`, 'Revenue']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: '500' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-4 pb-6 mt-[-10px]">
            {typeData.map((entry, index) => (
              <div key={`legend-${index}`} className="flex items-center gap-1.5 min-w-[fit-content]">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: BAR_COLORS[(index + 3) % BAR_COLORS.length] }} />
                <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[120px]">{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Revenue By Channel */}
        <Card className="shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-foreground dark:text-white">Revenue By Channel</CardTitle>
              <CardDescription className="text-muted-foreground">Distribution of booked revenue.</CardDescription>
            </div>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[100px] h-8 text-xs">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Top 3</SelectItem>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center p-0">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || '#f59e0b'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value.toLocaleString()} AED`, 'Revenue']}
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: '500' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
          <div className="flex justify-center gap-4 pb-6 mt-[-10px]">
            {channelData.map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[entry.name] || '#f59e0b' }} />
                <span className="text-xs text-muted-foreground font-medium">{entry.name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col shadow-xl dark:shadow-2xl border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
        <CardHeader className="border-b border-border dark:border-white/10 py-4 bg-muted/20 dark:bg-black/20">
          <CardTitle className="text-foreground dark:text-white">Property Details</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          <ScrollArea className="h-[400px] rounded-b-xl border-t-0 p-4">
            <Table>
              <TableHeader className="bg-muted/50 dark:bg-[#1a1a1c] sticky top-0 z-10 backdrop-blur-sm border-b border-border dark:border-white/10">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Property</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Location</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Target Baseline</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Next 30D Occupancy</TableHead>
                  <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Next 30D Avg Rate</TableHead>
                  <TableHead className="text-right text-muted-foreground text-xs uppercase tracking-wider">Projected Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProperties.sort((a, b) => b.revenue - a.revenue).map((property) => (
                  <TableRow key={property.id} className="hover:bg-muted/50 dark:hover:bg-white/5 transition-colors border-border dark:border-white/5">
                    <TableCell className="font-medium text-foreground dark:text-white">{property.name}</TableCell>
                    <TableCell className="text-muted-foreground">{property.area}</TableCell>
                    <TableCell className="text-muted-foreground">{property.price} AED</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${property.occupancy >= 70 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20' :
                        property.occupancy >= 40 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20' :
                          'bg-rose-500/10 text-rose-600 dark:text-rose-500 border border-rose-500/20'
                        }`}>
                        {property.occupancy}%
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-foreground dark:text-white">{property.avgPrice.toFixed(0)} <span className="text-xs text-muted-foreground">AED</span></TableCell>
                    <TableCell className="text-right font-bold tracking-tight">
                      {property.revenue > 0 ? (
                        <span className="text-amber-600 dark:text-amber-500">{property.revenue.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">{property.revenue.toLocaleString()}</span>
                      )}{" "}
                      <span className="text-xs font-normal text-amber-600/70 dark:text-amber-500/50">AED</span>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProperties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No properties found matching your filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="flex-1 shrink-0 flex flex-col shadow-xl dark:shadow-2xl mt-8 mb-8 border border-border dark:border-white/5 bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl">
        <CardHeader className="border-b border-border dark:border-white/10 py-4 bg-gradient-to-r from-amber-500/5 dark:from-amber-500/10 to-transparent flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-amber-600 dark:text-amber-500 flex items-center gap-2">
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:inline">Start Date</span>
            <Input
              type="month"
              value={format(calendarStartDate, 'yyyy-MM')}
              onChange={(e) => {
                if (e.target.value) {
                  const [year, month] = e.target.value.split('-');
                  setCalendarStartDate(new Date(parseInt(year), parseInt(month) - 1, 1));
                }
              }}
              className="w-auto h-9 bg-background/50 border-border dark:border-white/10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 flex flex-col relative w-full overflow-hidden">
          <div className="w-full overflow-x-auto custom-scrollbar">
            <div className="min-w-[1200px] inline-block align-top pb-4">
              <div className="flex bg-muted/20 dark:bg-muted/10 sticky top-0 z-20 border-b border-border dark:border-white/10 backdrop-blur-md">
                <div className="w-[300px] shrink-0 p-3 font-semibold text-xs text-muted-foreground uppercase border-r border-border dark:border-white/10 sticky left-0 bg-background dark:bg-[#0c0c0e] z-30 shadow-xl">
                  Property Name
                </div>
                <div className="flex flex-1">
                  {next30Days.map((d, i) => (
                    <div key={i} className="flex-1 min-w-[32px] max-w-[40px] border-r border-border dark:border-white/5 p-2 flex flex-col items-center justify-center bg-muted/5 dark:bg-black/20">
                      <span className="text-[10px] text-muted-foreground font-medium">{format(d, 'MMM')}</span>
                      <span className="text-xs font-bold text-foreground">{format(d, 'd')}</span>
                    </div>
                  ))}
                </div>
              </div>

              <TooltipProvider delayDuration={100}>
                <div className="flex flex-col relative z-0">
                  {filteredProperties.sort((a, b) => b.revenue - a.revenue).map((property, idx) => (
                    <div key={property.id} className={`flex border-b border-border dark:border-white/5 transition-colors hover:bg-muted/50 dark:hover:bg-white/5 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/20 dark:bg-black/20'}`}>
                      <div className="w-[300px] shrink-0 p-3 flex flex-col justify-center border-r border-border dark:border-white/10 sticky left-0 bg-background dark:bg-[#0c0c0e] z-10 shadow-xl">
                        <span className="text-sm font-semibold truncate text-foreground dark:text-white">{property.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{property.area}</span>
                      </div>
                      <div className="flex flex-1 relative py-1">
                        {next30Days.map((d, i) => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          const calDay = property.calendarDays?.find(c => c.date === dateStr);

                          // Look for a reservation exactly covering this day to render block
                          const reservation = property.reservations?.find(r => {
                            try {
                              return isWithinInterval(d, { start: parseISO(r.startDate), end: parseISO(r.endDate) });
                            } catch { return false; }
                          });

                          let bgColor = "bg-emerald-500/20 dark:bg-emerald-500/30";
                          let borderColor = "border-emerald-500/30 dark:border-emerald-500/40";

                          if (calDay?.status === 'blocked') {
                            bgColor = "bg-neutral-500/30 dark:bg-neutral-800/80";
                            borderColor = "border-neutral-400 dark:border-neutral-700";
                          } else if (calDay?.status === 'reserved' || calDay?.status === 'booked' || reservation) {
                            bgColor = "bg-rose-500/20 dark:bg-rose-500/30";
                            borderColor = "border-rose-500/50";
                          }

                          // We'll create tooltips for all days
                          return (
                            <div key={i} className="flex-1 min-w-[32px] max-w-[40px] px-0.5 relative flex items-center">
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <div className={`w-full h-8 rounded-md border ${bgColor} ${borderColor} transition-all duration-300 hover:brightness-105 dark:hover:brightness-125 z-0 cursor-pointer`} />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="flex flex-col bg-popover dark:bg-black border border-border dark:border-white/20 p-3 rounded-xl shadow-2xl z-[99999] w-64 backdrop-blur-xl">
                                  {reservation ? (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Confirmed Guest</p>
                                        <p className="text-sm font-bold text-foreground dark:text-white whitespace-nowrap overflow-hidden text-ellipsis">{reservation.title}</p>
                                        {reservation.email && (
                                          <p className="text-[10px] text-muted-foreground truncate">{reservation.email}</p>
                                        )}
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Total Payout:</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{reservation.financials?.hostPayout?.toLocaleString() || reservation.financials?.totalPrice?.toLocaleString() || 'Unknown'} AED</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Channel:</span>
                                        <span className="font-semibold text-foreground dark:text-white capitalize">{reservation.financials?.channelName || reservation.financials?.channel || 'Direct'}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">Dates:</span>
                                        <span className="font-medium text-foreground dark:text-white">{reservation.startDate} - {reservation.endDate}</span>
                                      </div>
                                    </>
                                  ) : calDay?.status === 'blocked' ? (
                                    <div className="text-xs text-center font-bold py-1">Owner Blocked</div>
                                  ) : calDay?.status === 'reserved' || calDay?.status === 'booked' ? (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">{format(d, 'MMM dd, yyyy')}</p>
                                        <p className="text-sm font-bold text-rose-600 dark:text-rose-400 uppercase tracking-tighter">Booked</p>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Guest Details:</span>
                                        <span className="font-medium text-foreground dark:text-white">Hidden / External</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="border-b border-border dark:border-white/10 pb-2 mb-2">
                                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">{format(d, 'MMM dd, yyyy')}</p>
                                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">Available</p>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Current Rate:</span>
                                        <span className="font-bold text-foreground dark:text-white">{calDay?.price?.toLocaleString() || property.price} AED</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-muted-foreground">Min Stay:</span>
                                        <span className="font-semibold text-foreground dark:text-white">{calDay?.minimumStay || 1} Nights</span>
                                      </div>
                                    </>
                                  )}
                                </TooltipContent>
                              </UITooltip>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
