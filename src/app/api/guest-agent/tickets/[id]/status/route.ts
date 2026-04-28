import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import mongoose from "mongoose";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;
    const body = await req.json();

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticketId" }, { status: 400 });
    }

    await connectToDatabase();

    if (!mongoose.connection.db) {
      throw new Error("Database connection not initialized");
    }

    await mongoose.connection.db
      .collection("ops_tickets")
      .updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { status: body.status || "resolved", updatedAt: new Date() } }
      );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[api/guest-agent/tickets/status] PATCH error`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
