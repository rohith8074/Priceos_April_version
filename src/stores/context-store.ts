import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DateRange } from "react-day-picker";
import { addDays } from "date-fns";

interface ContextStore {
  // Current context
  contextType: "portfolio" | "property";
  propertyId: string | null;
  propertyName: string | null;
  propertyCurrency: string;

  // Date Range
  dateRange: DateRange | undefined;

  // Actions
  setPortfolioContext: () => void;
  setPropertyContext: (id: string, name: string, currency?: string) => void;
  setDateRange: (range: DateRange | undefined) => void;

  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activeSidebarTab: "summary" | "signals" | "calendar" | "rules";
  setSidebarTab: (tab: "summary" | "signals" | "calendar" | "rules") => void;

  // Shared Data
  calendarMetrics: any | null;
  setCalendarMetrics: (metrics: any | null) => void;

  // Conversation Summary (shared between chat interface and sidebar)
  conversationSummary: any | null;
  setConversationSummary: (summary: any | null) => void;

  // Sync Trigger
  marketRefreshTrigger: number;
  triggerMarketRefresh: () => void;

  // Analysis state
  isMarketAnalysisRunning: boolean;
  setIsMarketAnalysisRunning: (running: boolean) => void;
}

// Helper to convert JSON strings back to dates
const dateReviver = (key: string, value: any) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value);
  }
  return value;
};

export const useContextStore = create<ContextStore>()(
  persist(
    (set) => ({
      // Initial state: portfolio view
      contextType: "portfolio",
      propertyId: null,
      propertyName: null,
      propertyCurrency: "AED",
      activeSidebarTab: "summary",
      calendarMetrics: null,
      conversationSummary: null,
      isSidebarOpen: true,

      // Initial Date Range (Next 1 month)
      dateRange: {
        from: new Date(),
        to: addDays(new Date(), 30),
      },

      marketRefreshTrigger: 0,
      isMarketAnalysisRunning: false,

      // UI Actions
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarTab: (tab: "summary" | "signals" | "calendar" | "rules") => set({ activeSidebarTab: tab }),

      setCalendarMetrics: (metrics: any | null) => set({ calendarMetrics: metrics }),

      setConversationSummary: (summary: any | null) => set({ conversationSummary: summary }),

      triggerMarketRefresh: () => set((state) => ({ marketRefreshTrigger: state.marketRefreshTrigger + 1 })),

      setIsMarketAnalysisRunning: (running: boolean) => set({ isMarketAnalysisRunning: running }),

      setDateRange: (range: DateRange | undefined) =>
        set({
          dateRange: range,
        }),

      // Switch to portfolio view
      setPortfolioContext: () =>
        set({
          contextType: "portfolio",
          propertyId: null,
          propertyName: null,
          propertyCurrency: "AED",
          calendarMetrics: null,
          conversationSummary: null,
        }),

      // Switch to specific property — clear stale metrics immediately so the
      // calendar doesn't flash the previous property's data during the fetch
      setPropertyContext: (id: string, name: string, currency?: string) =>
        set({
          contextType: "property",
          propertyId: id,
          propertyName: name,
          propertyCurrency: currency || "AED",
          calendarMetrics: null,
          conversationSummary: null,
        }),
    }),
    {
      name: "priceos-context-storage",
      skipHydration: true, // Let component hydrate properly
      storage: createJSONStorage(() => localStorage, { reviver: dateReviver }),
    }
  )
);
