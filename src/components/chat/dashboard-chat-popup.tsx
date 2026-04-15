"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, RefreshCw, User, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { readSSEStream } from "@/lib/chat/sse-reader";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface DashboardChatPopupProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DashboardChatPopup({ isOpen, onOpenChange }: DashboardChatPopupProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [sessionId, setSessionId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize a new session when the chat is first opened
  useEffect(() => {
    if (isOpen && !sessionId) {
      startNewSession();
    }
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const startNewSession = () => {
    const newSessionId = `dash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSessionId);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Hi! I'm your PriceOS Portfolio Assistant. I can help you with insights about today's journey, underperforming properties, or revenue summaries. How can I help you today?",
        timestamp: new Date(),
      },
    ]);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStatusText("Connecting to PriceOS…");

    try {
      const response = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      await readSSEStream(
        response,
        (msg) => setStatusText(msg),
        (data) => {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.message || "I couldn't process that request. Please try again.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        },
        (errMsg) => {
          toast.error(errMsg || "Failed to connect to the assistant.");
        },
      );
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to connect to the assistant.");
    } finally {
      setIsLoading(false);
      setStatusText("");
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] flex flex-col p-0 bg-background/95 backdrop-blur-xl border-l border-white/5">
        <SheetHeader className="p-6 border-b border-white/5 bg-surface-1/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber/10 border border-amber/20 flex items-center justify-center">
                <Bot className="h-6 w-6 text-amber" />
              </div>
              <div>
                <SheetTitle className="text-xl font-bold text-amber">Ask Agent</SheetTitle>
                <SheetDescription className="text-xs text-text-tertiary">
                  Portfolio Assistant • Real-time Intelligence
                </SheetDescription>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={startNewSession}
              className="h-8 w-8 text-text-tertiary hover:text-amber"
              title="New Session"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex flex-col ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-amber text-black font-medium rounded-tr-none shadow-lg shadow-amber/10"
                      : "bg-surface-2 border border-white/5 text-text-primary rounded-tl-none"
                  }`}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <span className="text-[10px] text-text-disabled mt-1 px-1">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin text-amber" />
                <span className="text-xs font-medium animate-pulse">{statusText || "Agent is thinking…"}</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="p-6 bg-surface-1/50 border-t border-white/5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 mb-1">
              {["Underperforming", "Revenue Summary", "Market Trends"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    // We don't auto-send because the user might want to edit
                  }}
                  className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text-secondary hover:border-amber/50 hover:text-amber transition-colors font-semibold"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <form onSubmit={handleSend} className="relative flex items-center">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your portfolio..."
                className="pr-12 h-12 bg-background/50 border-white/10 focus:border-amber/50 focus:ring-amber/20 rounded-xl"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 h-9 w-9 bg-amber text-black hover:bg-amber-dim rounded-lg shadow-lg"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-[9px] text-center text-text-disabled uppercase tracking-widest font-bold">
              AI-Powered Portfolio Analysis
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
