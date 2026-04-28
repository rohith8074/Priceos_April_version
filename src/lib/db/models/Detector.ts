import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDetector extends Document {
  detectorId: string;
  name: string;
  category: string;
  triggerSource: string;
  description?: string;
  isEnabled: boolean;
  lastTriggeredAt?: Date;
  lastSignalsFound: number;
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const DetectorSchema = new Schema<IDetector>({
  detectorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  triggerSource: { type: String, required: true },
  description: { type: String },
  isEnabled: { type: Boolean, default: true },
  lastTriggeredAt: { type: Date },
  lastSignalsFound: { type: Number, default: 0 },
  config: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Detector: Model<IDetector> = mongoose.models.detectors || mongoose.model<IDetector>("detectors", DetectorSchema);
