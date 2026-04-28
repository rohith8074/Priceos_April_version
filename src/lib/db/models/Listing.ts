import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface OccupancyWindowProfile {
  startDay: number;
  endDay: number;
  highThresholdPct: number;
  highAdjPct: number;
  lowThresholdPct: number;
  lowAdjPct: number;
}

export interface GroupOccupancyProfile {
  startDay: number;
  endDay: number;
  occupancyPct: number;
  sampleSize: number;
  groupIds: string[];
}

export interface IListing extends Document {
  orgId: Types.ObjectId;
  hostawayId?: string;
  name: string;
  city: string;
  countryCode: string;
  area: string;
  bedroomsNumber: number;
  bathroomsNumber: number;
  propertyTypeId: number;
  price: number;
  currencyCode: string;
  personCapacity?: number;
  amenities: string[];
  address?: string;
  priceFloor: number;
  floorReasoning?: string;
  priceCeiling: number;
  ceilingReasoning?: string;
  guardrailsSource: "manual" | "ai" | "market_template";
  
  // Last Minute
  lastMinuteEnabled: boolean;
  lastMinuteDaysOut: number;
  lastMinuteDiscountPct: number;
  lastMinuteMinStay?: number;
  
  // Far Out
  farOutEnabled: boolean;
  farOutDaysOut: number;
  farOutMarkupPct: number;
  farOutMinStay?: number;
  farOutMinPrice: number;
  
  // DOW pricing
  dowPricingEnabled: boolean;
  dowDays: number[];
  dowPriceAdjPct: number;
  dowMinStay?: number;
  
  // Gap prevention
  gapPreventionEnabled: boolean;
  minFragmentThreshold: number;
  
  // Gap fill
  gapFillEnabled: boolean;
  gapFillLengthMin: number;
  gapFillLengthMax: number;
  gapFillDiscountPct: number;
  gapFillDiscountWeekdayPct: number;
  gapFillDiscountWeekendPct: number;
  gapFillMaxDaysUntilCheckin: number;
  gapFillOverrideCico: boolean;
  adjacentAdjustmentEnabled: boolean;
  adjacentAdjustmentPct: number;
  adjacentTurnoverCost: number;
  
  // Check-in/out restrictions
  allowedCheckinDays: number[];
  allowedCheckoutDays: number[];
  lowestMinStayAllowed: number;
  defaultMaxStay: number;
  
  // Occupancy-based adjustments
  occupancyEnabled: boolean;
  occupancyTargetPct: number;
  occupancyHighThresholdPct: number;
  occupancyHighAdjPct: number;
  occupancyLowThresholdPct: number;
  occupancyLowAdjPct: number;
  occupancyLookbackDays: number;
  occupancyWindowProfiles: OccupancyWindowProfile[];
  useGroupOccupancyProfile: boolean;
  groupOccupancyWeightPct: number;
  groupOccupancyProfiles: GroupOccupancyProfile[];
  basePriceSource: "history_1y" | "benchmark" | "hostaway";
  basePriceConfidencePct: number;
  basePriceSampleSize: number;
  basePriceLastComputedAt?: Date;
  
  // Weekend minimum pricing
  weekendMinPrice: number;
  weekendDays: number[];
  
  // Gradual last-minute discount curve
  lastMinuteRampEnabled: boolean;
  lastMinuteRampDays: number;
  lastMinuteMaxDiscountPct: number;
  lastMinuteMinDiscountPct: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OccupancyWindowProfileSchema = new Schema<OccupancyWindowProfile>({
  startDay: { type: Number, required: true },
  endDay: { type: Number, required: true },
  highThresholdPct: { type: Number, required: true },
  highAdjPct: { type: Number, required: true },
  lowThresholdPct: { type: Number, required: true },
  lowAdjPct: { type: Number, required: true },
}, { _id: false });

const GroupOccupancyProfileSchema = new Schema<GroupOccupancyProfile>({
  startDay: { type: Number, required: true },
  endDay: { type: Number, required: true },
  occupancyPct: { type: Number, required: true },
  sampleSize: { type: Number, required: true },
  groupIds: { type: [String], default: [] },
}, { _id: false });

const ListingSchema = new Schema<IListing>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  hostawayId: { type: String },
  name: { type: String, required: true },
  city: { type: String, default: "" },
  countryCode: { type: String, default: "" },
  area: { type: String, default: "" },
  bedroomsNumber: { type: Number, default: 1 },
  bathroomsNumber: { type: Number, default: 1 },
  propertyTypeId: { type: Number, default: 0 },
  price: { type: Number, required: true },
  currencyCode: { type: String, default: "AED" },
  personCapacity: { type: Number },
  amenities: { type: [String], default: [] },
  address: { type: String },
  priceFloor: { type: Number, default: 0 },
  floorReasoning: { type: String },
  priceCeiling: { type: Number, default: 0 },
  ceilingReasoning: { type: String },
  guardrailsSource: { type: String, enum: ["manual", "ai", "market_template"], default: "manual" },
  
