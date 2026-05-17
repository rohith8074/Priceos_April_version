import mongoose, { Document, Schema, Model } from "mongoose";

export interface IMarketEvent extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId?: mongoose.Types.ObjectId; // null = portfolio-wide
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  area?: string;
  areas?: string[];
  impactLevel: "high" | "medium" | "low";
  upliftPct: number;
  description?: string;
  source: "ai_detected" | "ticketmaster" | "eventbrite" | "manual" | "market_template" | "serp" | "perplexity" | "dtcm";
  sourceUrl?: string;       // Direct link to event page / news article
  attendeeCount?: number;   // Estimated attendance (improves impact scoring)
  demandScore?: number;     // 0-100 composite demand score
  category?: string;        // e.g. "Concert", "Sports", "Trade Show"
  venue?: string;           // Venue name
  externalId?: string;      // Source-specific dedup key (e.g. "serp:news:...", "dtcm:gitex-2026")
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarketEventSchema = new Schema<IMarketEvent>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", sparse: true },
    name: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    area: { type: String },
    areas: [{ type: String }],
    impactLevel: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    upliftPct: { type: Number, default: 0 },
    description: { type: String },
    source: {
      type: String,
      enum: ["ai_detected", "ticketmaster", "eventbrite", "manual", "market_template", "serp", "perplexity", "dtcm"],
      default: "ai_detected",
    },
    sourceUrl: { type: String },
    attendeeCount: { type: Number },
    demandScore: { type: Number, min: 0, max: 100 },
    category: { type: String },
    venue: { type: String },
    externalId: { type: String, sparse: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MarketEventSchema.index({ orgId: 1, startDate: 1, endDate: 1 });
MarketEventSchema.index({ orgId: 1, externalId: 1 }, { sparse: true });

export const MarketEvent: Model<IMarketEvent> =
  mongoose.models.MarketEvent ??
  mongoose.model<IMarketEvent>("MarketEvent", MarketEventSchema);
