/**
 * GET  /api/v1/system/state  — returns current system state
 * POST /api/v1/system/state  — transitions to a new state
 *
 * Valid transitions (PRD Part 3):
 *   connected  → observing
 *   observing  → simulating | paused
 *   simulating → active | observing | paused
 *   active     → paused
 *   paused     → observing   (resume always goes to Observing, not Active)
 *
 * Execution (writing to Hostaway) is only allowed in `active` state.
 */

import { apiSuccess, apiError } from "@/lib/api/response";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { getSession } from "@/lib/auth/server";
import { connectDB, Organization } from "@/lib/db";
import { SYSTEM_STATE_TRANSITIONS, SystemState } from "@/lib/db/models/Organization";
import mongoose from "mongoose";

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`system-state-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const session = await getSession();
    if (!session?.orgId) {
        return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    try {
        await connectDB();
        const org = await Organization.findById(new mongoose.Types.ObjectId(session.orgId))
            .select("systemState systemStateSince pauseReason")
            .lean();

        if (!org) return apiError("NOT_FOUND", "Organization not found", 404);

        const current: SystemState = org.systemState ?? "connected";
        return apiSuccess({
            state: current,
            since: org.systemStateSince ?? null,
            pauseReason: org.pauseReason ?? null,
            allowedTransitions: SYSTEM_STATE_TRANSITIONS[current],
            canExecute: current === "active",
        });
    } catch (error) {
        console.error("❌ [v1/system/state GET]", error);
        return apiError("INTERNAL_ERROR", "Failed to read system state", 500);
    }
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`system-state-post:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const session = await getSession();
    if (!session?.orgId) {
        return apiError("UNAUTHORIZED", "Authentication required", 401);
    }

    let body: { targetState?: string; pauseReason?: string };
    try {
        body = await request.json();
    } catch {
        return apiError("PARSE_ERROR", "Request body must be valid JSON", 400);
    }

    const { targetState, pauseReason } = body;
    const VALID_STATES: SystemState[] = ["connected", "observing", "simulating", "active", "paused"];

    if (!targetState || !VALID_STATES.includes(targetState as SystemState)) {
        return apiError(
            "VALIDATION_ERROR",
            `targetState must be one of: ${VALID_STATES.join(", ")}`,
            400
        );
    }

    try {
        await connectDB();
        const org = await Organization.findById(new mongoose.Types.ObjectId(session.orgId))
            .select("systemState")
            .lean();

        if (!org) return apiError("NOT_FOUND", "Organization not found", 404);

        const current: SystemState = org.systemState ?? "connected";
        const target = targetState as SystemState;

        // Enforce valid transition
        const allowed = SYSTEM_STATE_TRANSITIONS[current];
        if (!allowed.includes(target)) {
            return apiError(
                "INVALID_TRANSITION",
                `Cannot transition from '${current}' to '${target}'. ` +
                `Allowed: ${allowed.join(", ")}`,
                422
            );
        }

        const update: Record<string, unknown> = {
            systemState: target,
            systemStateSince: new Date(),
        };

        if (target === "paused") {
            update.pauseReason = pauseReason ?? "Manual pause";
        } else {
            update.pauseReason = null;
        }

        await Organization.findByIdAndUpdate(
            new mongoose.Types.ObjectId(session.orgId),
            { $set: update }
        );

        console.log(`[SystemState] ${session.orgId}: ${current} → ${target}`);

        return apiSuccess({
            previousState: current,
            state: target,
            since: update.systemStateSince,
            pauseReason: target === "paused" ? update.pauseReason : null,
            canExecute: target === "active",
            allowedTransitions: SYSTEM_STATE_TRANSITIONS[target],
        });
    } catch (error) {
        console.error("❌ [v1/system/state POST]", error);
        return apiError("INTERNAL_ERROR", "Failed to update system state", 500);
    }
}
