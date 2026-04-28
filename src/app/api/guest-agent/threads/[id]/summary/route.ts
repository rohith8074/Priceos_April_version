import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { HostawayConversation } from "@/lib/db/models";
import { Types } from "mongoose";

import { callLyzrAgent } from "@/lib/services/lyzr";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const { id: threadId } = await params;

    if (!threadId) {
      return NextResponse.json({ error: "Missing thread id" }, { status: 400 });
    }

    let actualThreadId = threadId;
    if (threadId && threadId.includes("-")) {
      const parts = threadId.split("-");
      actualThreadId = parts[1] || parts[0];
      if (actualThreadId === "undefined" && parts[0]) {
        actualThreadId = parts[0];
      }
    }

    await connectToDatabase();

    const query: any = {};
    if (orgId && Types.ObjectId.isValid(orgId)) {
      query.orgId = new Types.ObjectId(orgId);
    }
    
    const orConditions: any[] = [{ hostawayConversationId: actualThreadId }];
    if (Types.ObjectId.isValid(actualThreadId)) {
      orConditions.push({ _id: new Types.ObjectId(actualThreadId) });
    }
    query.$or = orConditions;

    const conv = await HostawayConversation.findOne(query).lean() as any;

    if (!conv) {
      return NextResponse.json({ summary: null, generated: false, message: "Conversation not found" });
    }

    const messages = conv.messages || [];
    const guestMessages = messages.filter((m: any) => m.sender !== "admin" && m.sender !== "host");
    const lastMsg = messages[messages.length - 1];

    const agentId = process.env.LYZR_Conversation_Summary_Agent_ID || "699d6ba5d3183ea975c8c375";
    
    const prompt = `
Generate a guest interaction analysis summary for the following conversation.
Guest Name: ${conv.guestName || "Guest"}

Messages:
${messages.map((m: any) => `${m.sender || "Guest"}: ${m.text || ""}`).join("\n")}

Respond with ONLY a JSON object containing:
{
  "sentiment": "Positive" | "Neutral" | "Needs Attention",
  "themes": ["Theme 1", "Theme 2"],
  "actionItems": ["Action Item 1"],
  "bulletPoints": ["Key Point 1"]
}
`;

    const result = await callLyzrAgent(agentId, prompt, "priceos-user", `summary-${actualThreadId}`);

    let sentiment = "Neutral";
    let themes: string[] = ["General Inquiry"];
    let actionItems: string[] = [];
    let bulletPoints: string[] = [];

    if (result.ok && result.parsedJson) {
      const json = result.parsedJson;
      sentiment = json.sentiment || sentiment;
      themes = Array.isArray(json.themes) ? json.themes : themes;
      actionItems = Array.isArray(json.actionItems) ? json.actionItems : actionItems;
      bulletPoints = Array.isArray(json.bulletPoints) ? json.bulletPoints : bulletPoints;
    } else {
      // Fallback inference if parsing missed
      const total = messages.length;
      const needs = guestMessages.length;
      sentiment = needs > total / 2 ? "Needs Attention" : "Neutral";
      actionItems = needs > 0 ? [`Reply to pending messages`] : [];
      bulletPoints = messages.slice(-3).map((m: any) => `${m.sender || "Guest"}: ${m.text || ""}`);
    }

    return NextResponse.json({
      generated: true,
      sentiment,
      sentimentScore: sentiment === "Positive" ? 0.9 : sentiment === "Neutral" ? 0.5 : 0.2,
      confidence: 0.85,
      themes,
      actionItems,
      bulletPoints,
      guestName: conv.guestName || "Guest",
      propertyName: conv.propertyName || conv.listingName || "",
      messageCount: messages.length,
      lastActivity: lastMsg?.timestamp || lastMsg?.time || null,
      totalConversations: 1,
      needsReplyCount: conv.needsReply ? 1 : 0
    });
  } catch (err: any) {
    console.error("[POST /api/guest-agent/threads/[id]/summary]", err);
    return NextResponse.json({ summary: null, generated: false, error: err.message }, { status: 500 });
  }
}
