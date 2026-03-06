"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Send, Loader2, Settings, Zap, Calendar as CalendarIcon,
  PanelRightClose, PanelRightOpen, Building2, CheckSquare, AlertCircle,
  User, ChevronLeft, Sparkles, PanelLeftClose, PanelLeftOpen, RefreshCw
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom markdown renderer — handles tables, headings, lists, code without @tailwindcss/typography
function MarkdownMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const mutedText = isUser ? "text-primary-foreground/70" : "text-muted-foreground";
  const baseText = isUser ? "text-primary-foreground" : "text-foreground/90";

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/40">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50 text-muted-foreground uppercase tracking-wider text-[10px]">{children}</thead>
        ),
        tbody: ({ children }) => <tbody className="divide-y divide-border/30">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-muted/20 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-black whitespace-nowrap">{children}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 whitespace-nowrap">{children}</td>,
        // Headings
        h1: ({ children }) => <h1 className={`text-base font-black mt-3 mb-1 ${baseText}`}>{children}</h1>,
        h2: ({ children }) => <h2 className={`text-sm font-black mt-3 mb-1 ${baseText}`}>{children}</h2>,
        h3: ({ children }) => <h3 className={`text-xs font-black uppercase tracking-wider mt-3 mb-1 ${mutedText}`}>{children}</h3>,
        // Inline
        strong: ({ children }) => <strong className={`font-black ${baseText}`}>{children}</strong>,
        em: ({ children }) => <em className="italic opacity-80">{children}</em>,
        // Paragraphs & lists
        p: ({ children }) => <p className={`text-sm leading-relaxed mb-2 last:mb-0 ${baseText}`}>{children}</p>,
        ul: ({ children }) => <ul className={`list-disc pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ul>,
        ol: ({ children }) => <ol className={`list-decimal pl-4 mb-2 space-y-0.5 text-sm ${baseText}`}>{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Code
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <pre className="bg-muted/40 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono border border-border/30"><code>{children}</code></pre>
            : <code className="bg-muted/40 px-1.5 py-0.5 rounded text-[11px] font-mono border border-border/20">{children}</code>;
        },
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 border-primary/40 pl-3 my-2 ${mutedText} italic text-sm`}>{children}</blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="border-border/30 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

import { useContextStore } from "@/stores/context-store";
import type { ListingRow } from "@/lib/db";
import { DateRangePicker } from "./date-range-picker";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PriceGuardrailsEditor } from "./price-guardrails-editor";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposals?: any[];
  proposalStatus?: "pending" | "saved" | "rejected";
}

interface PropertyWithMetrics extends ListingRow {
  occupancy?: number;
  avgPrice?: number | string;
}

interface Props {
  properties: PropertyWithMetrics[];
}

interface SimulatedConversation {
  id: string;
  guestName: string;
  lastMessage: string;
  status: 'needs_reply' | 'resolved';
  messages: { id: string; sender: 'guest' | 'admin'; text: string; time: string }[];
}

const mockConversations: SimulatedConversation[] = [
  {
    id: "conv_1",
    guestName: "John Doe",
    lastMessage: "Is the pool heated during March?",
    status: "needs_reply",
    messages: [
      { id: "m1", sender: "guest", text: "Hi, I have a quick question before booking.", time: "10:00 AM" },
      { id: "m2", sender: "admin", text: "Hello John, absolutely! How can I help?", time: "10:15 AM" },
      { id: "m3", sender: "guest", text: "Is the pool heated during March?", time: "10:20 AM" }
    ]
  },
  {
    id: "conv_2",
    guestName: "Sarah Smith",
    lastMessage: "Thank you for the parking instructions!",
    status: "resolved",
    messages: [
      { id: "m1", sender: "guest", text: "Where exactly is the parking spot?", time: "Yesterday" },
      { id: "m2", sender: "admin", text: "It is spot #42 in the underground garage.", time: "Yesterday" },
      { id: "m3", sender: "guest", text: "Thank you for the parking instructions!", time: "Yesterday" }
    ]
  }
];

