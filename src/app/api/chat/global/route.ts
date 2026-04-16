import { NextRequest } from "next/server";
import { connectDB, ChatMessage } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";
import { buildAgentContext } from "@/lib/agents/db-context-builder";
import { callLyzrAgent } from "@/lib/lyzr/client";

const LOG_PREFIX = "[DashboardAgent]";

/** Truncate for server logs (single line, safe length). */
function logPreview(text: string, max = 500): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length <= max ? t : `${t.slice(0, max)}…`;
}

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

                // Portfolio JSON is injected so the model can answer from Mongo even when the Python
                // proxy is down. Lyzr OpenAPI tools still need the *session* orgId on each call — Studio
                // defaults often point at a placeholder org; force the real id in-prompt.
                const toolSessionBlock = `[SESSION — AGENT TOOLS]
orgId (required query parameter for every PriceOS /api/agent-tools/v1 call, alongside apiKey): ${orgId.toString()}
Use exactly this orgId. Do not use placeholder, example, or cached org ids from OpenAPI defaults.

`;

                const finalMessage = dbContext
                    ? `${toolSessionBlock}[SYSTEM CONTEXT - USE EXCLUSIVELY]\n${dbContext}\n\n[USER QUESTION]\n${message}`
                    : `${toolSessionBlock}${message}`;

                console.log(`${LOG_PREFIX} input`, {
                    agentId: dashboardAgentId,
                    orgId: orgId.toString(),
                    sessionId,
                    userId: session?.userId,
                    userMessage: logPreview(message, 600),
                    userMessageChars: message.length,
                    dbContextChars: dbContext.length,
                    finalMessageChars: finalMessage.length,
                });

                send("status", { step: "agent", message: "Portfolio agent is analyzing…" });

                let responseMessage = "";
                let responseSource: "lyzr_direct" = "lyzr_direct";

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

                let metadata: Record<string, number | string> = {};

                const directResult = await callLyzrAgent({
                    agentId: dashboardAgentId || "",
                    message: finalMessage,
                    userId: session?.userId || "priceos-user",
                    sessionId: sessionId,
                });

                if (!directResult.ok) {
                    clearInterval(progressTimer);
                    send("error", { message: `Dashboard agent unavailable (${directResult.error})` });
                    console.error(`${LOG_PREFIX} lyzr_direct error`, { error: directResult.error });
                    controller.close();
                    return;
                }

                responseMessage = directResult.response || "No response from dashboard agent.";
                metadata = { source: "lyzr_direct" };
                console.log(`${LOG_PREFIX} lyzr_direct reply`, {
                    chars: responseMessage.length,
                    preview: logPreview(responseMessage, 600),
                });

                clearInterval(progressTimer);

                send("status", { step: "saving", message: "Saving response…" });

                // Save assistant reply (fire-and-forget)
                ChatMessage.create({
                    orgId,
                    sessionId,
                    role: "assistant",
                    content: responseMessage,
                    context: { type: "portfolio" },
                    metadata,
                }).catch((err) => console.error("Failed to save reply:", err));

                const duration = Math.round(performance.now() - startTime);
                console.log(`${LOG_PREFIX} output`, {
                    source: responseSource,
                    responseChars: responseMessage.length,
                    preview: logPreview(responseMessage, 800),
                    durationMs: duration,
                    orgId: orgId.toString(),
                    sessionId,
                });

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
