import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";

interface ChatContext {
  type: "portfolio" | "property";
  propertyId?: string;
}

interface ChatStore {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  activityStep: number | null;
  sessionId: string;
  contextPrompt: string | null;
  context: ChatContext;

  // Message history per context (keyed by context identifier)
  messageHistory: Map<string, ChatMessage[]>;

  open: (contextPrompt?: string) => void;
  close: () => void;
  toggle: () => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setLoading: (loading: boolean) => void;
  setActivityStep: (step: number | null) => void;
  resetSession: () => void;
  clearMessages: () => void;
  switchContext: (newContext: ChatContext) => void;
}

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getContextKey(context: ChatContext): string {
  return context.type === "portfolio"
    ? "portfolio"
    : `property-${context.propertyId}`;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  isOpen: false,
  messages: [],
  isLoading: false,
  activityStep: null,
  sessionId: generateSessionId(),
  contextPrompt: null,
  context: { type: "portfolio" },
  messageHistory: new Map(),

  open: (contextPrompt?: string) =>
    set({ isOpen: true, contextPrompt: contextPrompt ?? null }),
  close: () => set({ isOpen: false, contextPrompt: null }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),

  addMessage: (message) =>
    set((state) => {
      const newMessages = [...state.messages, message];
      const contextKey = getContextKey(state.context);
      const newHistory = new Map(state.messageHistory);
      newHistory.set(contextKey, newMessages);

      return {
        messages: newMessages,
        messageHistory: newHistory,
      };
    }),

  setMessages: (messages) =>
    set((state) => {
      const contextKey = getContextKey(state.context);
      const newHistory = new Map(state.messageHistory);
      newHistory.set(contextKey, messages);

      return {
        messages,
        messageHistory: newHistory,
      };
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  setActivityStep: (step) => set({ activityStep: step }),

  resetSession: () =>
    set({
      messages: [],
      sessionId: generateSessionId(),
      activityStep: null,
      isLoading: false,
      contextPrompt: null,
    }),

  clearMessages: () => set({ messages: [] }),

  switchContext: (newContext: ChatContext) =>
    set((state) => {
      // Save current messages before switching
      const currentKey = getContextKey(state.context);
      const newHistory = new Map(state.messageHistory);
      newHistory.set(currentKey, state.messages);

      // Load messages for new context (or empty array if none)
      const newKey = getContextKey(newContext);
      const newMessages = newHistory.get(newKey) || [];

      return {
        context: newContext,
        messages: newMessages,
        messageHistory: newHistory,
        sessionId: generateSessionId(),
        activityStep: null,
        isLoading: false,
      };
    }),
}));
