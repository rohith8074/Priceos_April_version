import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type InsightCategory = "BOOKING_PACE" | "LEAD_TIME" | "CANCELLATION_RISK" | "OCCUPANCY" | "GAP_FILL" | "LOS_OPTIMIZATION" | "COMPETITOR_RATE" | "DAY_OF_WEEK" | "REVIEW_SCORE" | "EVENT_IMPACT" | "SEASONAL_SHIFT" | "CHANNEL_MIX";
export type InsightStatus = "pending" | "approved" | "modified" | "rejected" | "snoozed" | "superseded";

export interface IInsightAction {
  type: "price_increase" | "price_decrease" | "gap_fill" | "min_stay_change" | "block" | "advisory";
  adjustPct?: number;
  absolutePrice?: number;
  dateRange?: Record<string, string>;
  scope?: string;
  data?: Record<string, any>;
}

export interface IInsight extends Document {
  orgId: Types.ObjectId;
  listingId?: Types.ObjectId;
  category: InsightCategory;
  severity: "high" | "medium" | "low";
  status: InsightStatus;
  title: string;
  summary?: string;
  confidence: number;
  action?: IInsightAction;
  modifiedAction?: IInsightAction;
  resolvedBy?: string;
  resolvedAt?: Date;
  snoozeUntil?: Date;
  pushedAt?: Date;
  detectorKey?: string;
  signalData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const InsightActionSchema = new Schema<IInsightAction>({
  type: { type: String, required: true },
  adjustPct: { type: Number },
  absolutePrice: { type: Number },
  dateRange: { type: Schema.Types.Mixed },
  scope: { type: String },
  data: { type: Schema.Types.Mixed }
}, { _id: false });

const InsightSchema = new Schema<IInsight>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  category: { type: String, required: true },
  severity: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  status: { type: String, enum: ["pending", "approved", "modified", "rejected", "snoozed", "superseded"], default: "pending" },
  title: { type: String, required: true },
  summary: { type: String },
  confidence: { type: Number, default: 0.7 },
  action: { type: InsightActionSchema },
  modifiedAction: { type: InsightActionSchema },
  resolvedBy: { type: String },
  resolvedAt: { type: Date },
  snoozeUntil: { type: Date },
  pushedAt: { type: Date },
  detectorKey: { type: String },
  signalData: { type: Schema.Types.Mixed },
}, { timestamps: true });

InsightSchema.index({ orgId: 1, status: 1, createdAt: -1 });

export const Insight: Model<IInsight> = mongoose.models.insights || mongoose.model<IInsight>("insights", InsightSchema);
