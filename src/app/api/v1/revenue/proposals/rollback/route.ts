import { connectDB, InventoryMaster } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import mongoose from "mongoose";

// ── POST /api/v1/revenue/proposals/rollback ───────────────────────────────────
// Rolls back previously pushed proposals.
// Requires: proposals must have proposalStatus="pushed" and a previousPrice set.
// Restores: currentPrice = previousPrice, proposalStatus = "rolled_back"
//
// Body: { _ids: string[] }   ← MongoDB ObjectId strings of pushed inventory docs

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-rollback:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    try {
        await connectDB();

        const session = await getSession();
        if (!session?.orgId) {
            return apiError("UNAUTHORIZED", "Authentication required", 401);
        }
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        const body = await request.json();

        if (!Array.isArray(body._ids) || body._ids.length === 0) {
            return apiError("VALIDATION_ERROR", "_ids must be a non-empty array of proposal IDs", 400);
        }

        const mongoIds: mongoose.Types.ObjectId[] = [];
        for (const id of body._ids) {
            if (mongoose.Types.ObjectId.isValid(id)) {
                mongoIds.push(new mongoose.Types.ObjectId(id));
            }
        }

        if (mongoIds.length === 0) {
            return apiError("VALIDATION_ERROR", "No valid MongoDB ObjectIds provided", 400);
        }

        // Fetch only pushed docs that belong to this org and have a previousPrice
        const pushed = await InventoryMaster.find({
            _id: { $in: mongoIds },
            orgId,
            proposalStatus: "pushed",
            previousPrice: { $exists: true, $ne: null },
        }).lean();

        if (pushed.length === 0) {
            return apiError(
                "NO_ROLLBACK_TARGETS",
                "No pushed proposals with a saved previousPrice found for the given IDs",
                404
            );
        }

        const rolledBack: string[] = [];
        const failed: { id: string; reason: string }[] = [];

        for (const doc of pushed) {
            if (doc.previousPrice == null) {
                failed.push({ id: doc._id.toString(), reason: "No previousPrice recorded" });
                continue;
            }
            try {
                await InventoryMaster.updateOne(
                    { _id: doc._id, orgId },
                    {
                        $set: {
                            currentPrice:   doc.previousPrice,
                            proposalStatus: "rolled_back",
                            rolledBackAt:   new Date(),
                        },
                        $unset: {
                            previousPrice: "",  // clear snapshot after rollback
                        },
                    }
                );
                rolledBack.push(doc._id.toString());
            } catch (err) {
                failed.push({
                    id: doc._id.toString(),
                    reason: err instanceof Error ? err.message : String(err),
                });
            }
        }

        console.log(
            `↩️  [Revenue/Rollback] ${rolledBack.length} rolled back, ${failed.length} failed (org: ${session.orgId})`
        );

        return apiSuccess({
            rolledBack: rolledBack.length,
            failed: failed.length,
            rolledBackIds: rolledBack,
            ...(failed.length > 0 && { failures: failed }),
            message: `${rolledBack.length} proposal(s) rolled back successfully.`,
        });

    } catch (error: unknown) {
        console.error("❌ [v1/revenue/proposals/rollback POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to process rollback", 500);
    }
}
