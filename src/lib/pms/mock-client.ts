import { PMSClient } from "./types";
import {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";
import type {
  SeasonalRule,
  Conversation,
  ConversationMessage,
  MessageTemplate,
  OperationalTask,
  Expense,
  OwnerStatement,
} from "@/types/operations";
import { MOCK_PROPERTIES } from "@/data/mock-properties";
import { generateMockCalendar } from "@/data/mock-calendar";
import { MOCK_RESERVATIONS, getReservationsInRange, getReservationsForProperty } from "@/data/mock-reservations";
import { MOCK_SEASONAL_RULES, getRulesForListing } from "@/data/mock-seasonal-rules";
import { MOCK_CONVERSATIONS, MOCK_MESSAGES, MOCK_MESSAGE_TEMPLATES, getMessagesForConversation } from "@/data/mock-conversations";
import { MOCK_TASKS } from "@/data/mock-tasks";
import { MOCK_EXPENSES, MOCK_OWNER_STATEMENTS } from "@/data/mock-expenses";
import { format, parseISO } from "date-fns";

/**
 * MockPMSClient
 * In-memory mock implementation of PMSClient
 * Simulates Hostaway API with realistic data
 */

export class MockPMSClient implements PMSClient {
  private calendarOverrides: Map<
    string,
    Map<string, { date: string; price: number }>
  > = new Map();
  private blockOverrides: Map<string, Map<string, { blocked: boolean; reason?: string }>> = new Map();
  private listingOverrides: Map<number | string, Partial<Listing>> = new Map();

  async listListings(): Promise<Listing[]> {
    // Simulate network delay
    await this.delay(100);
    return MOCK_PROPERTIES.map((p) => {
      const overrides = this.listingOverrides.get(p.id);
      return overrides ? { ...p, ...overrides } : p;
    });
  }

  async getListing(id: string | number): Promise<Listing> {
    await this.delay(50);

    const numId = typeof id === "string" ? parseInt(id) : id;
    const listing = MOCK_PROPERTIES.find((p) => p.id === numId);

    if (!listing) {
      throw new Error(`Listing ${id} not found`);
    }

    const overrides = this.listingOverrides.get(numId);
    return overrides ? { ...listing, ...overrides } : listing;
  }

  async getCalendar(
    id: string | number,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarDay[]> {
    await this.delay(150);

    const numId = typeof id === "string" ? parseInt(id) : id;
    const listing = MOCK_PROPERTIES.find((p) => p.id === numId);

    if (!listing) {
      throw new Error(`Listing ${id} not found`);
    }

    // Generate mock calendar
    let calendar = generateMockCalendar(numId, startDate, endDate);

    // Apply any overrides from updateCalendar calls
    const overrides = this.calendarOverrides.get(String(numId));
    if (overrides) {
      calendar = calendar.map((day) => {
        const override = overrides.get(day.date);
        if (override) {
          return { ...day, price: override.price };
        }
        return day;
      });
    }

    // Apply block overrides
    const blockOvr = this.blockOverrides.get(String(numId));
    if (blockOvr) {
      calendar = calendar.map((day) => {
        const override = blockOvr.get(day.date);
        if (override) {
          if (override.blocked) {
            return { ...day, status: "blocked" as const, price: 0, blockReason: override.reason as CalendarDay["blockReason"] };
          } else {
            return { ...day, status: "available" as const, blockReason: undefined };
          }
        }
        return day;
      });
    }

    return calendar;
  }

  async getReservations(filters?: ReservationFilters): Promise<Reservation[]> {
    await this.delay(200);

    let results = MOCK_RESERVATIONS;

    if (filters?.listingMapId) {
      results = getReservationsForProperty(filters.listingMapId);
    }

    if (filters?.startDate && filters?.endDate) {
      results = getReservationsInRange(filters.startDate, filters.endDate);
    }

    if (filters?.channelName) {
      results = results.filter((r) => r.channelName === filters.channelName);
    }

    if (filters?.status) {
      results = results.filter((r) => r.status === filters.status);
    }

    if (filters?.limit) {
      results = results.slice(0, filters.limit);
    }

    if (filters?.offset) {
      results = results.slice(filters.offset);
    }

    return results;
  }

  async updateListing(id: string | number, updates: Partial<Listing>): Promise<Listing> {
    await this.delay(100);
    const numId = typeof id === "string" ? parseInt(id) : id;
    const listing = MOCK_PROPERTIES.find((p) => p.id === numId);
    if (!listing) throw new Error(`Listing ${id} not found`);
    const existing = this.listingOverrides.get(numId) ?? {};
    this.listingOverrides.set(numId, { ...existing, ...updates });
    return { ...listing, ...existing, ...updates };
  }

  async getReservation(id: string | number): Promise<Reservation> {
    await this.delay(50);
    const numId = typeof id === "string" ? parseInt(id) : id;
    const reservation = MOCK_RESERVATIONS.find((r) => r.id === numId);
    if (!reservation) {
      throw new Error(`Reservation ${id} not found`);
    }
    return reservation;
  }

  async blockDates(
    id: string | number,
    startDate: string,
    endDate: string,
    reason: "owner_stay" | "maintenance" | "other"
  ): Promise<UpdateResult> {
    await this.delay(100);
    const key = String(typeof id === "string" ? parseInt(id) : id);
    if (!this.blockOverrides.has(key)) {
      this.blockOverrides.set(key, new Map());
    }
    const overrides = this.blockOverrides.get(key)!;
    let count = 0;
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      overrides.set(dateStr, { blocked: true, reason });
      count++;
      current.setDate(current.getDate() + 1);
    }
    return { success: true, updatedCount: count };
  }

  async unblockDates(
    id: string | number,
    startDate: string,
    endDate: string
  ): Promise<UpdateResult> {
    await this.delay(100);
    const key = String(typeof id === "string" ? parseInt(id) : id);
    if (!this.blockOverrides.has(key)) {
      this.blockOverrides.set(key, new Map());
    }
    const overrides = this.blockOverrides.get(key)!;
    let count = 0;
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      overrides.set(dateStr, { blocked: false });
      count++;
      current.setDate(current.getDate() + 1);
    }
    return { success: true, updatedCount: count };
  }

  // --- Seasonal Rules ---

  async getSeasonalRules(listingId: string | number): Promise<SeasonalRule[]> {
    await this.delay(100);
    const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
    return getRulesForListing(numId);
  }

  async createSeasonalRule(listingId: string | number, rule: Omit<SeasonalRule, "id" | "listingMapId">): Promise<SeasonalRule> {
    await this.delay(100);
    const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
    const newRule: SeasonalRule = { ...rule, id: Date.now(), listingMapId: numId };
    MOCK_SEASONAL_RULES.push(newRule);
    return newRule;
  }

  async updateSeasonalRule(listingId: string | number, ruleId: number, updates: Partial<SeasonalRule>): Promise<SeasonalRule> {
    await this.delay(100);
    const idx = MOCK_SEASONAL_RULES.findIndex((r) => r.id === ruleId);
    if (idx === -1) throw new Error(`Rule ${ruleId} not found`);
    MOCK_SEASONAL_RULES[idx] = { ...MOCK_SEASONAL_RULES[idx], ...updates };
    return MOCK_SEASONAL_RULES[idx];
  }

  async deleteSeasonalRule(listingId: string | number, ruleId: number): Promise<void> {
    await this.delay(100);
    const idx = MOCK_SEASONAL_RULES.findIndex((r) => r.id === ruleId);
    if (idx !== -1) MOCK_SEASONAL_RULES.splice(idx, 1);
  }

  // --- Conversations ---

  async getConversations(listingId?: string | number): Promise<Conversation[]> {
    await this.delay(100);
    if (listingId) {
      const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
      return MOCK_CONVERSATIONS.filter((c) => c.listingMapId === numId);
    }
    return MOCK_CONVERSATIONS;
  }

  async getConversationMessages(conversationId: number): Promise<ConversationMessage[]> {
    await this.delay(100);
    return getMessagesForConversation(conversationId);
  }

  async sendMessage(conversationId: number, content: string): Promise<ConversationMessage> {
    await this.delay(100);
    const msg: ConversationMessage = {
      id: Date.now(),
      conversationId,
      sender: "host",
      content,
      sentAt: new Date().toISOString(),
    };
    MOCK_MESSAGES.push(msg);
    return msg;
  }

  async getMessageTemplates(): Promise<MessageTemplate[]> {
    await this.delay(50);
    return MOCK_MESSAGE_TEMPLATES;
  }

  // --- Tasks ---

  async getTasks(listingId?: string | number): Promise<OperationalTask[]> {
    await this.delay(100);
    if (listingId) {
      const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
      return MOCK_TASKS.filter((t) => t.listingMapId === numId);
    }
    return MOCK_TASKS;
  }

  async createTask(task: Omit<OperationalTask, "id" | "createdAt">): Promise<OperationalTask> {
    await this.delay(100);
    const newTask: OperationalTask = { ...task, id: Date.now(), createdAt: new Date().toISOString() };
    MOCK_TASKS.push(newTask);
    return newTask;
  }

  async updateTask(taskId: number, updates: Partial<OperationalTask>): Promise<OperationalTask> {
    await this.delay(100);
    const idx = MOCK_TASKS.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error(`Task ${taskId} not found`);
    MOCK_TASKS[idx] = { ...MOCK_TASKS[idx], ...updates };
    return MOCK_TASKS[idx];
  }

  // --- Expenses ---

  async getExpenses(listingId?: string | number): Promise<Expense[]> {
    await this.delay(100);
    if (listingId) {
      const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
      return MOCK_EXPENSES.filter((e) => e.listingMapId === numId);
    }
    return MOCK_EXPENSES;
  }

  async createExpense(expense: Omit<Expense, "id">): Promise<Expense> {
    await this.delay(100);
    const newExpense: Expense = { ...expense, id: Date.now() };
    MOCK_EXPENSES.push(newExpense);
    return newExpense;
  }

  async getOwnerStatements(listingId?: string | number): Promise<OwnerStatement[]> {
    await this.delay(100);
    if (listingId) {
      const numId = typeof listingId === "string" ? parseInt(listingId) : listingId;
      return MOCK_OWNER_STATEMENTS.filter((s) => s.listingMapId === numId);
    }
    return MOCK_OWNER_STATEMENTS;
  }

  // --- Create Reservation ---

  async createReservation(reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">): Promise<Reservation> {
    await this.delay(100);
    const pricePerNight = reservation.nights > 0 ? Math.round(reservation.totalPrice / reservation.nights) : 0;
    const newReservation: Reservation = {
      ...reservation,
      id: Date.now(),
      pricePerNight,
      createdAt: new Date().toISOString(),
    };
    MOCK_RESERVATIONS.push(newReservation);
    return newReservation;
  }

  async updateCalendar(
    id: string | number,
    intervals: CalendarInterval[]
  ): Promise<UpdateResult> {
    await this.delay(200);

    const numId = typeof id === "string" ? parseInt(id) : id;
    const listing = MOCK_PROPERTIES.find((p) => p.id === numId);

    if (!listing) {
      throw new Error(`Listing ${id} not found`);
    }

    // Initialize overrides for this listing if needed
    const listingKey = String(numId);
    if (!this.calendarOverrides.has(listingKey)) {
      this.calendarOverrides.set(listingKey, new Map());
    }

    const overrides = this.calendarOverrides.get(listingKey)!;
    let updatedCount = 0;

    // Apply each interval
    intervals.forEach((interval) => {
      const startDate = parseISO(interval.startDate);
      const endDate = parseISO(interval.endDate);

      const current = new Date(startDate);
      while (current <= endDate) {
        const dateStr = format(current, "yyyy-MM-dd");
        overrides.set(dateStr, {
          date: dateStr,
          price: interval.price,
        });
        updatedCount++;
        current.setDate(current.getDate() + 1);
      }
    });

    return {
      success: true,
      updatedCount,
    };
  }

  async verifyCalendar(
    id: string | number,
    dates: string[]
  ): Promise<VerificationResult> {
    await this.delay(150);

    const numId = typeof id === "string" ? parseInt(id) : id;
    const overrides = this.calendarOverrides.get(String(numId));

    if (!overrides) {
      // No updates made, so no mismatches
      return {
        matches: true,
        totalDates: dates.length,
        matchedDates: dates.length,
      };
    }

    const mismatches: Array<{
      date: string;
      expected: number;
      actual: number;
    }> = [];

    dates.forEach((date) => {
      const override = overrides.get(date);
      if (!override) {
        mismatches.push({
          date,
          expected: 0,
          actual: 0,
        });
      }
    });

    return {
      matches: mismatches.length === 0,
      totalDates: dates.length,
      matchedDates: dates.length - mismatches.length,
      mismatches: mismatches.length > 0 ? mismatches : undefined,
    };
  }

  getMode(): "mock" | "live" {
    return "mock";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all overrides (useful for testing)
   */
  clearOverrides(): void {
    this.calendarOverrides.clear();
  }

  /**
   * Get current overrides for debugging
   */
  getOverrides(
    id: string | number
  ): Map<string, { date: string; price: number }> | undefined {
    return this.calendarOverrides.get(String(id));
  }
}
