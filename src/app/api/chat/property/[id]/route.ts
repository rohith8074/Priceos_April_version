import { NextRequest, NextResponse } from "next/server";
import { connectDB, Listing, ChatMessage, InventoryMaster, MarketEvent } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { format } from "date-fns";
import mongoose from "mongoose";
import { buildAgentContext } from "@/lib/agents/db-context-builder";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { message, startDate: startStr, endDate: endStr } = body;

        await connectDB();
        const session = await getSession();
        const orgId = session?.orgId
            ? new mongoose.Types.ObjectId(session.orgId)
            : new mongoose.Types.ObjectId();

        let listingObjectId: mongoose.Types.ObjectId;
        try {
            listingObjectId = new mongoose.Types.ObjectId(id);
        } catch {
            return NextResponse.json({ error: "Invalid property ID" }, { status: 400 });
        }

        const startDate = startStr ? new Date(startStr) : new Date();
        const endDate = endStr ? new Date(endStr) : addDays(startDate, 30);
        const startDateStr = format(startDate, "yyyy-MM-dd");
        const endDateStr = format(endDate, "yyyy-MM-dd");

        let dbContext = "";
        try {
            dbContext = await buildAgentContext(orgId.toString(), listingObjectId.toString(), {
                from: startStr || format(new Date(), "yyyy-MM-dd"),
                to: endStr || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
            });
        } catch (err) {
            console.error("Failed to build DB context for property chat:", err);
        }

        // 5. Save user message
        await ChatMessage.create({
            orgId,
            sessionId: `property-${id}`,
            role: "user",
            content: message,
            context: { type: "property", propertyId: listingObjectId },
            metadata: { listingId: id },
        });

        const finalMessage = dbContext 
            ? `[SYSTEM CONTEXT - USE EXCLUSIVELY]\n${dbContext}\n\n[USER QUESTION]\n${message}`
            : message;

        // 6. Proxy to Python backend
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
        const agentResponse = await fetch(`${backendUrl}/api/agent/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: finalMessage,
                user_id: session?.userId || "user-1",
                session_id: `property-${id}`,
                cache: null,
            }),
        });

        if (!agentResponse.ok) {
            const errText = await agentResponse.text();
            throw new Error(`Backend Error: ${errText}`);
        }

        const result = await agentResponse.json();
        const responseMessage = result.response?.response || "I couldn't generate a report right now.";

        // 7. Save assistant message
        await ChatMessage.create({
            orgId,
            sessionId: `property-${id}`,
            role: "assistant",
            content: responseMessage,
            context: { type: "property", propertyId: listingObjectId },
            metadata: { listingId: id, backend_result: result.response },
        });

        return NextResponse.json({ message: responseMessage, proposals: [] });
    } catch (error) {
        console.error("Error in property chat:", error);
        return NextResponse.json({ error: "Failed to process chat message" }, { status: 500 });
    }
}
