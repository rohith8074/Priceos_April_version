import mongoose, { Document, Schema, Model } from "mongoose";

export interface IHostawayMessage {
  sender: string;
  text: string;
  timestamp: string;
}

export interface IHostawayConversation extends Document {
  orgId: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  hostawayConversationId: string;
  guestName: string;
  guestEmail?: string;
  reservationId?: string;
  channelName?: string;
  listingMapId?: number;
  messages: IHostawayMessage[];
  dateFrom: string;
  dateTo: string;
  needsReply: boolean;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HostawayConversationSchema = new Schema<IHostawayConversation>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing" },
    hostawayConversationId: { type: String, required: true },
    guestName: { type: String, default: "Unknown Guest" },
    guestEmail: { type: String },
    reservationId: { type: String },
    channelName: { type: String },
    listingMapId: { type: Number },
    messages: [
      {
        sender: { type: String },
        text: { type: String },
        timestamp: { type: String },
      },
    ],
    dateFrom: { type: String },
    dateTo: { type: String },
    needsReply: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

HostawayConversationSchema.index({ listingId: 1, dateFrom: 1, dateTo: 1 });
HostawayConversationSchema.index({ hostawayConversationId: 1 }, { unique: true });

export const HostawayConversation: Model<IHostawayConversation> =
  mongoose.models.HostawayConversation ??
  mongoose.model<IHostawayConversation>("HostawayConversation", HostawayConversationSchema);
