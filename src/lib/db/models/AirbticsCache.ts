import mongoose, { Schema, Document } from "mongoose";

export interface IAirbticsCache extends Document {
  cacheKey: string;
  data: any;
  expiresAt: Date;
  updatedAt: Date;
}

const AirbticsCacheSchema = new Schema<IAirbticsCache>(
  {
    cacheKey: { type: String, required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const AirbticsCache =
  mongoose.models.AirbticsCache ||
  mongoose.model<IAirbticsCache>("AirbticsCache", AirbticsCacheSchema);
