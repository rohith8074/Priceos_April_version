import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ISourceRun extends Document {
  orgId: Types.ObjectId;
  sourceId: string;
  status: "running" | "success" | "error";
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  recordsProcessed?: number;
  signalsGenerated?: number;
  error?: string;
  logs: string[];
  triggeredBy: "manual" | "schedule" | "system";
  createdAt: Date;
  updatedAt: Date;
}

const SourceRunSchema = new Schema<ISourceRun>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  sourceId: { type: String, required: true },
  status: { type: String, enum: ["running", "success", "error"], default: "running" },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  durationMs: { type: Number },
  recordsProcessed: { type: Number },
  signalsGenerated: { type: Number },
  error: { type: String },
  logs: { type: [String], default: [] },
  triggeredBy: { type: String, enum: ["manual", "schedule", "system"], default: "manual" },
}, { timestamps: true });

SourceRunSchema.index({ orgId: 1 });
SourceRunSchema.index({ sourceId: 1 });
SourceRunSchema.index({ startedAt: -1 });

export const SourceRun: Model<ISourceRun> = mongoose.models.sourceruns || mongoose.model<ISourceRun>("sourceruns", SourceRunSchema);
