import mongoose, { Document, Schema, Model } from "mongoose";

export interface IJob extends Document {
  jobId: string;
  status: "running" | "complete" | "error";
  result: any;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["running", "complete", "error"], default: "running" },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export const Job: Model<IJob> =
  mongoose.models.Job ?? mongoose.model<IJob>("Job", JobSchema);
