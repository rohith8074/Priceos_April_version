import { NextRequest } from "next/server";
import { connectDB, ChatMessage } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";
import { buildAgentContext } from "@/lib/agents/db-context-builder";

const LYZR_API_URL = process.env.LYZR_API_URL || "https://agent-prod.studio.lyzr.ai/v3/inference/chat/";
const LYZR_API_KEY = process.env.LYZR_API_KEY || "";

function sseEvent(type: string, data: any): string {
    return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

export async function POST(req: NextRequest) {
    const startTime = performance.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (type: string, data: any) => {
                try { controller.enqueue(encoder.encode(sseEvent(type, data))); } catch { /* closed */ }
            };

            try {
                const dashboardAgentId = process.env.LYZR_DASHBOARD_AGENT_ID || process.env.AGENT_ID;
                const body = await req.json();
                const { message, sessionId: clientSessionId } = body;

                if (!message?.trim()) {
                    send("error", { message: "Message is required" });
                    controller.close();
                    return;
                }

                send("status", { step: "init", message: "Connecting to PriceOS…" });

                await connectDB();
                const session = await getSession();
                if (!session?.orgId) {
                    send("error", { message: "Unauthorized" });
                    controller.close();
                    return;
                }
                const orgId = new mongoose.Types.ObjectId(session.orgId);
                const sessionId = clientSessionId || "global";

                // Save user message (fire-and-forget)
                ChatMessage.create({
                    orgId,
                    sessionId,
                    role: "user",
                    content: message,
                    context: { type: "portfolio" },
                }).catch((err) => console.error("Failed to save user message:", err));

                send("status", { step: "context", message: "Building portfolio context…" });

                let dbContext = "";
                try {
                    dbContext = await buildAgentContext(orgId.toString());
                } catch (err) {
                    console.error("Failed to build DB context for global chat:", err);
                }

                const finalMessage = dbContext
                    ? `[SYSTEM CONTEXT - USE EXCLUSIVELY]\n${dbContext}\n\n[USER QUESTION]\n${message}`
                    : message;

                send("status", { step: "agent", message: "Portfolio agent is analyzing…" });

                const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
                let responseMessage = "";
                let usedFallback = false;
                let result: any;

                // Progress timer for long-running agent calls
                let statusIdx = 0;
                const PROGRESS_MESSAGES = [
                    "Reviewing portfolio metrics…",
                    "Checking property performance…",
                    "Generating insights…",
                ];
                const progressTimer = setInterval(() => {
                    if (statusIdx < PROGRESS_MESSAGES.length) {
                        send("status", { step: "processing", message: PROGRESS_MESSAGES[statusIdx] });
                        statusIdx++;
                    }
                }, 4000);

                try {
                    const agentResponse = await fetch(`${backendUrl}/api/agent/`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: finalMessage,
                            agent_id: dashboardAgentId,
                            user_id: session?.userId || "user-1",
                            session_id: sessionId,
                            cache: null,
                        }),
                    });
                    if (!agentResponse.ok) throw new Error("Backend not ok");
                    result = await agentResponse.json();
                    responseMessage = result.response?.response || result.response?.message || "";
                } catch {
                    usedFallback = true;
                }

                let metadata: Record<string, number | string> = {};

                if (usedFallback || !responseMessage) {
                    if (!LYZR_API_KEY) {
                        clearInterval(progressTimer);
                        send("error", { message: "Dashboard agent unavailable (missing API key)." });
                        controller.close();
                        return;
                    }

                    send("status", { step: "fallback", message: "Connecting to Lyzr agent directly…" });

                    const directRes = await fetch(LYZR_API_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
                        body: JSON.stringify({
                            user_id: session?.userId || "priceos-user",
                            agent_id: dashboardAgentId,
                            session_id: sessionId,
                            message: finalMessage,
                        }),
                    });

                    if (!directRes.ok) {
                        const errText = await directRes.text();
                        clearInterval(progressTimer);
                        send("error", { message: `Dashboard agent unavailable (${directRes.status})` });
                        console.error(`Lyzr direct error: ${errText.slice(0, 200)}`);
                        controller.close();
                        return;
                    }

                    const directData = await directRes.json();
                    const raw =
                        typeof directData?.response === "string"
                            ? directData.response
                            : directData?.response?.message || directData?.response?.result?.message || "";

                    responseMessage = raw || "No response from dashboard agent.";
                    metadata = { source: "lyzr_direct" };
                }

                clearInterval(progressTimer);

                send("status", { step: "saving", message: "Saving response…" });

                // Save assistant reply (fire-and-forget)
                ChatMessage.create({
                    orgId,
                    sessionId,
                    role: "assistant",
                    content: responseMessage,
                    context: { type: "portfolio" },
                    metadata: { ...metadata, backend_result: result?.response },
                }).catch((err) => console.error("Failed to save reply:", err));

                const duration = Math.round(performance.now() - startTime);
                console.log(`✅ DASHBOARD REPLY — ${duration}ms`);

                send("complete", { message: responseMessage, metadata, duration });
            } catch (error) {
                console.error("Error in global chat:", error);
                send("error", { message: "Failed to process chat message" });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
