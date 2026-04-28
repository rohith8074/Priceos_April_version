import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICompetitorReview extends Document {
  marketId: string;
  airbticsListingId: string;
  date: string;
  numReviews: number;
  reviewerIds: string[];
  createdAt: Date;
}

const CompetitorReviewSchema = new Schema<ICompetitorReview>({
  marketId: { type: String, required: true },
  airbticsListingId: { type: String, required: true },
  date: { type: String, required: true },
  numReviews: { type: Number, default: 0 },
  reviewerIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

CompetitorReviewSchema.index({ marketId: 1, airbticsListingId: 1, date: 1 });

export const CompetitorReview: Model<ICompetitorReview> = mongoose.models.competitor_reviews || mongoose.model<ICompetitorReview>("competitor_reviews", CompetitorReviewSchema);
