import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IOpsTicket extends Document {
  orgId: Types.ObjectId;
  reservationId?: string;
  listingId?: Types.ObjectId;
  threadId?: string;
  
  category: "maintenance" | "housekeeping" | "access" | "noise" | "amenity_fault" | "other";
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  slaHours: number;
  
  status: "open" | "assigned" | "in_progress" | "resolved" | "closed";
  createdBy: "reservation_agent" | "human";
  assignedTo?: string;
  
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
}

const OpsTicketSchema = new Schema<IOpsTicket>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  reservationId: { type: String },
  listingId: { type: Schema.Types.ObjectId, ref: "listings" },
  threadId: { type: String },
  
  category: { type: String, enum: ["maintenance", "housekeeping", "access", "noise", "amenity_fault", "other"], default: "other" },
  description: { type: String, required: true },
  severity: { type: String, enum: ["critical", "high", "medium", "low"], default: "medium" },
  slaHours: { type: Number, default: 24 },
  
  status: { type: String, enum: ["open", "assigned", "in_progress", "resolved", "closed"], default: "open" },
  createdBy: { type: String, enum: ["reservation_agent", "human"], default: "reservation_agent" },
  assignedTo: { type: String },
  
  resolvedAt: { type: Date },
}, { timestamps: true });

OpsTicketSchema.index({ orgId: 1, status: 1 });
OpsTicketSchema.index({ listingId: 1, status: 1 });
OpsTicketSchema.index({ reservationId: 1 });
OpsTicketSchema.index({ createdAt: -1 });

export const OpsTicket: Model<IOpsTicket> = mongoose.models.ops_tickets || mongoose.model<IOpsTicket>("ops_tickets", OpsTicketSchema);
