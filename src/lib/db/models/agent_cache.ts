import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AgentName =
  | "property"
  | "booking"
  | "market_research"
  | "price_guard"
  | "anomaly";

export interface IAgentCache extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  dateFrom: string;
  dateTo: string;
  agentName: AgentName;
  output: Record<string, any>;
  computedAt: Date;
  expiresAt: Date;
  lyzrSessionId: string;
  lyzrJobId: string;
  status: "complete" | "failed";
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentCacheSchema = new Schema<IAgentCache>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  agentName: {
    type: String,
    enum: ["property", "booking", "market_research", "price_guard", "anomaly"],
    required: true,
  },
  output: { type: Schema.Types.Mixed, required: true },
  computedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  lyzrSessionId: { type: String, required: true },
  lyzrJobId: { type: String, required: true },
  status: { type: String, enum: ["complete", "failed"], default: "complete" },
  errorMessage: { type: String },
}, { timestamps: true });

// Upsert lookup: latest cache for (org, listing, scope, agent)
AgentCacheSchema.index(
  { orgId: 1, listingId: 1, dateFrom: 1, dateTo: 1, agentName: 1 },
  { unique: true }
);
// TTL: documents auto-delete when expiresAt passes
AgentCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AgentCache: Model<IAgentCache> =
  mongoose.models.agent_caches ||
  mongoose.model<IAgentCache>("agent_caches", AgentCacheSchema);
