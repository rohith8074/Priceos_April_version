import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IChatContext {
  type: "portfolio" | "property";
  propertyId?: Types.ObjectId;
}

export interface IChatMessage extends Document {
  orgId: Types.ObjectId;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  context?: IChatContext;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ChatContextSchema = new Schema<IChatContext>({
  type: { type: String, enum: ["portfolio", "property"], required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: "listings" },
}, { _id: false });

const ChatMessageSchema = new Schema<IChatMessage>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  sessionId: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant", "system"], required: true },
  content: { type: String, required: true },
  context: { type: ChatContextSchema },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

ChatMessageSchema.index({ orgId: 1, sessionId: 1 });

export const ChatMessage: Model<IChatMessage> = mongoose.models.chatmessages || mongoose.model<IChatMessage>("chatmessages", ChatMessageSchema);
