import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IGuestMessage {
  messageId: string;
  direction: "inbound" | "outbound";
  content: string;
  handledBy: "reservation_agent" | "human" | "system";
  intent?: string;
  sentiment?: string;
  confidence?: number;
  discloseAi: boolean;
  status: "draft" | "pending_approval" | "sent" | "failed";
  createdAt: Date;
  sentAt?: Date;
}

export interface IGuestThread extends Document {
  orgId: Types.ObjectId;
  reservationId: string;
  guestId?: string;
  listingId?: Types.ObjectId;
  channel: "email" | "internal" | "hostaway" | "airbnb" | "booking" | "vrbo";
  commsState: "active" | "paused" | "syncing" | "disabled";
  status: "open" | "urgent" | "pending_approval" | "closed";
  assignedTo?: string;
  messages: IGuestMessage[];
  linkedTicketIds: string[];
  openedAt: Date;
  lastActivityAt: Date;
  closedAt?: Date;
  closureReason?: string;
}

const GuestMessageSchema = new Schema<IGuestMessage>({
  messageId: { type: String, required: true },
  direction: { type: String, enum: ["inbound", "outbound"], required: true },
  content: { type: String, required: true },
  handledBy: { type: String, enum: ["reservation_agent", "human", "system"], default: "reservation_agent" },
  intent: { type: String },
  sentiment: { type: String },
  confidence: { type: Number },
  discloseAi: { type: Boolean, default: true },
  status: { type: String, enum: ["draft", "pending_approval", "sent", "failed"], default: "draft" },
  createdAt: { type: Date, default: Date.now },
  sentAt: { type: Date },
}, { _id: false });

const GuestThreadSchema = new Schema<IGuestThread>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  reservationId: { type: String, required: true },
  guestId: { type: String },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  channel: { type: String, enum: ["email", "internal", "hostaway", "airbnb", "booking", "vrbo"], default: "email" },
  commsState: { type: String, enum: ["active", "paused", "syncing", "disabled"], default: "active" },
  status: { type: String, enum: ["open", "urgent", "pending_approval", "closed"], default: "open" },
  assignedTo: { type: String },
  messages: { type: [GuestMessageSchema], default: [] },
  linkedTicketIds: { type: [String], default: [] },
  openedAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  closureReason: { type: String },
}, { timestamps: false });

GuestThreadSchema.index({ orgId: 1, status: 1, lastActivityAt: -1 });
GuestThreadSchema.index({ reservationId: 1 });
GuestThreadSchema.index({ listingId: 1, status: 1 });
GuestThreadSchema.index({ commsState: 1 });

export const GuestThread: Model<IGuestThread> = mongoose.models.guest_threads || mongoose.model<IGuestThread>("guest_threads", GuestThreadSchema);
