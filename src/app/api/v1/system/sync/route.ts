import { apiSuccess, apiError } from "@/lib/api/response";
import { triggerSyncSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { startBackgroundSync } from "@/lib/sync/background-sync";

/**
 * POST /api/v1/system/sync
 * 
 * Proxies a sync request to the Python backend.
 */
export async function POST(req: Request) {
    const ip = getClientIp(req);

    // ── Rate Limiting (Heavy Tier) ──
    const rateCheck = checkRateLimit(`system-sync:${ip}`, RATE_LIMITS.heavy);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Sync limit reached. Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        const body = await req.json();
        const validation = triggerSyncSchema.safeParse(body);

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid sync request", 400, formatZodErrors(validation.error));
        }

        const { entity, listingId } = validation.data;

        const result = startBackgroundSync();
        if (!result.started) {
            return apiError("SYNC_ALREADY_RUNNING", result.message, 409);
        }

        return apiSuccess({
            message: "Sync task initiated in the background.",
            jobId: "sync_started",
            details: {
                status: result.status,
                requestedEntity: entity,
                requestedListingId: listingId || null,
            },
        }, undefined, 202);

    } catch (error: any) {
        console.error("❌ [v1/system/sync POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to start sync task", 500);
    }
}
