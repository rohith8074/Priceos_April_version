import mongoose, { Schema, Document, Model } from "mongoose";

export type SystemState = "connected" | "observing" | "simulating" | "active" | "paused";

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
  hostawayToken?: string;
  hostawayTokenExpiresAt?: Date;
  hostawayWebhookId?: string;
  hostawayWebhookUrl?: string;
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
    comms: {
      liveMode: boolean;
      autoReply: boolean;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  refreshToken: { type: String },
  role: { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
  isApproved: { type: Boolean, default: false },
  fullName: { type: String },
  hostawayApiKey: { type: String },
  hostawayAccountId: { type: String },
  hostawayToken: { type: String },
  hostawayTokenExpiresAt: { type: Date },
  hostawayWebhookId: { type: String },
  hostawayWebhookUrl: { type: String },
  marketCode: { type: String, default: "UAE_DXB" },
  currency: { type: String, default: "AED" },
  timezone: { type: String, default: "Asia/Dubai" },
  plan: { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
  systemState: { type: String, enum: ["connected", "observing", "simulating", "active", "paused"], default: "connected" },
  systemStateSince: { type: Date },
  pauseReason: { type: String },
  onboarding: {
    step: { type: String, enum: ["connect", "select", "market", "strategy", "complete"], default: "connect" },
    selectedListingIds: { type: [String], default: [] },
    activatedListingIds: { type: [String], default: [] },
    completedAt: { type: Date },
    listings: { type: Schema.Types.Mixed },
  },
  settings: {
    guardrails: {
      maxSingleDayChangePct: { type: Number, default: 15.0 },
      autoApproveThreshold: { type: Number, default: 5.0 },
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
    comms: {
      liveMode: { type: Boolean, default: false },
      autoReply: { type: Boolean, default: false },
    },
  },
}, { timestamps: true });

export const Organization: Model<IOrganization> = mongoose.models.organizations || mongoose.model<IOrganization>("organizations", OrganizationSchema);
