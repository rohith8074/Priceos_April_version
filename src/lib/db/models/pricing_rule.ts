import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type RuleType = "SEASON" | "EVENT" | "ADMIN_BLOCK" | "LOS_DISCOUNT";
export type RuleCategory = "GUARDRAILS" | "SEASONS" | "LEAD_TIME" | "GAP_LOGIC" | "LOS_DISCOUNTS" | "DATE_OVERRIDES" | "OCCUPANCY";

export interface IPricingRule extends Document {
  orgId: Types.ObjectId;
  listingId?: Types.ObjectId;
  groupId?: Types.ObjectId;
  scope: "listing" | "group";
  ruleType: RuleType;
  ruleCategory?: RuleCategory;
  name: string;
  enabled: boolean;
  priority: number;
  
  // Conditions
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string;   // "YYYY-MM-DD"
  daysOfWeek?: number[];
  minNights?: number;
  
  // Actions
  priceOverride?: number;
  priceAdjPct?: number;
  minPriceOverride?: number;
  maxPriceOverride?: number;
  minStayOverride?: number;
  
  isBlocked: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  suspendLastMinute: boolean;
  suspendGapFill: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

const PricingRuleSchema = new Schema<IPricingRule>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  groupId: { type: Schema.Types.ObjectId, ref: "property_groups" },
  scope: { type: String, enum: ["listing", "group"], default: "listing" },
  ruleType: { type: String, required: true },
  ruleCategory: { type: String },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  
  startDate: { type: String },
  endDate: { type: String },
  daysOfWeek: { type: [Number] },
  minNights: { type: Number },
  
  priceOverride: { type: Number },
  priceAdjPct: { type: Number },
  minPriceOverride: { type: Number },
  maxPriceOverride: { type: Number },
  minStayOverride: { type: Number },
  
  isBlocked: { type: Boolean, default: false },
  closedToArrival: { type: Boolean, default: false },
  closedToDeparture: { type: Boolean, default: false },
  suspendLastMinute: { type: Boolean, default: false },
  suspendGapFill: { type: Boolean, default: false },
}, { timestamps: true });

PricingRuleSchema.index({ listingId: 1, enabled: 1 });
PricingRuleSchema.index({ groupId: 1, enabled: 1 });

export const PricingRule: Model<IPricingRule> = mongoose.models.pricing_rules || mongoose.model<IPricingRule>("pricing_rules", PricingRuleSchema);
