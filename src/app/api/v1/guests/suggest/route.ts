import { connectDB, Listing } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { suggestReplySchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getAgentId, getLyzrConfig } from "@/lib/env";
import { callLyzrAgent } from "@/lib/lyzr/client";
import mongoose from "mongoose";

/**
 * POST /api/v1/guests/suggest
 * 
 * Uses the Lyzr Chat Response Agent to generate an AI-drafted reply
 * for a guest message. Falls back to a template if Lyzr is unavailable.
 * 
 * Rate Limit: AI tier (20 req/min) — this endpoint calls external AI.
 * 
 * Request Body:
 *   { message: string, guestName?: string, propertyName?: string }
 * 
 * Response:
 *   { status: "success", data: { reply: "...", source: "lyzr" | "fallback" } }
 */
export async function POST(request: Request) {
    // ── Rate Limiting (AI tier) ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`guests-suggest:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `AI endpoint rate limited. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    // ── Step 1: Parse & validate ──
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const validation = suggestReplySchema.safeParse(body);

    if (!validation.success) {
        return apiError(
            "VALIDATION_ERROR",
            "Invalid request body",
            400,
            formatZodErrors(validation.error)
        );
    }

    const { message, guestName, propertyName, listingId } = validation.data;

    try {
        // ── Step 2: Check Lyzr configuration ──
        const lyzrAgentId = getAgentId("LYZR_CHAT_RESPONSE_AGENT_ID", "LYZR_Chat_Response_Agent_ID");
        const { apiKey: lyzrApiKey } = getLyzrConfig();

        if (!lyzrAgentId || !lyzrApiKey) {
            console.warn("⚠️  [v1/guests/suggest] Lyzr not configured, returning fallback");
            return apiSuccess({
                reply: `Hi ${guestName}, thanks for reaching out! I'll look into this and get back to you shortly.`,
                source: "fallback",
            });
        }

        // ── Step 2b: Fetch property context if listingId provided ──
        let propertyContext = "";
        if (listingId) {
            try {
                await connectDB();
                const listing = await Listing.findById(
                    new mongoose.Types.ObjectId(String(listingId))
                )
                    .select("name area bedroomsNumber bathroomsNumber personCapacity amenities currencyCode price priceFloor priceCeiling lowestMinStayAllowed defaultMaxStay allowedCheckinDays allowedCheckoutDays")
                    .lean();

                if (listing) {
                    const amenityList = (listing.amenities || []).slice(0, 10).join(", ") || "N/A";
                    propertyContext = `
Property details (use these facts when relevant — do NOT reveal pricing floors/ceilings to guests):
- Name: ${listing.name}
- Area: ${listing.area}
- Bedrooms: ${listing.bedroomsNumber} | Bathrooms: ${listing.bathroomsNumber} | Max guests: ${listing.personCapacity ?? "N/A"}
- Base nightly rate: ${listing.currencyCode} ${listing.price}
- Min stay: ${listing.lowestMinStayAllowed} night(s) | Max stay: ${listing.defaultMaxStay} night(s)
- Amenities: ${amenityList}`;
                }
            } catch {
                // Non-fatal — proceed without property context
            }
        }

        // ── Step 3: Build prompt and call Lyzr agent ──
        const prompt = `You are a professional property manager responding to a guest.
${propertyContext}

Guest name: ${guestName}
Property: "${propertyName}"
Guest's message: "${message}"

Write a professional, warm, and concise reply. Address their question directly using the property details above where relevant. Keep it to 2-4 sentences. Do not use formal sign-offs like "Sincerely" or "Best regards".`;

        console.log(`[v1/guests/suggest] Calling Lyzr agent ${lyzrAgentId}...`);

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
            reply = reply.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

            console.log(`[v1/guests/suggest] AI draft generated`);
            return apiSuccess({ reply, source: "lyzr" });
        }

        console.warn("[v1/guests/suggest] Lyzr returned non-OK, using fallback");
        return apiSuccess({
            reply: `Hi ${guestName}, thanks for reaching out! I'll look into this and get back to you shortly.`,
            source: "fallback",
        });
    } catch (error) {
        console.error("❌ [v1/guests/suggest] Error:", error);
        return apiError(
            "AI_SERVICE_ERROR",
            "Failed to generate AI suggestion",
            502
        );
    }
}
