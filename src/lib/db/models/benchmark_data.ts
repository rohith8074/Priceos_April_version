import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IComp {
  name: string;
  source: string;
  sourceUrl?: string;
  rating?: number;
  reviews?: number;
  avgRate: number;
  weekdayRate?: number;
  weekendRate?: number;
  minRate?: number;
  maxRate?: number;
}

export interface IBenchmarkData extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  p25Rate?: number;
  p50Rate?: number;
  p75Rate?: number;
  p90Rate?: number;
  avgWeekday?: number;
  avgWeekend?: number;
  yourPrice?: number;
  percentile?: number;
  verdict?: "UNDERPRICED" | "FAIR" | "SLIGHTLY_ABOVE" | "OVERPRICED";
  rateTrend?: "rising" | "stable" | "falling";
  trendPct?: number;
  recommendedWeekday?: number;
  recommendedWeekend?: number;
  recommendedEvent?: number;
  reasoning?: string;
  comps: IComp[];
  createdAt: Date;
  updatedAt: Date;
}

const CompSchema = new Schema<IComp>({
  name: { type: String, required: true },
  source: { type: String, required: true },
  sourceUrl: { type: String },
  rating: { type: Number },
  reviews: { type: Number },
  avgRate: { type: Number, required: true },
  weekdayRate: { type: Number },
  weekendRate: { type: Number },
  minRate: { type: Number },
  maxRate: { type: Number },
}, { _id: false });

const BenchmarkDataSchema = new Schema<IBenchmarkData>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  p25Rate: { type: Number },
  p50Rate: { type: Number },
  p75Rate: { type: Number },
  p90Rate: { type: Number },
  avgWeekday: { type: Number },
  avgWeekend: { type: Number },
  yourPrice: { type: Number },
  percentile: { type: Number },
  verdict: { type: String, enum: ["UNDERPRICED", "FAIR", "SLIGHTLY_ABOVE", "OVERPRICED"] },
  rateTrend: { type: String, enum: ["rising", "stable", "falling"] },
  trendPct: { type: Number },
  recommendedWeekday: { type: Number },
  recommendedWeekend: { type: Number },
  recommendedEvent: { type: Number },
  reasoning: { type: String },
  comps: { type: [CompSchema], default: [] },
}, { timestamps: true });

BenchmarkDataSchema.index({ listingId: 1, dateFrom: 1, dateTo: 1 });

export const BenchmarkData: Model<IBenchmarkData> = mongoose.models.benchmark_data || mongoose.model<IBenchmarkData>("benchmark_data", BenchmarkDataSchema);
