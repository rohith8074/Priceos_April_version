"use client";

import { useState } from "react";
import { format, parseISO, isPast, isToday } from "date-fns";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
    Sparkles, Clock, MapPin, CheckSquare, MessageCircle, AlertCircle
} from "lucide-react";

export type CleaningTask = {
    id: string;
    listingId: string | null;
    propertyName: string;
    startDate: string;
    endDate: string;
    guestDetails: any;
    financials: any;
    type: string;
};

export function OperationsClient({ reservations }: { reservations: CleaningTask[] }) {
    const [tasks, setTasks] = useState<CleaningTask[]>(reservations);
    const [assignedTasks, setAssignedTasks] = useState<Set<string>>(new Set());

    const handleAssignCleaner = (id: string) => {
        setAssignedTasks(prev => new Set(prev).add(id));
        toast.success("SMS checklist dispatched to Cleaning Crew!");
    };

    const getStatus = (dateStr: string, id: string) => {
        if (assignedTasks.has(id)) return { label: "Dispatched", color: "text-emerald-500 border-emerald-500/20 bg-emerald-500/5", icon: CheckSquare };
        const date = parseISO(dateStr);
        if (isPast(date) && !isToday(date)) return { label: "Needs Review", color: "text-rose-500 border-rose-500/20 bg-rose-500/5", icon: AlertCircle };
        if (isToday(date)) return { label: "Clean Today!", color: "text-amber-500 border-amber-500/20 bg-amber-500/5", icon: Sparkles };
        return { label: "Upcoming", color: "text-blue-500 border-blue-500/20 bg-blue-500/5", icon: Clock };
    };

    if (tasks.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-background/40 backdrop-blur-xl border border-dashed border-border rounded-2xl h-full shadow-2xl">
                <div className="h-20 w-20 rounded-full bg-primary/5 flex items-center justify-center mb-6">
                    <Sparkles className="h-10 w-10 text-primary/30" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-foreground">No Upcoming Cleans</h3>
                <p className="text-muted-foreground text-sm max-w-sm text-center leading-relaxed">
                    As new reservations clear through the PMS, cleaning blocks will automatically generate here based on checkout dates.
                </p>
            </div>
        );
    }

    return (
        <Card className="flex flex-col flex-1 overflow-hidden border-none bg-background/40 dark:bg-[#111113]/40 backdrop-blur-2xl shadow-2xl rounded-2xl relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-blue-500/5 pointer-events-none" />

            <div className="flex items-center justify-between p-6 border-b border-border/50 bg-white/5 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">Schedule Overview</span>
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold text-foreground">Operational Queue</h2>
                            <Badge variant="outline" className="font-bold px-3 py-1 bg-primary/10 text-primary border-primary/20 rounded-full text-[10px] uppercase tracking-wider">
                                {tasks.length} Units Pending
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="p-2 rounded-lg bg-background/50 border border-border/50 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live PMS Sync Active
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-transparent z-10 custom-scrollbar">
                <Table>
                    <TableHeader className="sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border/50">
                        <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="py-4 pl-8 uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Property Detail</TableHead>
                            <TableHead className="py-4 uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Target Log Date</TableHead>
                            <TableHead className="py-4 text-center uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Service Window</TableHead>
                            <TableHead className="py-4 text-center uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Budget (AED)</TableHead>
                            <TableHead className="py-4 text-center uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Workflow Status</TableHead>
                            <TableHead className="py-4 text-right pr-8 uppercase tracking-widest text-[10px] font-bold text-muted-foreground/70 italic">Control</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tasks.map((task) => {
                            const status = getStatus(task.endDate, task.id);
                            const StatusIcon = status.icon;
                            return (
                                <TableRow key={task.id} className="group border-b border-border/30 hover:bg-white/5 transition-all duration-300">
                                    <TableCell className="py-5 pl-8">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-muted/40 flex items-center justify-center group-hover:bg-primary/10 transition-colors border border-border/50 overflow-hidden">
                                                <MapPin className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors opacity-60" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">{task.propertyName}</span>
                                                <span className="text-[10px] text-muted-foreground/70 font-medium uppercase tracking-wider">{task.listingId ? `UID-${task.listingId}` : 'ID-PENDING'}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-foreground text-sm">{format(parseISO(task.endDate), "EEEE, MMM dd")}</span>
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter opacity-70">PMS Checkout Event</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5 text-center">
                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/40 border border-border/40">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-bold text-foreground tracking-tight">11 AM - 3 PM</span>
                                            <span className="text-[9px] font-medium text-muted-foreground uppercase opacity-50 underline">4h Loop</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5 text-center">
                                        <div className="flex flex-col items-center">
                                            <span className="text-sm font-black text-foreground tabular-nums tracking-tighter decoration-primary/30 underline-offset-4 pointer-events-none">
                                                {Number(task.financials?.cleaningFee || 150).toLocaleString()}
                                            </span>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">Allocated</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="py-5 text-center">
                                        <Badge variant="outline" className={`font-black text-[9px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-md border shadow-sm ${status.color}`}>
                                            <StatusIcon className="h-3 w-3 mr-1.5" />
                                            {status.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="py-5 text-right pr-8">
                                        {!assignedTasks.has(task.id) ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAssignCleaner(task.id)}
                                                className="h-9 px-4 border-primary/20 hover:bg-primary hover:text-primary-foreground gap-2 rounded-xl transition-all duration-300 shadow-lg shadow-primary/5 active:scale-95 group/btn"
                                            >
                                                <MessageCircle className="h-4 w-4 transform group-hover/btn:rotate-12 transition-transform" />
                                                <span className="text-[11px] font-bold uppercase tracking-wider">Dispatch Agent</span>
                                            </Button>
                                        ) : (
                                            <div className="inline-flex items-center h-9 px-4 rounded-xl text-emerald-500 gap-2 bg-emerald-500/10 border border-emerald-500/20 font-bold text-[11px] uppercase tracking-wider shadow-inner">
                                                <CheckSquare className="h-4 w-4" />
                                                Live Assigned
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
