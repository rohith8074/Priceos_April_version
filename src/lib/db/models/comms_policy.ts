import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IEscalationContact {
  name: string;
  phone: string;
  email?: string;
}

export interface ICommsPolicy extends Document {
  orgId: Types.ObjectId;
  listingId?: Types.ObjectId;
  
  tone: string;
  languages: string[];
  
  discloseAiDefault: boolean;
  discloseAiByChannel: Record<string, boolean>;
  
  autoSendThreshold: number;
  requireApprovalSentimentThreshold: number;
  
  upsellEnabled: boolean;
  upsellTimingHoursBeforeCheckin: number;
  
  escalationContacts: IEscalationContact[];
  
  sendWelcomeOnConfirm: boolean;
  sendAccessDetailsHoursBeforeCheckin: number;
  sendReviewNudgeHoursAfterCheckout: number;
  
  createdAt: Date;
  updatedAt: Date;
}

const EscalationContactSchema = new Schema<IEscalationContact>({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String },
}, { _id: false });

const CommsPolicySchema = new Schema<ICommsPolicy>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  
  tone: { type: String, default: "professional" },
  languages: { type: [String], default: ["en"] },
  
  discloseAiDefault: { type: Boolean, default: true },
  discloseAiByChannel: { type: Schema.Types.Mixed, default: { email: true, internal: false } },
  
  autoSendThreshold: { type: Number, default: 0.85 },
  requireApprovalSentimentThreshold: { type: Number, default: 0.75 },
  
  upsellEnabled: { type: Boolean, default: true },
  upsellTimingHoursBeforeCheckin: { type: Number, default: 48 },
  
  escalationContacts: { type: [EscalationContactSchema], default: [] },
  
  sendWelcomeOnConfirm: { type: Boolean, default: true },
  sendAccessDetailsHoursBeforeCheckin: { type: Number, default: 48 },
  sendReviewNudgeHoursAfterCheckout: { type: Number, default: 24 },
}, { timestamps: true });

CommsPolicySchema.index({ orgId: 1, listingId: 1 });

export const CommsPolicy: Model<ICommsPolicy> = mongoose.models.comms_policies || mongoose.model<ICommsPolicy>("comms_policies", CommsPolicySchema);
