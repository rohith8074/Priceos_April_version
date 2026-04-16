import { NextResponse } from "next/server";
import { getAgentId, getLyzrConfig } from "@/lib/env";
import { callLyzrAgent } from "@/lib/lyzr/client";

/**
 * POST /api/hostaway/suggest-reply
 *
 * Generates a human-like, friendly reply from the property manager
 * using the full conversation thread + property details as context.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { messages = [], guestName, propertyName, propertyInfo = {} } = body;

        const conversationMessages: { sender: string; text: string; time?: string }[] = Array.isArray(messages) ? messages : [];
        const lastGuestMessage = [...conversationMessages].reverse().find((m) => m.sender === "guest")?.text || "";

        if (!lastGuestMessage && conversationMessages.length === 0) {
            return NextResponse.json({ error: "No conversation provided" }, { status: 400 });
        }

        const lyzrAgentId = getAgentId("LYZR_CHAT_RESPONSE_AGENT_ID", "LYZR_Chat_Response_Agent_ID");
        const { apiKey: lyzrApiKey } = getLyzrConfig();

        const transcript = conversationMessages
            .map((m) => `${m.sender === "guest" ? `Guest (${guestName || "Guest"})` : "Property Manager"}: ${m.text}`)
            .join("\n");

        const propertyLines: string[] = [];
        if (propertyName) propertyLines.push(`- Property name: ${propertyName}`);
        if (propertyInfo.area) propertyLines.push(`- Location/Area: ${propertyInfo.area}`);
        if (propertyInfo.bedrooms) propertyLines.push(`- Bedrooms: ${propertyInfo.bedrooms}`);
        if (propertyInfo.bathrooms) propertyLines.push(`- Bathrooms: ${propertyInfo.bathrooms}`);
        if (propertyInfo.capacity) propertyLines.push(`- Max guests: ${propertyInfo.capacity}`);
        if (propertyInfo.checkInTime) propertyLines.push(`- Check-in: ${propertyInfo.checkInTime}`);
        if (propertyInfo.checkOutTime) propertyLines.push(`- Check-out: ${propertyInfo.checkOutTime}`);
        if (propertyInfo.amenities?.length) propertyLines.push(`- Amenities: ${propertyInfo.amenities.join(", ")}`);
        const propertyContext = propertyLines.length > 0
            ? `\nPROPERTY INFORMATION:\n${propertyLines.join("\n")}`
            : `\nPROPERTY: ${propertyName || "Our Property"}`;

        const prompt = `${propertyContext}\n\nFULL CONVERSATION HISTORY:\n${transcript || `Guest (${guestName || "Guest"}): ${lastGuestMessage}`}`;

        if (!lyzrAgentId || !lyzrApiKey) {
            console.warn("[Reply] Lyzr not configured, returning friendly fallback");
            return NextResponse.json({
                success: true,
                reply: `Hey ${guestName || "there"}! Thanks so much for reaching out about ${propertyName || "the property"}. I'd love to help — let me check on that for you and get back to you shortly. In the meantime, feel free to ask anything else!`,
                source: "fallback",
            });
        }

        console.log(`[Reply] Calling Lyzr agent ${lyzrAgentId} with ${conversationMessages.length} messages of context...`);

        const lyzrResult = await callLyzrAgent({
            agentId: lyzrAgentId,
            message: prompt,
            userId: "priceos-system",
            sessionId: `reply-${Date.now()}`,
        });

        if (lyzrResult.ok && lyzrResult.response) {
            let reply = lyzrResult.response;
            try {
                const jsonMatch = reply.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.reply) reply = parsed.reply;
                }
            } catch { /* plain text */ }
            reply = reply.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

            if (!reply) {
                return NextResponse.json({
                    success: true,
                    reply: `Hi ${guestName || "there"}, thanks for your message. I'm checking this for you now and will confirm shortly. Let me know if there's anything else you'd like help with in the meantime!`,
                    source: "fallback",
                });
            }

            console.log(`[Reply] Lyzr agent returned reply (${reply.length} chars)`);
            return NextResponse.json({ success: true, reply, source: "lyzr" });
        }

        return NextResponse.json({
            success: true,
            reply: `Hey ${guestName || "there"}! Thanks for your message. I'm looking into this right now and will get back to you as soon as possible. Feel free to reach out if you need anything else!`,
            source: "fallback",
        });
    } catch (error) {
        console.error("[Reply] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to generate reply" },
            { status: 500 }
        );
    }
}
