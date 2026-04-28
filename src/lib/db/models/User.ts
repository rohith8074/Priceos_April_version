import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  refreshToken?: string;
  orgId?: Types.ObjectId;
  role: "owner" | "admin" | "viewer";
  isApproved: boolean;
  fullName?: string;
  plan: "starter" | "growth" | "scale";
  onboardingStep?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  refreshToken: { type: String },
  orgId: { type: Schema.Types.ObjectId, ref: "organizations" },
  role: { type: String, enum: ["owner", "admin", "viewer"], default: "owner" },
  isApproved: { type: Boolean, default: true },
  fullName: { type: String },
  plan: { type: String, enum: ["starter", "growth", "scale"], default: "starter" },
  onboardingStep: { type: String, default: "complete" },
}, { timestamps: true });

export const User: Model<IUser> = mongoose.models.users || mongoose.model<IUser>("users", UserSchema);
