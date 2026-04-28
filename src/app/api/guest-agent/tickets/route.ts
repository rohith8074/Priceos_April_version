import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ tickets: [] }, { status: 200 });
    }

    await connectToDatabase();
    
    const orgOid = new mongoose.Types.ObjectId(orgId);
    if (!mongoose.connection.db) {
      throw new Error("Database connection not initialized");
    }
    const docs = await mongoose.connection.db
      .collection("ops_tickets")
      .find({ orgId: orgOid })
      .toArray();

    const tickets = docs.map((d: any) => ({
      id: d._id.toString(),
      _id: d._id.toString(),
      listingId: d.listingId ? d.listingId.toString() : null,
      reservationId: d.reservationId || "N/A",
      threadId: d.threadId || null,
      category: d.category || "other",
      description: d.description || "No description provided",
      severity: d.severity || "medium",
      slaHours: Number(d.slaHours ?? 24),
      status: d.status || "open",
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString()
    }));

    return NextResponse.json({ tickets }, { status: 200 });
  } catch (err: any) {
    console.error("[api/guest-agent/tickets] GET error", err);
    return NextResponse.json({ tickets: [], error: err.message }, { status: 500 });
  }
}
