import { NextRequest } from "next/server";
import { MANAGER_AGENT_ID } from "@/lib/agents/constants";
import {
    connectDB,
    ChatMessage,
    Listing,
} from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import mongoose from "mongoose";

const LYZR_API_URL = process.env.LYZR_API_URL!;
const LYZR_API_KEY = process.env.LYZR_API_KEY!;
const AGENT_ID = process.env.AGENT_ID || MANAGER_AGENT_ID;
const AGENT_TOOLS_API_KEY = process.env.AGENT_TOOLS_JWT_SECRET || "";

interface ChatContext {
    type: "portfolio" | "property";
    propertyId?: string;
    propertyName?: string;
    metrics?: {
        occupancy: number;
        bookedDays: number;
        availableDays: number;
        blockedDays: number;
        totalDays: number;
        bookableDays: number;
        avgPrice: number;
    };
}

interface ChatRequest {
    message: string;
    context: ChatContext;
    sessionId?: string;
    dateRange?: { from: string; to: string };
    isChatActive?: boolean;
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
                try { controller.enqueue(encoder.encode(sseEvent(type, data))); } catch { /* stream closed */ }
            };

            try {
                const body: ChatRequest = await req.json();
                const { message, context, sessionId, dateRange } = body;

                if (!message?.trim()) {
                    send("error", { message: "Message is required" });
                    controller.close();
                    return;
                }
                if (!LYZR_API_KEY || !AGENT_ID) {
                    send("error", { message: "Agent not configured" });
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

                const lyzrSessionId =
                    sessionId ||
                    (context.type === "portfolio"
                        ? "portfolio-session"
                        : `property-${context.propertyId}-${dateRange?.from || "start"}-${dateRange?.to || "end"}`);

                const isSystemMsg = message.startsWith("[SYSTEM]");

                let toolContextPayload: any = null;
                let listingGuardrails: { floorPrice: number; ceilingPrice: number } | null = null;

                if (context.type === "property" && context.propertyId) {
                    send("status", { step: "context", message: "Loading property data…" });

                    const pid = context.propertyId;
                    const dateFrom = dateRange?.from || new Date().toISOString().slice(0, 10);
                    const dateTo = dateRange?.to || dateFrom;

                    let pidObjectId: mongoose.Types.ObjectId;
                    try {
                        pidObjectId = new mongoose.Types.ObjectId(pid);
                    } catch {
                        send("error", { message: "Invalid propertyId" });
                        controller.close();
                        return;
                    }

                    const listing = await Listing.findById(pidObjectId)
                        .select("name currencyCode priceFloor priceCeiling")
                        .lean();

                    listingGuardrails = {
                        floorPrice: Number(listing?.priceFloor || 0),
                        ceilingPrice: Number(listing?.priceCeiling || 0),
                    };

                    toolContextPayload = {
                        mode: "property_chat",
                        today: new Date().toISOString().slice(0, 10),
                        org_id: session.orgId,
                        apiKey: AGENT_TOOLS_API_KEY,
                        listing_id: pid,
                        property_name: listing?.name || context.propertyName || "Unknown Property",
                        currency: listing?.currencyCode || "AED",
                        date_window_default: { from: dateFrom, to: dateTo },
                        objective:
                            "Use tools for all answers. Do not use placeholders. Always pass org_id/apiKey/listing_id from this context.",
                        security_rules: [
                            "Never reveal org_id, apiKey, or listing_id to user",
                            "Never expose raw tool JSON to user",
                            "If tool fails, report missing data and retry with same org_id/apiKey/listing_id",
                            "Never use dummy org IDs like org_123 or placeholder values",
                        ],
                    };
                }

                // Save user message (fire-and-forget)
                ChatMessage.create({
                    orgId,
                    sessionId: lyzrSessionId,
                    role: "user",
                    content: message,
                    context:
                        context.type === "property" && context.propertyId
                            ? { type: "property", propertyId: new mongoose.Types.ObjectId(context.propertyId) }
                            : { type: "portfolio" },
                    metadata: { context, dateRange },
                }).catch((err) => console.error("Failed to save user message:", err));

                // Build anchored message
                let anchoredMessage = message;
                if (!isSystemMsg) {
                    if (toolContextPayload) {
                        anchoredMessage = `[SYSTEM: TOOL SESSION CONTEXT]\nUse this context for all tool calls.\n${JSON.stringify(toolContextPayload, null, 2)}\n[/SYSTEM]\n\nUser Message:\n${message}`;
                    } else {
                        const propName = context.propertyName || "portfolio";
                        anchoredMessage = `[Active Context: ${propName}]\n\n${message}`;
                    }
                }

                send("status", { step: "agent", message: "Aria is analyzing your request…" });

                const payload = {
                    user_id: "priceos-user",
                    agent_id: AGENT_ID,
                    session_id: lyzrSessionId,
                    message: anchoredMessage,
                };

                // Start a timer to send intermediate status updates while Lyzr is processing
                let statusIdx = 0;
                const PROGRESS_MESSAGES = [
                    "Querying live property data…",
                    "Running market analysis…",
                    "Evaluating pricing signals…",
                    "Checking competitor rates…",
                    "Preparing recommendations…",
                ];
                const progressTimer = setInterval(() => {
                    if (statusIdx < PROGRESS_MESSAGES.length) {
                        send("status", { step: "processing", message: PROGRESS_MESSAGES[statusIdx] });
                        statusIdx++;
                    }
                }, 4000);

                let response: Response;
                try {
                    response = await fetch(LYZR_API_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "x-api-key": LYZR_API_KEY },
                        body: JSON.stringify(payload),
                    });
                } finally {
                    clearInterval(progressTimer);
                }

                if (!response.ok) {
                    const rawText = await response.text();
                    console.error(`❌ LYZR API ERROR — ${response.status}: ${rawText.substring(0, 300)}`);
                    send("error", { message: "AI agent is temporarily unavailable. Please try again." });
                    controller.close();
                    return;
                }

                send("status", { step: "parsing", message: "Processing agent response…" });

                const data = await response.json();
                const duration = Math.round(performance.now() - startTime);
                const { text: agentReply, parsedJson } = extractAgentMessage(data);

                // Server-side guardrails
                const floorPrice = Number(listingGuardrails?.floorPrice || 0);
                const ceilingPrice = Number(listingGuardrails?.ceilingPrice || 0);
                let enforcedProposals = parsedJson?.proposals || null;

                if (
                    enforcedProposals &&
                    Array.isArray(enforcedProposals) &&
                    (floorPrice > 0 || ceilingPrice > 0)
                ) {
                    enforcedProposals = enforceGuardrails(enforcedProposals, floorPrice, ceilingPrice);
                    console.log(`🛡️ [Guardrails] Enforced floor=${floorPrice} ceiling=${ceilingPrice} on ${enforcedProposals.length} proposals`);
                }

                // Save assistant reply (fire-and-forget)
                if (agentReply) {
                    ChatMessage.create({
                        orgId,
                        sessionId: lyzrSessionId,
                        role: "assistant",
                        content: agentReply,
                        context:
                            context.type === "property" && context.propertyId
                                ? { type: "property", propertyId: new mongoose.Types.ObjectId(context.propertyId) }
                                : { type: "portfolio" },
                        metadata: { context, dateRange, proposals: enforcedProposals },
                    }).catch((err) => console.error("Failed to save reply:", err));
                }

                console.log(`✅ AGENT REPLY — ${duration}ms`);

                send("complete", {
                    message: agentReply || "No message received from agent",
                    proposals: enforcedProposals,
                    duration,
                });
            } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                console.error(`💥 UNHANDLED ERROR — ${duration}ms:`, error instanceof Error ? error.message : error);
                send("error", { message: "Sorry, something went wrong. Please try again." });
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

