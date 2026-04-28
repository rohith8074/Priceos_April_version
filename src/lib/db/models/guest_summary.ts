import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IGuestSummary extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  sentiment: "Positive" | "Neutral" | "Needs Attention";
  themes: string[];
  actionItems: string[];
  bulletPoints: string[];
  totalConversations: number;
  needsReplyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const GuestSummarySchema = new Schema<IGuestSummary>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  sentiment: { type: String, enum: ["Positive", "Neutral", "Needs Attention"], default: "Neutral" },
  themes: { type: [String], default: [] },
  actionItems: { type: [String], default: [] },
  bulletPoints: { type: [String], default: [] },
  totalConversations: { type: Number, default: 0 },
  needsReplyCount: { type: Number, default: 0 },
}, { timestamps: true });

GuestSummarySchema.index({ orgId: 1, listingId: 1 });

export const GuestSummary: Model<IGuestSummary> = mongoose.models.guestsummaries || mongoose.model<IGuestSummary>("guestsummaries", GuestSummarySchema);
