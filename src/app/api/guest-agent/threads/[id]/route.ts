import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import mongoose from "mongoose";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });
    }

    await connectToDatabase();
    
    if (!mongoose.connection.db) {
      throw new Error("Database connection not initialized");
    }

    const doc = await mongoose.connection.db
      .collection("guest_threads")
      .findOne({ _id: new mongoose.Types.ObjectId(id) });

    if (!doc) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const messages = Array.isArray(doc.messages) ? doc.messages.map((m: any) => ({
      messageId: m.messageId,
      direction: m.direction || "inbound",
      content: m.content || "",
      handledBy: m.handledBy || "reservation_agent",
      intent: m.intent || null,
      sentiment: m.sentiment || null,
      confidence: m.confidence || null,
      discloseAi: m.discloseAi !== false,
      status: m.status || "sent",
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString()
    })) : [];

    const thread = {
      id: doc._id.toString(),
      _id: doc._id.toString(),
      orgId: doc.orgId.toString(),
      reservationId: doc.reservationId || "N/A",
      guestId: doc.guestId || null,
      listingId: doc.listingId ? doc.listingId.toString() : null,
      channel: doc.channel || "email",
      commsState: doc.commsState || "active",
      status: doc.status || "open",
      messages,
      openedAt: doc.openedAt ? new Date(doc.openedAt).toISOString() : new Date().toISOString(),
      lastActivityAt: doc.lastActivityAt ? new Date(doc.lastActivityAt).toISOString() : new Date().toISOString()
    };

    return NextResponse.json(thread, { status: 200 });
  } catch (err: any) {
    console.error(`[api/guest-agent/threads] GET error`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
