import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPropertyGroup extends Document {
  orgId: Types.ObjectId;
  name: string;
  description?: string;
  color: string;
  listingIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const PropertyGroupSchema = new Schema<IPropertyGroup>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  name: { type: String, required: true },
  description: { type: String },
  color: { type: String, default: "#6366f1" },
  listingIds: { type: [{ type: Schema.Types.ObjectId, ref: "listings" }], default: [] },
}, { timestamps: true });

PropertyGroupSchema.index({ orgId: 1 });

export const PropertyGroup: Model<IPropertyGroup> = mongoose.models.propertygroups || mongoose.model<IPropertyGroup>("propertygroups", PropertyGroupSchema);
