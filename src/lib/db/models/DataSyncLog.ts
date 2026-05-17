import mongoose, { Document, Schema, Model } from "mongoose";

/**
 * DataSyncLog — immutable audit log of every cron sync run.
 *
 * Tracks SERP budget consumption across all jobs so we stay within
 * the 250 searches/month free-tier limit.
 */
export interface IDataSyncLog extends Document {
  orgId: mongoose.Types.ObjectId;
  jobName: string;         // e.g. "sync-events", "sync-news", "sync-comp-listings"
  startedAt: Date;
  completedAt?: Date;
  status: "running" | "complete" | "error" | "skipped";
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  serpCallsUsed: number;   // number of SERP API calls consumed in this run
  errorMessage?: string;
  sources: Record<string, number>; // { Eventbrite: 12, SERP_Events: 8, ... }
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const DataSyncLogSchema = new Schema<IDataSyncLog>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    jobName: { type: String, required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    status: {
      type: String,
      enum: ["running", "complete", "error", "skipped"],
      default: "running",
    },
    recordsInserted: { type: Number, default: 0 },
    recordsUpdated: { type: Number, default: 0 },
    recordsSkipped: { type: Number, default: 0 },
    serpCallsUsed: { type: Number, default: 0 },
    errorMessage: { type: String },
    sources: { type: Schema.Types.Mixed, default: {} },
    durationMs: { type: Number },
  },
  { timestamps: true }
);

DataSyncLogSchema.index({ orgId: 1, jobName: 1, startedAt: -1 });

export const DataSyncLog: Model<IDataSyncLog> =
  mongoose.models.DataSyncLog ??
  mongoose.model<IDataSyncLog>("DataSyncLog", DataSyncLogSchema);