export function UnifiedChatInterface({ properties }: Props) {
  const {
    contextType,
    propertyId,
    propertyName,
    isSidebarOpen,
    toggleSidebar,
    dateRange,
    setDateRange,
    triggerMarketRefresh,
    setSidebarTab,
    setCalendarMetrics: setGlobalMetrics,
    conversationSummary,
    setConversationSummary,
  } = useContextStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate a unique session ID
  const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Session is keyed to property + date range so each Market Analysis run gets an isolated chat
  const buildSessionId = (pid: number | undefined, from: string, to: string) =>
    pid ? `property-${pid}-${from}-${to}` : generateSessionId();

  const [sessionId, setSessionId] = useState<string>(() =>
    buildSessionId(
      propertyId || undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    )
  );
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Price guardrails — local state so UI updates immediately after save
  const activeListing = properties.find(p => p.id === propertyId);
  const [priceFloor, setPriceFloor] = useState<number>(Number(activeListing?.priceFloor || 0));
  const [priceCeiling, setPriceCeiling] = useState<number>(Number(activeListing?.priceCeiling || 0));
  const [guardrailsSource, setGuardrailsSource] = useState<string | undefined>(activeListing?.guardrailsSource || undefined);
  const [floorReasoning, setFloorReasoning] = useState<string | null | undefined>(activeListing?.floorReasoning);
  const [ceilingReasoning, setCeilingReasoning] = useState<string | null | undefined>(activeListing?.ceilingReasoning);

  // Keep guardrails in sync when property changes
  useEffect(() => {
    setPriceFloor(Number(activeListing?.priceFloor || 0));
    setPriceCeiling(Number(activeListing?.priceCeiling || 0));
    setGuardrailsSource(activeListing?.guardrailsSource || undefined);
    setFloorReasoning(activeListing?.floorReasoning);
    setCeilingReasoning(activeListing?.ceilingReasoning);
  }, [propertyId, activeListing]);

  // Agent vs Guest Chat Toggle
  const [chatMode, setChatMode] = useState<"agent" | "guests">("agent");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [conversations, setConversations] = useState<SimulatedConversation[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isInboxCollapsed, setIsInboxCollapsed] = useState(false);

  const fetchConversations = async (showLoadingToast = false) => {
    if (!propertyId || !dateRange?.from || !dateRange?.to) return;

    if (showLoadingToast) toast.loading("Fetching conversations...", { id: "fetch_conv" });

    const from = format(dateRange.from, 'yyyy-MM-dd');
    const to = format(dateRange.to, 'yyyy-MM-dd');

    try {
      // Load cached conversations
      const convRes = await fetch(`/api/hostaway/conversations/cached?listingId=${propertyId}&from=${from}&to=${to}`);
      if (convRes.ok) {
        const convData = await convRes.json();
        setConversations(convData.conversations || []);
        if (showLoadingToast) toast.success(`Loaded ${convData.conversations?.length || 0} active threads`, { id: "fetch_conv" });
      }

      // Load cached summary
      const sumRes = await fetch(`/api/hostaway/summary?listingId=${propertyId}&from=${from}&to=${to}`);
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.summary) setConversationSummary(sumData.summary);
      }
    } catch (e) {
      console.warn("Failed to load cached conversations", e);
      if (showLoadingToast) toast.error("Failed to load conversations", { id: "fetch_conv" });
    }
  };

  // Reset and load cached conversations when property or date range changes
  useEffect(() => {
    // Reset state when property changes
    setConversations([]);
    setActiveConversationId(null);
    setConversationSummary(null);
    setReplyText("");

    fetchConversations();
  }, [propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  const handleAiSuggest = async () => {
    if (!activeConversationId) return;
    const conversation = conversations.find(c => c.id === activeConversationId);
    if (!conversation) return;

    setIsSuggesting(true);
    try {
      // We use the last message from the guest as the query
      const lastGuestMessage = [...conversation.messages].reverse().find(m => m.sender === 'guest')?.text || "";

      toast.loading("Agent is thinking of a reply...", { id: 'suggest' });

      const res = await fetch("/api/hostaway/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: lastGuestMessage,
          guestName: conversation.guestName,
          propertyName: propertyName || "Our Property",
        })
      });

      const data = await res.json();
      let suggestedText = "";

      if (res.ok && data.reply) {
        suggestedText = data.reply;
      } else {
        // Fallback if endpoint fails
        await new Promise(r => setTimeout(r, 1500));
        suggestedText = `Hi ${conversation.guestName}, thanks for reaching out! I'd be happy to help with that.`;
      }

      setReplyText(suggestedText);
      toast.success("Response generated by Agent", { id: 'suggest' });
    } catch (e) {
      toast.error("Failed to get Agent suggestion", { id: 'suggest' });
    } finally {
      setIsSuggesting(false);
    }
  };

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

  // Dynamic calendar metrics (occupancy + avg price for selected date range)
  const [calendarMetrics, setCalendarMetrics] = useState<any | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // 1. Session Initialization & Hydration
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Build the expected session ID for this property + date range combo
    const expectedSessionId = buildSessionId(
      contextType === "property" && propertyId ? propertyId : undefined,
      dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "start",
      dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : "end"
    );

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const propParam = contextType === "property" && propertyId ? propertyId : "null";
        const res = await fetch(`/api/chat/history?propertyId=${propParam}&sessionId=${encodeURIComponent(expectedSessionId)}`);

        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
            setIsChatActive(true);
            setSessionId(expectedSessionId);
          } else {
            setMessages([]);
            setIsChatActive(false);
            setSessionId(expectedSessionId);
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history", err);
        setSessionId(expectedSessionId);
        setMessages([]);
        setIsChatActive(false);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [contextType, propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  // Fetch calendar metrics when date range or property changes
  useEffect(() => {
    const fetchMetrics = async () => {
      if (contextType !== "property" || !propertyId || !dateRange?.from || !dateRange?.to) {
        setCalendarMetrics(null);
        setGlobalMetrics(null);
        return;
      }

      setIsLoadingMetrics(true);
      try {
        const from = format(dateRange.from, "yyyy-MM-dd");
        const to = format(dateRange.to, "yyyy-MM-dd");
        const res = await fetch(`/api/calendar-metrics?listingId=${propertyId}&from=${from}&to=${to}`);

        if (res.ok) {
          const data = await res.json();
          const metrics = {
            occupancy: data.occupancy,
            avgPrice: data.avgPrice,
            bookedDays: data.bookedDays,
            availableDays: data.availableDays,
            blockedDays: data.blockedDays,
            totalDays: data.totalDays,
            calendarDays: data.calendarDays,
            reservations: data.reservations,
          };
          setCalendarMetrics(metrics);
          setGlobalMetrics(metrics);
        }
      } catch (err) {
        console.error("Failed to fetch calendar metrics:", err);
      } finally {
        setIsLoadingMetrics(false);
      }
    };

    fetchMetrics();
  }, [contextType, propertyId, dateRange?.from?.getTime(), dateRange?.to?.getTime(), setGlobalMetrics]);

  const guardrailsNotSet = !priceFloor && !priceCeiling;

  const handleMarketSetup = async () => {
    if (isSettingUp || !dateRange?.from || !dateRange?.to) return;

    // Guardrails are no longer a blocker — Agent 10 will set them if they are 0!

    setIsSettingUp(true);
    useContextStore.getState().setIsMarketAnalysisRunning(true);

    toast("Initializing Aria...", {
      description: "Setting up research agents for your location...",
    });

    try {
      // Simulate multiple toast stages for better UX since it takes a few seconds
      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Searching Internet...", {
            description: "Scanning for global events, holidays, and competitor rates...",
          });
        }
      }, 3000);

      setTimeout(() => {
        if (useContextStore.getState().isMarketAnalysisRunning) {
          toast("Benchmarking...", {
            description: "Calculating market percentiles and price positioning...",
          });
        }
      }, 7000);

      const response = await fetch("/api/market-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRange: {
            from: format(dateRange.from, "yyyy-MM-dd"),
            to: format(dateRange.to, "yyyy-MM-dd"),
          },
          context: {
            type: contextType,
            propertyId,
            propertyName,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes("403") || data.error?.includes("permission")) {
          throw new Error("Lyzr Permission Error: Your API key doesn't have permission to access this Agent.");
        }
        throw new Error(data.error || "Analysis failed");
      }

      // ── New session per date range: clear chat history and generate a fresh session ID ──
      const newFrom = format(dateRange.from, "yyyy-MM-dd");
      const newTo = format(dateRange.to, "yyyy-MM-dd");
      const newSessionId = buildSessionId(propertyId || undefined, newFrom, newTo);

      setMessages([]);          // clear chat history for this new session
      setSessionId(newSessionId); // isolate Lyzr conversation
      setIsChatActive(true);

      console.log("🔍 Market Analysis Data Received:", {
        eventsCount: data.eventsCount,
        hasTrace: !!data.sqlTrace,
        traceLength: data.sqlTrace?.length
      });

      // ── TECHNICAL PIPELINE TRACE ──
      // Log to console for debugging, don't clutter the chat UI
      if (data.sqlTrace && data.sqlTrace.length > 0) {
        console.log(`🛠️ [Data Pipeline] ${data.sqlTrace.length} queries executed:`);
        data.sqlTrace.forEach((t: any) => console.log(`  → ${t.name}: ${t.sql.substring(0, 80)}...`));
      }

      // Start with a clean chat — no trace messages
      setMessages([]);

      toast.success("Aria is Ready", {
        description: `Analyzed ${data.eventsCount} market signals in ${data.duration}. Ask me anything!`,
      });

      if (data.guardrailsSetByAi && data.guardrails) {
        setPriceFloor(data.guardrails.floor);
        setPriceCeiling(data.guardrails.ceiling);
        setGuardrailsSource(data.guardrails.source);
        setFloorReasoning(data.guardrails.floorReasoning);
        setCeilingReasoning(data.guardrails.ceilingReasoning);

        // Wait a slight moment so they don't overlap too intensely
        setTimeout(() => {
          toast.info("Auto-Guardrails Configured", {
            description: "Aria has set the floor and ceiling values automatically based on market intelligence. Check them; if you want, you can overwrite them too.",
            duration: 8000, // Longer duration for reading
          });
        }, 800);
      }

      triggerMarketRefresh();
      // Data injection now happens automatically on the user's first real message
      // in route.ts — no need for a separate grounding call.


    } catch (error) {
      console.error("Market Analysis Error:", error);
      toast.error("Analysis Failed", {
        description: error instanceof Error ? error.message : "Marketing Agent could not be reached.",
      });
    } finally {
      setIsSettingUp(false);
      useContextStore.getState().setIsMarketAnalysisRunning(false);
    }
  };

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const startTime = performance.now();
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          context: {
            type: contextType,
            propertyId: contextType === "property" ? propertyId : undefined,
            propertyName: contextType === "property" ? propertyName : undefined,
            metrics: calendarMetrics ? {
              occupancy: calendarMetrics.occupancy,
              bookedDays: calendarMetrics.bookedDays,
              availableDays: calendarMetrics.availableDays,
              blockedDays: calendarMetrics.blockedDays,
              totalDays: calendarMetrics.totalDays,
              bookableDays: calendarMetrics.totalDays - calendarMetrics.blockedDays,
              avgPrice: calendarMetrics.avgPrice,
            } : undefined
          },
          dateRange: dateRange ? {
            from: format(dateRange.from!, "yyyy-MM-dd"),
            to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange.from!, "yyyy-MM-dd"),
          } : undefined,
          isChatActive,
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || "Sorry, I couldn't get a response.",
        proposals: data.proposals || undefined,
        proposalStatus: data.proposals ? "pending" : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error(`Chat Error:`, error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error connecting to the agent. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProposals = (messageId: string, proposals: any[]) => {
    // ── OPTIMISTIC: flip UI to "saved" immediately, don't wait for API ──
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, proposalStatus: "saved" } : msg
      )
    );
    toast.success(`Deploying ${proposals.length} price updates…`, {
      description: "Saved to Control Panel. Pricing page updated.",
    });

    // ── BACKGROUND: fire-and-forget the actual DB write ──
    const payload = JSON.stringify({
      proposals,
      dateRange: dateRange ? {
        from: format(dateRange.from!, "yyyy-MM-dd"),
        to: dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : format(dateRange.from!, "yyyy-MM-dd"),
      } : undefined,
    });

    fetch("/api/proposals/bulk-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        console.log(`✅ Deployed ${data.savedCount} proposals to Pricing`);
      })
      .catch((err) => {
        console.error("Proposal deploy error:", err);
        // Revert UI on failure
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, proposalStatus: "pending" } : msg
          )
        );
        toast.error("Deploy failed — please try again.");
      });
  };

  const handleRejectProposals = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, proposalStatus: "rejected" } : msg
      )
    );
    toast.info("Price proposals rejected. No changes were made.");
  };

  if (contextType === "portfolio") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center h-full text-muted-foreground p-8 text-center bg-muted/5">
        <Building2 className="h-16 w-16 mb-6 opacity-10" />
        <h3 className="text-xl font-bold text-foreground">Select a Property</h3>
        <p className="mt-2 text-sm max-w-sm">
          Please select a property from the sidebar to view metrics, market signals, and chat with the AI Pricing Analyst.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden h-full">
      <div className="border-b bg-background flex flex-col shrink-0 relative z-10 shadow-sm">
        <div className="flex flex-wrap items-center justify-between px-6 py-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">
                {contextType === "property" && propertyName ? propertyName : "Portfolio Overview"}
              </h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Pricing & Market Copilot
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Price Guardrails Editor — shown when a property is selected */}
            {contextType === "property" && propertyId && (
              <div id="tour-guardrails">
                <PriceGuardrailsEditor
                  listingId={propertyId}
                  initialFloor={priceFloor}
                  initialCeiling={priceCeiling}
                  guardrailsSource={guardrailsSource}
                  floorReasoning={floorReasoning}
                  ceilingReasoning={ceilingReasoning}
                  currencyCode={activeListing?.currencyCode || "AED"}
                  highlightIfZero
                  onSaved={(floor, ceiling) => {
                    setPriceFloor(floor);
                    setPriceCeiling(ceiling);
                    setGuardrailsSource("manual");
                  }}
                />
              </div>
            )}
            <Button
              variant={isSidebarOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleSidebar}
              className="h-9 gap-2"
            >
              {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              <span className="hidden sm:inline font-bold">Sidebar</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-muted/30 p-1.5 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors">

            <div className="flex bg-muted p-1 rounded-xl shrink-0">
              <Button
                variant={chatMode === "agent" ? "default" : "ghost"}
                size="sm"
                onClick={() => setChatMode("agent")}
                className={`h-7 px-4 font-bold ${chatMode === "agent" ? 'shadow-sm' : ''}`}
              >
                Agent
              </Button>
              <Button
                variant={chatMode === "guests" ? "default" : "ghost"}
                size="sm"
                onClick={() => setChatMode("guests")}
                className={`h-7 px-4 font-bold ${chatMode === "guests" ? 'shadow-sm bg-background text-foreground hover:bg-background' : ''}`}
              >
                Users
              </Button>
            </div>

            <div className="hidden sm:block h-6 w-px bg-border/50 mx-1" />

            <div id="tour-date-range">
              <DateRangePicker
                date={dateRange}
                setDate={(newRange) => {
                  setDateRange(newRange);
                  if (!newRange?.from || !newRange?.to) setIsChatActive(false);
                }}
              />
            </div>

            {chatMode === "agent" && (
              <>
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span id="tour-run-aria" tabIndex={0} className="inline-flex">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarketSetup}
                          disabled={isLoading || isSettingUp || !dateRange?.from || !dateRange?.to}
                          className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm"
                        >
                          <Settings className={`h-4 w-4 ${isSettingUp ? "animate-spin text-amber-500" : ""}`} />
                          <span className="hidden sm:inline">{isSettingUp ? "Processing..." : "Run Aria"}</span>
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {/* Tooltip removed since guardrails missing is no longer an error */}
                  </Tooltip>
                </TooltipProvider>

                <div className="hidden sm:block h-6 w-px bg-border/50 mx-1" />

                <div className="flex items-center gap-3 px-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-1">
                      Agent
                    </span>
                    <span className={`text-[10px] font-black tracking-widest leading-none ${isChatActive ? 'text-amber-500' : 'text-muted-foreground/50'}`}>
                      {isChatActive ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <Switch checked={isChatActive} disabled={true} className="data-[state=checked]:bg-amber-500 scale-90" />
                </div>
              </>
            )}

            {chatMode === "guests" && (
              <>
                <div className="hidden sm:block h-6 w-px bg-border/50 mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!dateRange?.from || !dateRange?.to || !propertyId) return;
                    setIsGeneratingSummary(true);
                    try {
                      toast.loading("AI is generating summary...", { id: 'summary' });
                      const from = format(dateRange.from, 'yyyy-MM-dd');
                      const to = format(dateRange.to, 'yyyy-MM-dd');
                      const res = await fetch(`/api/hostaway/summary`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ listingId: propertyId, dateFrom: from, dateTo: to })
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
                  disabled={!dateRange?.from || !dateRange?.to || isGeneratingSummary || conversations.length === 0 || conversations === mockConversations}
                  className="h-9 gap-2 bg-background hover:bg-background/80 border-border/50 font-bold shadow-sm text-violet-600 border-violet-500/30"
                >
                  {isGeneratingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="hidden sm:inline">{isGeneratingSummary ? 'Generating...' : 'Generate Summary'}</span>
                </Button>
              </>
            )}

          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden relative">

          {chatMode === "agent" ? (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {isHistoryLoading && <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-xl ${message.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background/60 backdrop-blur-xl border border-border/50 text-foreground rounded-tl-none"}`}>
                      <div className="break-words">
                        <MarkdownMessage content={message.content} isUser={message.role === "user"} />
                      </div>
                      {message.proposals && message.proposals.length > 0 && (
                        <div className="mt-5 border border-border/40 rounded-2xl bg-white/5 backdrop-blur-md overflow-hidden shadow-inner">
                          <div className="bg-primary/5 px-4 py-3 text-xs font-black uppercase tracking-[0.2em] border-b border-border/40 text-primary">Live Price Proposals ({message.proposals.length})</div>
                          <div className="p-4 text-sm space-y-4">
                            {message.proposals.map((prop, idx) => (
                              <div key={idx} className="flex flex-col gap-2 pb-4 border-b border-border/20 last:border-0 last:pb-0">
                                <div className="flex justify-between font-bold items-center">
                                  <span className="text-sm tracking-tight text-foreground/80">{prop.date}</span>
                                  <div className="flex items-center gap-2">
                                    {prop.proposed_min_stay && <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-primary/5 text-primary border-primary/20 scale-90 origin-right">{prop.proposed_min_stay}N Min</Badge>}
                                    <span className={`text-sm font-black tabular-nums ${prop.change_pct > 0 ? "text-emerald-500" : "text-amber-500"}`}>AED {prop.proposed_price} <span className="text-[10px] ml-1 opacity-70">({prop.change_pct > 0 ? "+" : ""}{prop.change_pct}%)</span></span>
                                  </div>
                                </div>
                                {typeof prop.reasoning === 'string' ? (
                                  <p className="text-muted-foreground/80 text-[11px] leading-relaxed italic">{prop.reasoning}</p>
                                ) : (
                                  <details className="group mt-1 cursor-pointer">
                                    <summary className="text-[11px] font-bold uppercase tracking-widest text-primary/70 hover:text-primary list-none flex items-center gap-1 mb-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary/40 group-open:bg-primary transition-colors" />
                                      View Pricing Intelligence
                                    </summary>

                                    <div className="pl-3 border-l tracking-normal text-xs border-primary/20 space-y-4 animate-in fade-in slide-in-from-top-1">
                                      {/* Comparisons */}
                                      {prop.comparisons && (
                                        <div className="space-y-1.5">
                                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Market Positioning</div>
                                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div className="bg-background/40 p-1.5 rounded-md border border-border/40">
                                              <span className="block text-muted-foreground mb-0.5">Recommended</span>
                                              <span className={`font-bold ${prop.comparisons.vs_recommended?.diff_pct > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {prop.comparisons.vs_recommended?.diff_pct > 0 ? '+' : ''}{prop.comparisons.vs_recommended?.diff_pct}%
                                              </span> <span className="text-muted-foreground/50">vs AED {prop.comparisons.vs_recommended?.comp_price}</span>
                                            </div>
                                            <div className="bg-background/40 p-1.5 rounded-md border border-border/40">
                                              <span className="block text-muted-foreground mb-0.5">Top Comp ({prop.comparisons.vs_top_comp?.comp_name?.substring(0, 10)})</span>
                                              <span className={`font-bold ${prop.comparisons.vs_top_comp?.diff_pct > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                {prop.comparisons.vs_top_comp?.diff_pct > 0 ? '+' : ''}{prop.comparisons.vs_top_comp?.diff_pct}%
                                              </span> <span className="text-muted-foreground/50">vs AED {prop.comparisons.vs_top_comp?.comp_price}</span>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Detailed Reasoning */}
                                      {prop.reasoning && (
                                        <div className="space-y-2 mt-2">
                                          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Decision Engine</div>
                                          <ul className="space-y-1.5 text-[11px] text-muted-foreground/90">
                                            {prop.reasoning.reason_market && <li><strong>Market:</strong> {prop.reasoning.reason_market}</li>}
                                            {prop.reasoning.reason_news && <li><strong>News:</strong> {prop.reasoning.reason_news}</li>}
                                            {prop.reasoning.reason_benchmark && <li><strong>Benchmark:</strong> {prop.reasoning.reason_benchmark}</li>}
                                            {prop.reasoning.reason_guardrails && <li><strong>Guardrails:</strong> {prop.reasoning.reason_guardrails}</li>}
                                            {prop.server_notes && <li className="text-amber-600"><strong>System Guard:</strong> {prop.server_notes}</li>}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                )}
                              </div>
                            ))}
                          </div>
                          {message.proposalStatus === "pending" && (
                            <div className="flex bg-primary/5 p-3 gap-3 border-t border-border/40">
                              <Button variant="default" size="sm" className="flex-1" onClick={() => handleSaveProposals(message.id, message.proposals!)}>Deploy to Control</Button>
                              <Button variant="outline" size="sm" className="flex-1 text-rose-500 hover:bg-rose-500/10" onClick={() => handleRejectProposals(message.id)}>Discard</Button>
                            </div>
                          )}
                          {message.proposalStatus === "saved" && <div className="flex bg-emerald-500/5 p-3 border-t border-emerald-500/20 justify-center text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500"><CheckSquare className="h-3.5 w-3.5 mr-2" />Deployed to Command Center</div>}
                          {message.proposalStatus === "rejected" && <div className="flex bg-rose-500/5 p-3 border-t border-rose-500/20 justify-center text-[10px] font-black uppercase tracking-[0.2em] text-rose-500"><AlertCircle className="h-3.5 w-3.5 mr-2" />Proposals Discarded</div>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && <div className="flex justify-start"><Card className="max-w-2xl"><CardContent className="p-4 flex items-center space-x-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Thinking...</span></CardContent></Card></div>}
                <div ref={messagesEndRef} />
              </div>

              <div id="tour-chat-input" className="border-t p-4 bg-background">
                <form onSubmit={handleSubmit} className="flex space-x-2">
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex-1">
                          <Input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={!isChatActive ? "Select date range and click 'Run Aria' to start..." : "Ask about pricing, events, market rates..."}
                            disabled={isLoading || !isChatActive}
                            className="w-full"
                          />
                        </div>
                      </TooltipTrigger>
                    </Tooltip>
                  </TooltipProvider>
                  <Button type="submit" disabled={isLoading || !input.trim() || !isChatActive}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Guest Inbox Sidebar — collapsible */}
              <div className={`border-r bg-muted/10 flex flex-col border-border/50 transition-all duration-200 ${isInboxCollapsed ? 'w-0 overflow-hidden border-r-0' : activeConversationId ? 'hidden md:flex w-1/3' : 'flex w-1/3'}`}>
                <div className="p-4 border-b bg-background border-border/50 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-widest text-xs text-muted-foreground">Guest Inbox</h3>
                  <div className="flex items-center gap-1">
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
                      onClick={() => setActiveConversationId(conv.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all border ${activeConversationId === conv.id ? 'bg-primary/5 border-primary/30' : 'bg-background hover:bg-muted/50 border-border/50 hover:border-border'}`}
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
                      <p className="text-[10px] mt-1 text-center px-4">No activity in this date range.<br />Sync from Dashboard if needed.</p>
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
                    <PanelLeftOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )}
              <div className={`flex-1 flex-col bg-background relative ${!activeConversationId ? 'hidden md:flex' : 'flex'}`}>
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
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {activeConversation.messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.sender === 'admin' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                          <div className={`px-4 py-2.5 rounded-2xl overflow-hidden ${msg.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted border border-border/50 rounded-bl-sm'}`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{msg.text}</p>
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
            </div>
          )}
        </div>
      </div>
    </div >
  );
}
