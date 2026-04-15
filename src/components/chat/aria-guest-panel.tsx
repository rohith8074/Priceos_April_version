"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, X, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function AriaGuestPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !sessionId) {
      startNewSession();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function startNewSession() {
    const id = `aria-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(id);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hi! I'm Aria, your AI revenue copilot. I can help you draft guest replies, summarise conversations, suggest tone adjustments, or answer questions about your portfolio. How can I help?",
        timestamp: new Date(),
      },
    ]);
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/global", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, sessionId }),
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.message || "I couldn't process that. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } catch {
      toast.error("Failed to connect to Aria.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 text-body-xs font-semibold",
          isOpen
            ? "bg-amber text-black"
            : "bg-surface-2 border border-border-default text-text-secondary hover:text-amber hover:border-amber/40"
        )}
      >
        {isOpen ? (
          <>
            <X className="h-4 w-4" />
            Close Aria
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 text-amber" />
            Ask Aria
          </>
        )}
      </button>

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed bottom-20 right-6 z-50 flex flex-col w-[380px] h-[520px] rounded-xl border border-border-default bg-surface-1 shadow-2xl transition-all duration-300 origin-bottom-right",
          isOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-amber/10 border border-amber/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-amber" />
            </div>
            <div>
              <p className="text-body-xs font-semibold text-text-primary">Aria</p>
              <p className="text-[10px] text-text-tertiary">Guest Inbox Assistant</p>
            </div>
          </div>
          <button
            onClick={startNewSession}
            title="New session"
            className="p-1.5 rounded-md text-text-tertiary hover:text-amber transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Context chip */}
        <div className="px-4 py-2 border-b border-border-subtle/50">
          <p className="text-[10px] text-text-disabled">
            Ask Aria to summarise a conversation, draft a reply, or suggest a tone
          </p>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-2 rounded-xl text-body-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-amber text-black font-medium rounded-tr-none"
                      : "bg-surface-2 border border-border-subtle text-text-primary rounded-tl-none"
                  )}
                >
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                </div>
                <span className="text-[9px] text-text-disabled mt-0.5 px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-[10px]">Aria is thinking...</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Quick prompts */}
        <div className="px-4 pt-2 flex flex-wrap gap-1.5">
          {["Summarise conversation", "Draft a reply", "Suggest polite tone"].map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-[10px] px-2 py-1 rounded-full bg-surface-2 border border-border-subtle text-text-secondary hover:border-amber/40 hover:text-amber transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Aria anything..."
            className="h-9 text-body-xs bg-surface-2 border-border-subtle focus:border-amber/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="h-9 w-9 bg-amber text-black hover:bg-amber/80 shrink-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </>
  );
}
