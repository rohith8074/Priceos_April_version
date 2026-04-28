import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISource extends Document {
  sourceId: string;
  name: string;
  description?: string;
  iconName: string;
  schedule: string;
  scheduleLabel: string;
  isEnabled: boolean;
  lastRunAt?: Date;
  lastRunStatus: "success" | "error" | "running" | "idle";
  lastRunDurationMs?: number;
  lastRunMetric?: string;
  nextRunAt?: Date;
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SourceSchema = new Schema<ISource>({
  sourceId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  iconName: { type: String, default: "Database" },
  schedule: { type: String, default: "0 */4 * * *" },
  scheduleLabel: { type: String, default: "Every 4 hours" },
  isEnabled: { type: Boolean, default: true },
  lastRunAt: { type: Date },
  lastRunStatus: { type: String, enum: ["success", "error", "running", "idle"], default: "idle" },
  lastRunDurationMs: { type: Number },
  lastRunMetric: { type: String },
  nextRunAt: { type: Date },
  config: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Source: Model<ISource> = mongoose.models.sources || mongoose.model<ISource>("sources", SourceSchema);
