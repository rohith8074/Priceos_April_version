import mongoose, { Document, Schema, Model } from "mongoose";

/**
 * DemandSignal — news-based demand indicators scraped via SERP Google News.
 *
 * Separate from MarketEvent because news articles aren't discrete events with
 * start/end dates. They represent demand pressure (positive or negative) for
 * a given area over a lookahead window.
 */
export interface IDemandSignal extends Document {
  orgId: mongoose.Types.ObjectId;
  headline: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;      // e.g. "Gulf News", "Arabian Business"
  publishedAt: Date;
  area?: string;           // specific Dubai area, or "Dubai" for city-wide
  sentiment: "positive" | "neutral" | "negative";
  demandScore: number;     // 0-100: how strongly this affects STR demand
  category: "tourism" | "events" | "infrastructure" | "geopolitical" | "economic" | "general";
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DemandSignalSchema = new Schema<IDemandSignal>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    headline: { type: String, required: true },
    summary: { type: String, default: "" },
    sourceUrl: { type: String, required: true },
    sourceName: { type: String, default: "Unknown" },
    publishedAt: { type: Date, required: true },
    area: { type: String },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: "neutral",
    },
    demandScore: { type: Number, min: 0, max: 100, default: 50 },
    category: {
      type: String,
      enum: ["tourism", "events", "infrastructure", "geopolitical", "economic", "general"],
      default: "general",
    },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DemandSignalSchema.index({ orgId: 1, publishedAt: -1 });
DemandSignalSchema.index({ sourceUrl: 1 }, { unique: true, sparse: true });

export const DemandSignal: Model<IDemandSignal> =
  mongoose.models.DemandSignal ??
  mongoose.model<IDemandSignal>("DemandSignal", DemandSignalSchema);
