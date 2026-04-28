import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISeasonalPattern {
  month: number;
  demandScore: number;
  ratePremiumPct: number;
  notes?: string;
}

export interface IGuardrailDefaults {
  maxSingleDayChangePct: number;
  autoApproveThreshold: number;
  absoluteFloorMultiplier: number;
  absoluteCeilingMultiplier: number;
}

export interface IEventApiConfig {
  ticketmasterCity?: string;
  eventbriteCity?: string;
  customKeywords: string[];
}

export interface IRegulatoryFlags {
  hasNightCap: boolean;
  nightCapPerYear?: number;
  requiresLicence: boolean;
  licenceFieldLabel?: string;
}

export interface IMarketTemplate extends Document {
  marketCode: string;
  displayName: string;
  country: string;
  currency: string;
  timezone: string;
  weekendDefinition: "thu_fri" | "fri_sat" | "sat_sun";
  flag: string;
  guardrailDefaults: IGuardrailDefaults;
  seasonalPatterns: ISeasonalPattern[];
  eventApiConfig: IEventApiConfig;
  regulatoryFlags?: IRegulatoryFlags;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SeasonalPatternSchema = new Schema<ISeasonalPattern>({
  month: { type: Number, required: true },
  demandScore: { type: Number, required: true },
  ratePremiumPct: { type: Number, required: true },
  notes: { type: String },
}, { _id: false });

const GuardrailDefaultsSchema = new Schema<IGuardrailDefaults>({
  maxSingleDayChangePct: { type: Number, default: 15.0 },
  autoApproveThreshold: { type: Number, default: 5.0 },
  absoluteFloorMultiplier: { type: Number, default: 0.5 },
  absoluteCeilingMultiplier: { type: Number, default: 3.0 },
}, { _id: false });

const EventApiConfigSchema = new Schema<IEventApiConfig>({
  ticketmasterCity: { type: String },
  eventbriteCity: { type: String },
  customKeywords: { type: [String], default: [] },
}, { _id: false });

const RegulatoryFlagsSchema = new Schema<IRegulatoryFlags>({
  hasNightCap: { type: Boolean, default: false },
  nightCapPerYear: { type: Number },
  requiresLicence: { type: Boolean, default: false },
  licenceFieldLabel: { type: String },
}, { _id: false });

const MarketTemplateSchema = new Schema<IMarketTemplate>({
  marketCode: { type: String, required: true },
  displayName: { type: String, required: true },
  country: { type: String, required: true },
  currency: { type: String, required: true },
  timezone: { type: String, required: true },
  weekendDefinition: { type: String, enum: ["thu_fri", "fri_sat", "sat_sun"], required: true },
  flag: { type: String, required: true },
  guardrailDefaults: { type: GuardrailDefaultsSchema, default: () => ({}) },
  seasonalPatterns: { type: [SeasonalPatternSchema], default: [] },
  eventApiConfig: { type: EventApiConfigSchema, default: () => ({}) },
  regulatoryFlags: { type: RegulatoryFlagsSchema },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

MarketTemplateSchema.index({ marketCode: 1 });

export const MarketTemplate: Model<IMarketTemplate> = mongoose.models.markettemplates || mongoose.model<IMarketTemplate>("markettemplates", MarketTemplateSchema);
