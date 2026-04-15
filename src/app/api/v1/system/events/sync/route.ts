/**
 * POST /api/v1/system/events/sync
 *
 * Triggers a full event feed sync:
 *   Eventbrite → DTCM → Dubai Calendar RSS → Time Out Dubai RSS
 *   → MarketEvent (MongoDB)
 *
 * Called:
 *   - Manually from Settings → Event Feeds
 *   - By a scheduled cron (nightly at 02:00 Dubai time)
 *   - Automatically during onboarding setup
 *
 * Auth: requires authenticated session (orgId scoped)
 * Rate limit: max 1 call per 10 minutes per org (expensive — calls 4 external APIs)
 */

import { apiSuccess, apiError } from "@/lib/api/response";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getSession } from "@/lib/auth/server";
import { syncEventFeeds } from "@/lib/events/event-feed-syncer";
import mongoose from "mongoose";

export async function POST(request: Request) {
    // ── Rate limiting (conservative — this calls 4 external APIs) ──
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`events-sync:${ip}`, RATE_LIMITS.ai);
    if (!rateCheck.allowed) {
        return apiError(
            "RATE_LIMITED",
            `Event sync rate limited. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`,
            429
        );
    }

    // ── Auth ──
    const session = await getSession();
    if (!session?.orgId) {
        return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    // ── Parse optional params ──
    let daysAhead = 90;
    let marketCity = "Dubai";
    try {
        const body = await request.json().catch(() => ({}));
        if (typeof body?.daysAhead === "number" && body.daysAhead > 0 && body.daysAhead <= 365) {
            daysAhead = body.daysAhead;
        }
        if (typeof body?.marketCity === "string" && body.marketCity.trim()) {
            marketCity = body.marketCity.trim();
        }
    } catch {
        // ignore — use default
    }

    try {
        const orgObjectId = new mongoose.Types.ObjectId(session.orgId);
        const result = await syncEventFeeds(orgObjectId, daysAhead, marketCity);

        return apiSuccess(
            {
                inserted: result.inserted,
                updated: result.updated,
                skipped: result.skipped,
                sources: result.sources,
            },
            {
                errors: result.errors.length > 0 ? result.errors : undefined,
                daysAhead,
            }
        );
    } catch (error) {
        console.error("❌ [v1/system/events/sync] Error:", error);
        return apiError(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to sync event feeds",
            500
        );
    }
}
