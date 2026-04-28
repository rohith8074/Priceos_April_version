import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IEngineRun extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  startedAt: Date;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  errorMessage?: string;
  daysChanged?: number;
  durationMs?: number;
  batchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EngineRunSchema = new Schema<IEngineRun>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  startedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["SUCCESS", "FAILED", "RUNNING"], default: "RUNNING" },
  errorMessage: { type: String },
  daysChanged: { type: Number },
  durationMs: { type: Number },
  batchId: { type: String },
}, { timestamps: true });

EngineRunSchema.index({ orgId: 1 });

export const EngineRun: Model<IEngineRun> = mongoose.models.engine_runs || mongoose.model<IEngineRun>("engine_runs", EngineRunSchema);
