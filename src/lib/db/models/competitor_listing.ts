import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICompetitorListing extends Document {
  marketId: string;
  airbticsListingId: string;
  listingName: string;
  latitude: number;
  longitude: number;
  bedrooms: number;
  beds?: number;
  baths?: number;
  guests?: number;
  hostName: string;
  roomType: string;
  amenities: string[];
  ratingOverall?: number;
  numReviews: number;
  currency: string;

  // TTM (trailing twelve months) snapshot
  ttmOccupancy?: number;
  ttmAvgRateNative?: number;
  ttmRevenueNative?: number;

  // L90D (last 90 days) snapshot
  l90dOccupancy?: number;
  l90dAvgRateNative?: number;

  createdAt: Date;
}

const CompetitorListingSchema = new Schema<ICompetitorListing>({
  marketId: { type: String, required: true },
  airbticsListingId: { type: String, required: true },
  listingName: { type: String, default: "" },
  latitude: { type: Number, default: 0.0 },
  longitude: { type: Number, default: 0.0 },
  bedrooms: { type: Number, default: 1 },
  beds: { type: Number },
  baths: { type: Number },
  guests: { type: Number },
  hostName: { type: String, default: "" },
  roomType: { type: String, default: "" },
  amenities: { type: [String], default: [] },
  ratingOverall: { type: Number },
  numReviews: { type: Number, default: 0 },
  currency: { type: String, default: "AED" },

  ttmOccupancy: { type: Number },
  ttmAvgRateNative: { type: Number },
  ttmRevenueNative: { type: Number },

  l90dOccupancy: { type: Number },
  l90dAvgRateNative: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

CompetitorListingSchema.index({ marketId: 1, airbticsListingId: 1 });
CompetitorListingSchema.index({ marketId: 1, bedrooms: 1 });
CompetitorListingSchema.index({ latitude: 1, longitude: 1 });

export const CompetitorListing: Model<ICompetitorListing> = mongoose.models.competitor_listings || mongoose.model<ICompetitorListing>("competitor_listings", CompetitorListingSchema);
