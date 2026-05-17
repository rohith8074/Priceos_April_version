import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { AgentName } from "./agent_cache";

export type AgentPhaseStatus = "pending" | "running" | "complete" | "failed";

export interface IAgentPhaseState {
  agentName: AgentName;
  status: AgentPhaseStatus;
  lyzrSessionId?: string;
  lyzrJobId?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface IPrecomputeJob extends Document {
  jobId: string;
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  overallStatus: "running" | "complete" | "partial" | "failed";
  agentStates: IAgentPhaseState[];
  startedAt: Date;
  completedAt?: Date;
  cacheHit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AgentPhaseStateSchema = new Schema<IAgentPhaseState>({
  agentName: {
    type: String,
    enum: ["property", "booking", "market_research", "price_guard", "anomaly"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "running", "complete", "failed"],
    default: "pending",
  },
  lyzrSessionId: { type: String },
  lyzrJobId: { type: String },
  startedAt: { type: Date },
  completedAt: { type: Date },
  errorMessage: { type: String },
}, { _id: false });

const PrecomputeJobSchema = new Schema<IPrecomputeJob>({
  jobId: { type: String, required: true, unique: true },
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  overallStatus: {
    type: String,
    enum: ["running", "complete", "partial", "failed"],
    default: "running",
  },
  agentStates: { type: [AgentPhaseStateSchema], default: [] },
  startedAt: { type: Date, required: true, default: Date.now },
  completedAt: { type: Date },
  cacheHit: { type: Boolean, default: false },
}, { timestamps: true });

PrecomputeJobSchema.index({ orgId: 1, listingId: 1, dateFrom: 1, dateTo: 1, startedAt: -1 });

export const PrecomputeJob: Model<IPrecomputeJob> =
  mongoose.models.precompute_jobs ||
  mongoose.model<IPrecomputeJob>("precompute_jobs", PrecomputeJobSchema);
