import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICompetitorPerformance extends Document {
  marketId: string;
  airbticsListingId: string;
  date: string;
  dataType: string;
  
  vacantDays: number;
  reservedDays: number;
  occupancy: number;
  revenue: number;
  rateAvg: number;
  bookedRateAvg: number;
  bookingLeadTimeAvg?: number;
  lengthOfStayAvg?: number;
  minNightsAvg?: number;
  nativeBookedRateAvg: number;
  nativeRateAvg: number;
  nativeRevenue: number;
  
  createdAt: Date;
}

const CompetitorPerformanceSchema = new Schema<ICompetitorPerformance>({
  marketId: { type: String, required: true },
  airbticsListingId: { type: String, required: true },
  date: { type: String, required: true },
  dataType: { type: String, default: "historical" },
  
  vacantDays: { type: Number, default: 0 },
  reservedDays: { type: Number, default: 0 },
  occupancy: { type: Number, default: 0.0 },
  revenue: { type: Number, default: 0.0 },
  rateAvg: { type: Number, default: 0.0 },
  bookedRateAvg: { type: Number, default: 0.0 },
  bookingLeadTimeAvg: { type: Number },
  lengthOfStayAvg: { type: Number },
  minNightsAvg: { type: Number },
  nativeBookedRateAvg: { type: Number, default: 0.0 },
  nativeRateAvg: { type: Number, default: 0.0 },
  nativeRevenue: { type: Number, default: 0.0 },
  
  createdAt: { type: Date, default: Date.now },
});

CompetitorPerformanceSchema.index({ marketId: 1, airbticsListingId: 1, date: 1 });
CompetitorPerformanceSchema.index({ marketId: 1, date: 1 });

export const CompetitorPerformance: Model<ICompetitorPerformance> = mongoose.models.competitor_performances || mongoose.model<ICompetitorPerformance>("competitor_performances", CompetitorPerformanceSchema);
