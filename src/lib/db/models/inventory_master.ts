import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IInventoryMaster extends Document {
  orgId: Types.ObjectId;
  listingId: Types.ObjectId;
  date: string; // "YYYY-MM-DD"
  currentPrice: number;
  basePrice?: number;
  status: "available" | "booked" | "blocked" | "pending";
  minStay?: number;
  maxStay?: number;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  
  // Staged change (HITL)
  proposedPrice?: number;
  proposalStatus?: "pending" | "approved" | "rejected" | "pushed" | "rolled_back";
  changePct?: number;
  reasoning?: any;
  batchId?: string;
  
  // Rollback support
  previousPrice?: number;
  pushedAt?: Date;
  
  // Sync
  hostawayStatus?: string;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryMasterSchema = new Schema<IInventoryMaster>({
  orgId: { type: Schema.Types.ObjectId, ref: "organizations", required: true },
  listingId: { type: Schema.Types.ObjectId, ref: "listings", required: true },
  date: { type: String, required: true },
  currentPrice: { type: Number, required: true },
  basePrice: { type: Number },
  status: { type: String, enum: ["available", "booked", "blocked", "pending"], default: "available" },
  minStay: { type: Number },
  maxStay: { type: Number },
  closedToArrival: { type: Boolean, default: false },
  closedToDeparture: { type: Boolean, default: false },
  
  proposedPrice: { type: Number },
  proposalStatus: { type: String, enum: ["pending", "approved", "rejected", "pushed", "rolled_back"] },
  changePct: { type: Number },
  reasoning: { type: Schema.Types.Mixed },
  batchId: { type: String },
  
  previousPrice: { type: Number },
  pushedAt: { type: Date },
  
  hostawayStatus: { type: String },
  lastSyncedAt: { type: Date },
}, { timestamps: true });

InventoryMasterSchema.index({ listingId: 1, date: 1 });
InventoryMasterSchema.index({ orgId: 1, proposalStatus: 1 });

export const InventoryMaster: Model<IInventoryMaster> = mongoose.models.inventory_masters || mongoose.model<IInventoryMaster>("inventory_masters", InventoryMasterSchema);
