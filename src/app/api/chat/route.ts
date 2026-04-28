import { NextRequest, NextResponse } from "next/server";
import { callLyzrAgent, getLyzrConfig } from "@/lib/services/lyzr";
import { connectToDatabase } from "@/lib/db/mongodb";

export async function POST(req: NextRequest) {
  try {
    const { chatUrl, apiKey } = getLyzrConfig();
    if (!chatUrl || !apiKey) {
      return NextResponse.json({ error: "Lyzr API configuration missing" }, { status: 500 });
    }

    const body = await req.json();
    const { message, orgId, context } = body;
    
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const agentId = process.env.LYZR_Chat_Response_Agent_ID || process.env.LYZR_GUEST_AGENT_ID || "";
    if (!agentId) {
      return NextResponse.json({ error: "Agent ID not configured" }, { status: 500 });
    }

    const sessionId = `chat-${orgId || "anon"}-${Date.now()}`;
    const payload: any = {
      user_id: orgId || "priceos-user",
      agent_id: agentId,
      session_id: sessionId,
      message,
      stream: true,
    };

    if (context) {
      payload.system_prompt_variables = {
        context_type: context.type,
        property_id: context.propertyId,
        property_name: context.propertyName
      };
    }

    // Call Lyzr Streaming API using a fetch streaming response bridge
    const streamUrl = chatUrl.replace("/chat", "/stream");
    
    const response = await fetch(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: errText }, { status: response.status });
    }

    // Return the readable stream directly to the client as Server-Sent Events
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }
    });
  } catch (err: any) {
    console.error("[POST /api/chat]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