  lastMinuteEnabled: { type: Boolean, default: false },
  lastMinuteDaysOut: { type: Number, default: 7 },
  lastMinuteDiscountPct: { type: Number, default: 15 },
  lastMinuteMinStay: { type: Number },
  
  farOutEnabled: { type: Boolean, default: false },
  farOutDaysOut: { type: Number, default: 90 },
  farOutMarkupPct: { type: Number, default: 10 },
  farOutMinStay: { type: Number },
  farOutMinPrice: { type: Number, default: 0 },
  
  dowPricingEnabled: { type: Boolean, default: false },
  dowDays: { type: [Number], default: [4, 5] },
  dowPriceAdjPct: { type: Number, default: 20 },
  dowMinStay: { type: Number },
  
  gapPreventionEnabled: { type: Boolean, default: true },
  minFragmentThreshold: { type: Number, default: 3 },
  
  gapFillEnabled: { type: Boolean, default: false },
  gapFillLengthMin: { type: Number, default: 1 },
  gapFillLengthMax: { type: Number, default: 3 },
  gapFillDiscountPct: { type: Number, default: 10 },
  gapFillDiscountWeekdayPct: { type: Number, default: 0 },
  gapFillDiscountWeekendPct: { type: Number, default: 0 },
  gapFillMaxDaysUntilCheckin: { type: Number, default: 30 },
  gapFillOverrideCico: { type: Boolean, default: true },
  adjacentAdjustmentEnabled: { type: Boolean, default: false },
  adjacentAdjustmentPct: { type: Number, default: 0 },
  adjacentTurnoverCost: { type: Number, default: 0 },
  
  allowedCheckinDays: { type: [Number], default: [1, 1, 1, 1, 1, 1, 1] },
  allowedCheckoutDays: { type: [Number], default: [1, 1, 1, 1, 1, 1, 1] },
  lowestMinStayAllowed: { type: Number, default: 1 },
  defaultMaxStay: { type: Number, default: 365 },
  
  occupancyEnabled: { type: Boolean, default: false },
  occupancyTargetPct: { type: Number, default: 75 },
  occupancyHighThresholdPct: { type: Number, default: 85 },
  occupancyHighAdjPct: { type: Number, default: 15 },
  occupancyLowThresholdPct: { type: Number, default: 50 },
  occupancyLowAdjPct: { type: Number, default: -10 },
  occupancyLookbackDays: { type: Number, default: 30 },
  occupancyWindowProfiles: { type: [OccupancyWindowProfileSchema], default: [] },
  useGroupOccupancyProfile: { type: Boolean, default: true },
  groupOccupancyWeightPct: { type: Number, default: 50 },
  groupOccupancyProfiles: { type: [GroupOccupancyProfileSchema], default: [] },
  basePriceSource: { type: String, enum: ["history_1y", "benchmark", "hostaway"], default: "hostaway" },
  basePriceConfidencePct: { type: Number, default: 0 },
  basePriceSampleSize: { type: Number, default: 0 },
  basePriceLastComputedAt: { type: Date },
  
  weekendMinPrice: { type: Number, default: 0 },
  weekendDays: { type: [Number], default: [4, 5] },
  
  lastMinuteRampEnabled: { type: Boolean, default: false },
  lastMinuteRampDays: { type: Number, default: 15 },
  lastMinuteMaxDiscountPct: { type: Number, default: 30 },
  lastMinuteMinDiscountPct: { type: Number, default: 5 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const Listing: Model<IListing> = mongoose.models.listings || mongoose.model<IListing>("listings", ListingSchema);
