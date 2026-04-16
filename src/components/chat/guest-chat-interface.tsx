"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Send, Loader2, RefreshCw, User,
    ChevronLeft, ChevronRight, Sparkles, PanelLeftClose, PanelLeftOpen,
    MessageSquare, Building2, CloudDownload, Zap
} from "lucide-react";
import { useContextStore } from "@/stores/context-store";
import { toast } from "sonner";

interface Message {
    id: string;
    sender: 'guest' | 'admin';
    text: string;
    time: string;
}

interface SimulatedConversation {
    id: string;
    guestName: string;
    lastMessage: string;
    status: 'needs_reply' | 'resolved';
    messages: Message[];
}

export function GuestChatInterface({
    initialPropertyId = null,
    initialPropertyName = null,
    initialPropertyCurrency = "AED",
    initialConversationId = null,
}: {
    initialPropertyId?: string | null;
    initialPropertyName?: string | null;
    initialPropertyCurrency?: string;
    initialConversationId?: string | null;
}) {
    const searchParams = useSearchParams();
    const {
        contextType,
        propertyId,
        propertyName,
        setConversationSummary,
        conversationSummary,
        setPropertyContext,
    } = useContextStore();

    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const [conversations, setConversations] = useState<SimulatedConversation[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);
    const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncingHostaway, setIsSyncingHostaway] = useState(false);
    const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
    const [highlightConversationId, setHighlightConversationId] = useState<string | null>(initialConversationId);
    const autoRepliedIds = useRef<Set<string>>(new Set());
    const requestedConversationIdRef = useRef<string | null>(initialConversationId);

    useEffect(() => {
        const propertyFromQuery = searchParams.get("propertyId") || initialPropertyId;
        if (!propertyFromQuery) return;
        if (propertyId === propertyFromQuery && contextType === "property") return;
        setPropertyContext(
            propertyFromQuery,
            initialPropertyName || propertyName || "Selected Property",
            initialPropertyCurrency
        );
    }, [
        contextType,
        initialPropertyCurrency,
        initialPropertyId,
        initialPropertyName,
        propertyId,
        propertyName,
        searchParams,
        setPropertyContext,
    ]);

    const syncFromHostaway = async () => {
        if (!propertyId) return;
        setIsSyncingHostaway(true);
        toast.loading("Syncing conversations from Hostaway...", { id: "sync_hostaway" });
        try {
            const res = await fetch(`/api/hostaway/conversations?listingId=${propertyId}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to sync from Hostaway");
            const syncedConversations = data.conversations || [];
            setConversations(syncedConversations);
            setActiveConversationId((prev) =>
                prev && syncedConversations.some((c: SimulatedConversation) => c.id === prev)
                    ? prev
                    : syncedConversations[0]?.id || null
            );
            toast.success(`Synced ${syncedConversations.length} threads from Hostaway`, { id: "sync_hostaway" });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to sync conversations", { id: "sync_hostaway" });
        } finally {
            setIsSyncingHostaway(false);
        }
    };

    const fetchConversations = async (showLoadingToast = false) => {
        if (!propertyId) return;
        setIsLoading(true);

        if (showLoadingToast) toast.loading("Fetching conversations...", { id: "fetch_conv" });

        try {
            // 1) Load cached conversations
            const convRes = await fetch(`/api/hostaway/conversations/cached?listingId=${propertyId}`);
            if (convRes.ok) {
                const convData = await convRes.json();
                const cachedConversations = convData.conversations || [];
                setConversations(cachedConversations);
                const requestedConversationId = searchParams.get("conversationId") || requestedConversationIdRef.current;
                if (requestedConversationId && cachedConversations.some((c: SimulatedConversation) => c.id === requestedConversationId)) {
                    setActiveConversationId(requestedConversationId);
                    requestedConversationIdRef.current = requestedConversationId;
                }

                // 2) If cache is empty, sync from Hostaway live API for this property
                if (cachedConversations.length === 0) {
                    const liveRes = await fetch(`/api/hostaway/conversations?listingId=${propertyId}`);
                    if (liveRes.ok) {
                        const liveData = await liveRes.json();
                        const syncedConversations = liveData.conversations || [];
                        setConversations(syncedConversations);
                        const requestedConversationId = searchParams.get("conversationId") || requestedConversationIdRef.current;
                        if (requestedConversationId && syncedConversations.some((c: SimulatedConversation) => c.id === requestedConversationId)) {
                            setActiveConversationId(requestedConversationId);
                            requestedConversationIdRef.current = requestedConversationId;
                        }
                        if (showLoadingToast) {
                            toast.success(`Synced ${syncedConversations.length} threads from Hostaway`, { id: "fetch_conv" });
                        }
                    } else if (showLoadingToast) {
                        toast.error("Failed to sync conversations from Hostaway", { id: "fetch_conv" });
                    }
                } else if (showLoadingToast) {
                    toast.success(`Loaded ${cachedConversations.length} active threads`, { id: "fetch_conv" });
                }
            }

            // Load cached summary
            const sumRes = await fetch(`/api/hostaway/summary?listingId=${propertyId}`);
            if (sumRes.ok) {
                const sumData = await sumRes.json();
                if (sumData.summary) setConversationSummary(sumData.summary);
            }
        } catch (e) {
            console.warn("Failed to load cached conversations", e);
            if (showLoadingToast) toast.error("Failed to load conversations", { id: "fetch_conv" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setConversations([]);
        setActiveConversationId(null);
        setConversationSummary(null);
        setReplyText("");
        fetchConversations();
    }, [propertyId, searchParams]);

    useEffect(() => {
        const shouldHighlight = searchParams.get("highlight") === "1";
        const requestedConversationId = searchParams.get("conversationId") || initialConversationId;
        if (!shouldHighlight || !requestedConversationId) return;
        setHighlightConversationId(requestedConversationId);
        const timeout = window.setTimeout(() => setHighlightConversationId(null), 3500);
        return () => window.clearTimeout(timeout);
    }, [initialConversationId, searchParams]);

    const generateAiReply = async (conversation: SimulatedConversation): Promise<string | null> => {
        const res = await fetch("/api/hostaway/suggest-reply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: conversation.messages,
                guestName: conversation.guestName,
                propertyName: propertyName || "Our Property",
            })
        });
        const data = await res.json();
        if (res.ok && data.reply) return data.reply;
        return null;
    };

    const handleAiSuggest = async () => {
        if (!activeConversationId) return;
        const conversation = conversations.find(c => c.id === activeConversationId);
        if (!conversation) return;

        setIsSuggesting(true);
        toast.loading("Agent is reading the full conversation...", { id: 'suggest' });
        try {
            const reply = await generateAiReply(conversation);
            setReplyText(reply || `Hey ${conversation.guestName}, thanks for reaching out! I'll look into this and get back to you shortly.`);
            toast.success("Reply generated by Agent", { id: 'suggest' });
        } catch {
            toast.error("Failed to get Agent suggestion", { id: 'suggest' });
        } finally {
            setIsSuggesting(false);
        }
    };

    // Auto-reply: when enabled, auto-generate + send a reply for any conversation
    // that needs a reply and hasn't been auto-replied yet in this session.
    useEffect(() => {
        if (!autoReplyEnabled || !activeConversationId) return;
        const conversation = conversations.find(c => c.id === activeConversationId);
        if (!conversation || conversation.status !== 'needs_reply') return;
        if (autoRepliedIds.current.has(activeConversationId)) return;

        autoRepliedIds.current.add(activeConversationId);

        (async () => {
            toast.loading(`Auto-replying to ${conversation.guestName}...`, { id: `auto-${activeConversationId}` });
            try {
                const reply = await generateAiReply(conversation);
                if (!reply) throw new Error("No reply generated");

                const res = await fetch("/api/hostaway/reply", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ conversationId: activeConversationId, text: reply })
                });
                if (!res.ok) throw new Error("Failed to save reply");

                setConversations(prev => prev.map(conv =>
                    conv.id === activeConversationId
                        ? { ...conv, status: 'resolved' as const, lastMessage: reply, messages: [...conv.messages, { id: Date.now().toString(), sender: 'admin' as const, text: reply, time: "Just now" }] }
                        : conv
                ));
                toast.success(`Auto-replied to ${conversation.guestName}`, { id: `auto-${activeConversationId}` });
            } catch {
                autoRepliedIds.current.delete(activeConversationId);
                toast.error(`Auto-reply failed for ${conversation.guestName}`, { id: `auto-${activeConversationId}` });
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoReplyEnabled, activeConversationId]);

    const handleSendReply = async () => {
        if (!replyText.trim() || !activeConversationId) return;
        const textToSave = replyText;
        const convId = activeConversationId;
        setReplyText("");

        try {
            const res = await fetch("/api/hostaway/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversationId: convId, text: textToSave })
            });

            if (!res.ok) throw new Error("Failed to save to DB");

            setConversations(prev => prev.map(conv => {
                if (conv.id === convId) {
                    return {
                        ...conv,
                        status: 'resolved' as const,
                        lastMessage: textToSave,
                        messages: [
                            ...conv.messages,
                            { id: Date.now().toString(), sender: 'admin' as const, text: textToSave, time: "Just now" }
                        ]
                    };
                }
                return conv;
            }));

            toast.success("Reply securely saved to shadow database", { id: 'reply' });
        } catch (error) {
            setReplyText(textToSave);
            toast.error("Failed to save shadow reply", { id: 'reply' });
        }
    };

    const activeConversation = conversations.find(c => c.id === activeConversationId);
    const structuredSummary =
        conversationSummary && typeof conversationSummary === "object"
            ? (conversationSummary as {
                  sentiment?: string;
                  themes?: string[];
                  actionItems?: string[];
                  bulletPoints?: string[];
                  totalConversations?: number;
                  needsReplyCount?: number;
              })
            : null;

    if (contextType === "portfolio") {
        return (
            <div className="flex flex-col flex-1 items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/5">
                <Building2 className="h-16 w-16 mb-6 opacity-10" />
                <h3 className="text-xl font-bold text-foreground">Select a Property</h3>
                <p className="mt-2 text-sm max-w-sm">
                    Please select a property from the sidebar to view guest conversations and use the AI Inbox Analyst.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden h-full">
            {/* Standard Header */}
            <div className="border-b bg-background flex flex-col shrink-0 relative z-10 shadow-sm">
                <div className="flex flex-wrap items-center justify-between px-6 py-4 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-500/10 p-2">
                            <MessageSquare className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black tracking-tight">
                                Guest Inbox
                            </h3>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                {propertyName || "Property Communications"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Auto-Reply Toggle */}
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${autoReplyEnabled ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-muted/30 border-border/50'}`}>
                            <Zap className={`h-3.5 w-3.5 transition-colors ${autoReplyEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                            <span className={`text-xs font-bold tracking-wide hidden sm:inline transition-colors ${autoReplyEnabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                {autoReplyEnabled ? 'Auto-Reply ON' : 'Auto-Reply'}
                            </span>
                            <Switch
                                checked={autoReplyEnabled}
                                onCheckedChange={(v) => {
                                    setAutoReplyEnabled(v);
                                    if (v) {
                                        autoRepliedIds.current.clear();
                                        toast.success("Auto-Reply enabled — AI will reply to new messages automatically", { duration: 3000 });
                                    } else {
                                        toast.info("Auto-Reply disabled");
                                    }
                                }}
                                className="h-4 w-8 data-[state=checked]:bg-emerald-500"
                            />
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                                if (!propertyId) return;
                                setIsGeneratingSummary(true);
                                try {
                                    toast.loading("AI is generating summary...", { id: 'summary' });
                                    const res = await fetch(`/api/hostaway/summary`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ listingId: propertyId })
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        setConversationSummary(data.summary);
                                        toast.success("Summary generated & saved!", { id: 'summary' });
                                    } else {
                                        throw new Error("Failed");
                                    }
                                } catch (e) {
                                    toast.error("Failed to generate summary", { id: 'summary' });
                                } finally {
                                    setIsGeneratingSummary(false);
                                }
                            }}
                            disabled={isGeneratingSummary || conversations.length === 0}
                            className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm text-violet-600 border-violet-500/30"
                        >
                            {isGeneratingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            <span className="hidden sm:inline">{isGeneratingSummary ? 'Generating...' : 'Generate Summary'}</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden min-w-0">
                {/* Guest Inbox Sidebar — collapsible */}
                <div className={`border-r bg-muted/10 flex flex-col border-border/50 transition-all duration-200 shrink-0 ${isInboxCollapsed ? 'w-0 overflow-hidden border-r-0' : activeConversationId ? 'hidden md:flex w-[320px] lg:w-[360px]' : 'flex w-[320px] lg:w-[360px]'}`}>
                    <div className="p-4 border-b bg-background border-border/50 flex items-center justify-between">
                        <h3 className="font-black uppercase tracking-widest text-xs text-muted-foreground">Guest Inbox</h3>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] gap-1"
                                onClick={syncFromHostaway}
                                disabled={isSyncingHostaway || !propertyId}
                            >
                                {isSyncingHostaway ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <CloudDownload className="h-3 w-3" />
                                )}
                                Hostaway
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => fetchConversations(true)}
                                disabled={isLoading || !propertyId}
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => setIsInboxCollapsed(true)}
                            >
                                <PanelLeftClose className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {conversations.map(conv => (
                            <button
                                key={conv.id}
                                onClick={() => {
                                    setActiveConversationId(conv.id);
                                    setHighlightConversationId(conv.id);
                                }}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${
                                    highlightConversationId === conv.id
                                        ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                                        : activeConversationId === conv.id
                                            ? 'bg-primary/5 border-primary/30'
                                            : 'bg-background hover:bg-muted/50 border-border/50 hover:border-border'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold truncate">{conv.guestName}</span>
                                            {conv.status === 'needs_reply' && <div className="h-2 w-2 rounded-full bg-amber-500" />}
                                        </div>
                                        <span className="text-xs text-muted-foreground truncate font-medium mt-0.5">{conv.lastMessage}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                        {conversations.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <User className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-medium">No conversations</p>
                                <p className="text-[10px] mt-1 text-center px-4">No cached conversation threads yet.<br />Sync from Dashboard if needed.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Expand button when inbox is collapsed */}
                {isInboxCollapsed && (
                    <div className="flex flex-col items-center py-3 px-1 border-r border-border/50 bg-muted/10">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full hover:bg-muted"
                            onClick={() => setIsInboxCollapsed(false)}
                        >
                            <PanelLeftOpen className="h-3.5 w-3.5 text-slate-400" />
                        </Button>
                    </div>
                )}

                <div className={`flex-1 min-w-0 flex flex-col bg-background relative ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
                    {activeConversation ? (
                        <>
                            <div className="flex items-center p-4 border-b border-border/50 bg-background shadow-sm z-10">
                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 -ml-2 rounded-full hover:bg-muted md:hidden"
                                        onClick={() => setActiveConversationId(null)}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold leading-none">{activeConversation.guestName}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1">Hostaway Guest</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`flex-1 min-w-0 overflow-y-auto p-4 md:p-6 space-y-4 transition-colors ${
                                highlightConversationId === activeConversationId ? 'bg-amber-500/5' : ''
                            }`}>
                                {activeConversation.messages.map((msg) => (
                                    <div key={msg.id} className={`flex flex-col max-w-[92%] md:max-w-[85%] ${msg.sender === 'admin' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                                        <div className={`px-4 py-2.5 rounded-2xl overflow-hidden ${msg.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted border border-border/50 rounded-bl-sm'}`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-all">{msg.text}</p>
                                        </div>
                                        <span className="text-[9px] font-bold text-muted-foreground mt-1 px-1 tracking-wider uppercase">{msg.time}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-background border-t border-border/50 shrink-0 relative z-10">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1 flex items-center">
                                        <input
                                            type="text"
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(); }}
                                            placeholder={`Reply to ${activeConversation.guestName}...`}
                                            className="w-full bg-muted/50 border border-border/50 rounded-full pl-4 pr-10 h-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium placeholder:font-normal"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleAiSuggest}
                                            disabled={isSuggesting}
                                            className={`absolute right-1.5 h-7 w-7 rounded-full transition-all ${isSuggesting ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-50'}`}
                                        >
                                            {isSuggesting ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Sparkles className="h-3.5 w-3.5" />
                                            )}
                                        </Button>
                                    </div>
                                    <Button
                                        size="icon"
                                        onClick={handleSendReply}
                                        disabled={!replyText.trim()}
                                        className="h-10 w-10 rounded-full shrink-0 shadow-md"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-[9px] text-center text-muted-foreground/50 mt-2 font-bold uppercase tracking-widest">
                                    Sending securely via shadow database
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <User className="h-12 w-12 mb-4 opacity-10" />
                            <p className="text-sm font-medium">No conversation selected</p>
                            <p className="text-xs mt-1">Select a guest from the list to view or reply.</p>
                        </div>
                    )}
                </div>

                {/* Right Sidebar Summary Panel */}
                <div
                    className={`hidden 2xl:flex border-l border-border/50 bg-muted/10 transition-all duration-200 shrink-0 ${
                        isSummaryCollapsed ? "w-12 p-2" : "w-[300px] p-3"
                    }`}
                >
                    {isSummaryCollapsed ? (
                        <div className="flex w-full flex-col items-center pt-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-muted"
                                onClick={() => setIsSummaryCollapsed(false)}
                            >
                                <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
                            </Button>
                        </div>
                    ) : (
                        <div className="w-full min-w-0 rounded-2xl border border-border/50 bg-background shadow-sm p-4 space-y-3 h-fit overflow-hidden">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">
                                    Conversation Summary
                                </h4>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-muted shrink-0"
                                    onClick={() => setIsSummaryCollapsed(true)}
                                >
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                </Button>
                            </div>

                            {activeConversation ? (
                                <>
                                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                                            {activeConversation.guestName}
                                        </p>
                                        <p className="text-[11px] text-foreground/90 line-clamp-4 break-words">
                                            {activeConversation.lastMessage || "No message preview available."}
                                        </p>
                                    </div>

                                    {structuredSummary ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground">Sentiment</p>
                                                    <p className="text-[11px] font-semibold mt-1">{structuredSummary.sentiment || "—"}</p>
                                                </div>
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground">Needs Reply</p>
                                                    <p className="text-[11px] font-semibold mt-1">{structuredSummary.needsReplyCount ?? 0}</p>
                                                </div>
                                            </div>
                                            {!!structuredSummary.themes?.length && (
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground mb-1">Themes</p>
                                                    <p className="text-[11px] text-foreground/90 line-clamp-3 break-words">
                                                        {structuredSummary.themes.join(", ")}
                                                    </p>
                                                </div>
                                            )}
                                            {!!structuredSummary.actionItems?.length && (
                                                <div className="rounded-lg border border-border/50 p-2">
                                                    <p className="text-[9px] uppercase text-muted-foreground mb-1">Action Items</p>
                                                    <p className="text-[11px] text-foreground/90 line-clamp-4 break-words">
                                                        {structuredSummary.actionItems.join(" • ")}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">
                                    Select a conversation to view its summary.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
