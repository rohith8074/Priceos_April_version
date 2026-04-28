import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IMarketEvent extends Document {
  orgId: Types.ObjectId;
  listingId?: Types.ObjectId;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  area?: string;
  areas: string[];
  impactLevel: "high" | "medium" | "low";
  upliftPct: number;
  description?: string;
  source: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarketEventSchema = new Schema<IMarketEvent>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  name: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  area: { type: String },
  areas: { type: [String], default: [] },
  impactLevel: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  upliftPct: { type: Number, default: 0.0 },
  description: { type: String },
  source: { type: String, default: "ai_detected" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

MarketEventSchema.index({ orgId: 1, startDate: 1, endDate: 1 });

export const MarketEvent: Model<IMarketEvent> = mongoose.models.market_events || mongoose.model<IMarketEvent>("market_events", MarketEventSchema);
