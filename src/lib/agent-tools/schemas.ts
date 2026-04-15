import { z } from "zod";

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format");

const objectIdString = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid Mongo ObjectId");

const nonEmptyString = z.string().min(1);

export const rangeQuerySchema = z.object({
  dateFrom: isoDateString,
  dateTo: isoDateString,
});

export const portfolioOverviewSchema = rangeQuerySchema;

export const agentSystemStatusSchema = z.object({});

export const portfolioRevenueSnapshotSchema = rangeQuerySchema.extend({
  groupBy: z.enum(["day", "week", "property"]).default("day"),
});

export const propertyProfileSchema = z.object({
  listingId: objectIdString,
});

export const propertyCalendarMetricsSchema = rangeQuerySchema.extend({
  listingId: objectIdString,
});

export const propertyReservationsSchema = rangeQuerySchema.extend({
  listingId: objectIdString,
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const propertyMarketEventsSchema = rangeQuerySchema.extend({
  listingId: objectIdString.optional(),
});

export const propertyBenchmarkSchema = rangeQuerySchema.extend({
  listingId: objectIdString,
});

export const guestConversationsSchema = rangeQuerySchema.extend({
  listingId: objectIdString,
});

export const guestSummarySchema = rangeQuerySchema.extend({
  listingId: objectIdString,
});

export const generateGuestSummarySchema = z.object({
  listingId: objectIdString,
  dateFrom: isoDateString,
  dateTo: isoDateString,
});

export const suggestAndSaveGuestReplySchema = z.object({
  listingId: objectIdString.optional(),
  conversationId: nonEmptyString,
  guestMessage: nonEmptyString.max(5000),
  guestName: nonEmptyString.max(200),
  propertyName: z.string().max(200).optional(),
  autoSave: z.boolean().default(false),
});

export type PortfolioOverviewInput = z.infer<typeof portfolioOverviewSchema>;
export type AgentSystemStatusInput = z.infer<typeof agentSystemStatusSchema>;
export type PortfolioRevenueSnapshotInput = z.infer<typeof portfolioRevenueSnapshotSchema>;
export type PropertyProfileInput = z.infer<typeof propertyProfileSchema>;
export type PropertyCalendarMetricsInput = z.infer<typeof propertyCalendarMetricsSchema>;
export type PropertyReservationsInput = z.infer<typeof propertyReservationsSchema>;
export type PropertyMarketEventsInput = z.infer<typeof propertyMarketEventsSchema>;
export type PropertyBenchmarkInput = z.infer<typeof propertyBenchmarkSchema>;
export type GuestConversationsInput = z.infer<typeof guestConversationsSchema>;
export type GuestSummaryInput = z.infer<typeof guestSummarySchema>;
export type GenerateGuestSummaryInput = z.infer<typeof generateGuestSummarySchema>;
export type SuggestAndSaveGuestReplyInput = z.infer<typeof suggestAndSaveGuestReplySchema>;
