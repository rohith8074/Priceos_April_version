import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IHostawayMessage {
  sender: string;
  text: string;
  timestamp: string;
}

export interface IHostawayConversation extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  hostawayConversationId: string;
  guestName: string;
  guestEmail?: string;
  reservationId?: string;
  messages: IHostawayMessage[];
  dateFrom: string;
  dateTo: string;
  needsReply: boolean;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HostawayMessageSchema = new Schema<IHostawayMessage>({
  sender: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: String, required: true },
}, { _id: false });

const HostawayConversationSchema = new Schema<IHostawayConversation>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  hostawayConversationId: { type: String, required: true },
  guestName: { type: String, default: "Unknown Guest" },
  guestEmail: { type: String },
  reservationId: { type: String },
  messages: { type: [HostawayMessageSchema], default: [] },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  needsReply: { type: Boolean, default: false },
  syncedAt: { type: Date, default: Date.now },
}, { timestamps: true });

HostawayConversationSchema.index({ listingId: 1 });
HostawayConversationSchema.index({ hostawayConversationId: 1 });

export const HostawayConversation: Model<IHostawayConversation> = mongoose.models.hostawayconversations || mongoose.model<IHostawayConversation>("hostawayconversations", HostawayConversationSchema);