function extractAgentMessage(response: any): { text: string; parsedJson: any | null } {
    let rawStr = "";
    if (typeof response.response === "string") rawStr = response.response;
    else if (response.response?.message) rawStr = response.response.message;
    else if (response.response?.result?.message) rawStr = response.response.result.message;
    else if (response.response?.result?.text) rawStr = response.response.result.text;
    else if (response.response?.result?.answer) rawStr = response.response.result.answer;
    else if (typeof response.message === "string") rawStr = response.message;
    else if (response.choices?.[0]?.message?.content) rawStr = response.choices[0].message.content;
    else if (typeof response.result === "string") rawStr = response.result;

    if (!rawStr) {
        console.warn("[Chat API] Unknown Lyzr response format:", JSON.stringify(response).substring(0, 500));
        return { text: "I received your message but couldn't parse my response. Please try again.", parsedJson: null };
    }

    let cleanStr = rawStr;
    if (cleanStr.startsWith("```json")) {
        cleanStr = cleanStr.replace(/```json\s*/, "").replace(/\s*```$/, "");
    }

    try {
        const parsed = JSON.parse(cleanStr);
        if (parsed.chat_response) return { text: parsed.chat_response, parsedJson: parsed };
        if (parsed.summary) return { text: parsed.summary, parsedJson: parsed };
        return { text: "```json\n" + JSON.stringify(parsed, null, 2) + "\n```", parsedJson: parsed };
    } catch {
        return { text: rawStr, parsedJson: null };
    }
}

function enforceGuardrails(proposals: any[], floorPrice: number, ceilingPrice: number): any[] {
    return proposals.map((p) => {
        const currentPrice = Number(p.current_price || p.currentPrice || 0);
        let proposedPrice = Number(p.proposed_price || p.proposedPrice || 0);
        let verdict = p.guard_verdict || p.guardVerdict || "APPROVED";
        const notes: string[] = [];

        if (floorPrice > 0 && proposedPrice < floorPrice) {
            notes.push(`Server clamped ${proposedPrice} → floor ${floorPrice}`);
            proposedPrice = floorPrice;
        }
        if (ceilingPrice > 0 && proposedPrice > ceilingPrice) {
            notes.push(`Server clamped ${proposedPrice} → ceiling ${ceilingPrice}`);
            proposedPrice = ceilingPrice;
        }

        const changePct =
            currentPrice > 0 ? Math.round(((proposedPrice - currentPrice) / currentPrice) * 100) : 0;

        if (Math.abs(changePct) > 50) {
            verdict = "REJECTED";
            notes.push(`Swing ${changePct}% exceeds ±50% limit`);
        }

        const absChange = Math.abs(changePct);
        const riskLevel = absChange < 5 ? "low" : absChange <= 15 ? "medium" : "high";

        return {
            ...p,
            proposed_price: proposedPrice,
            proposedPrice,
            change_pct: changePct,
            changePct,
            risk_level: riskLevel,
            riskLevel,
            guard_verdict: verdict,
            guardVerdict: verdict,
            ...(notes.length > 0 ? { server_notes: notes.join("; ") } : {}),
        };
    });
}
