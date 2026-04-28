import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAirbticsCache extends Document {
  cacheKey: string;
  data: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AirbticsCacheSchema = new Schema<IAirbticsCache>({
  cacheKey: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

AirbticsCacheSchema.index({ cacheKey: 1 });
AirbticsCacheSchema.index({ expiresAt: 1 });

export const AirbticsCache: Model<IAirbticsCache> = mongoose.models.airbtics_caches || mongoose.model<IAirbticsCache>("airbtics_caches", AirbticsCacheSchema);
