import mongoose, { Document, Schema, Model } from "mongoose";

// System state machine — mirrors PRD Part 3
// Connected → Observing → Simulating → Active ↔ Paused
export type SystemState = "connected" | "observing" | "simulating" | "active" | "paused";

// Valid transitions (from → allowed tos)
export const SYSTEM_STATE_TRANSITIONS: Record<SystemState, SystemState[]> = {
  connected:  ["observing"],
  observing:  ["simulating", "paused"],
  simulating: ["active", "observing", "paused"],
  active:     ["paused"],
  paused:     ["observing"],   // resume goes back to Observing, not Active
};

export interface IOrganization extends Document {
  name: string;
  email: string;
  passwordHash: string;
  refreshToken?: string;
  role: "owner" | "admin" | "viewer";
  isApproved: boolean;
  fullName?: string;
  hostawayApiKey?: string;
  hostawayAccountId?: string;
  marketCode: string;
  currency: string;
  timezone: string;
  plan: "starter" | "growth" | "scale";
  systemState: SystemState;
  systemStateSince?: Date;
  pauseReason?: string;
  onboarding: {
    step: "connect" | "select" | "market" | "strategy" | "complete";
    selectedListingIds: string[];
    activatedListingIds: string[];
    completedAt?: Date;
    listings?: any[];
  };
  settings: {
    guardrails: {
      maxSingleDayChangePct: number;
      autoApproveThreshold: number;
      absoluteFloorMultiplier: number;
      absoluteCeilingMultiplier: number;
    };
    automation: {
      autoPushApproved: boolean;
      dailyPipelineRun: boolean;
    };
    overrides: {
      currency?: string;
      timezone?: string;
      weekendDefinition?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrgSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    refreshToken: { type: String },
    role: { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
    isApproved: { type: Boolean, default: false },
    fullName: { type: String },
    hostawayApiKey: { type: String },
    hostawayAccountId: { type: String },
    marketCode: { type: String, default: "UAE_DXB" },
    currency: { type: String, default: "AED" },
    timezone: { type: String, default: "Asia/Dubai" },
    plan: { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
    systemState: {
      type: String,
      enum: ["connected", "observing", "simulating", "active", "paused"],
      default: "connected",
    },
    systemStateSince: { type: Date },
    pauseReason: { type: String },
    onboarding: {
      step: { type: String, enum: ["connect", "select", "market", "strategy", "complete"], default: "connect" },
      selectedListingIds: [{ type: String }],
      activatedListingIds: [{ type: String }],
      completedAt: { type: Date },
      listings: [{ type: Schema.Types.Mixed }],
    },
    settings: {
      guardrails: {
        maxSingleDayChangePct: { type: Number, default: 15 },
        autoApproveThreshold: { type: Number, default: 5 },
        absoluteFloorMultiplier: { type: Number, default: 0.5 },
        absoluteCeilingMultiplier: { type: Number, default: 3.0 },
      },
      automation: {
        autoPushApproved: { type: Boolean, default: false },
        dailyPipelineRun: { type: Boolean, default: true },
      },
      overrides: {
        currency: { type: String },
        timezone: { type: String },
        weekendDefinition: { type: String },
      },
    },
  },
  { timestamps: true }
);

export const Organization: Model<IOrganization> =
  mongoose.models.Organization ??
  mongoose.model<IOrganization>("Organization", OrgSchema);
