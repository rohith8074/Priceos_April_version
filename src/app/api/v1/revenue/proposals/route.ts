import { connectDB, InventoryMaster, Listing, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getProposalsSchema, bulkProposalActionSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import mongoose from "mongoose";

// ── GET /api/v1/revenue/proposals ────────────────────────────────────────────
// Returns all pending (and optionally filtered) pricing proposals from
// InventoryMaster, enriched with listing metadata.

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-get:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);
    const validation = getProposalsSchema.safeParse({
        listingId: searchParams.get("listingId") || undefined,
        status: searchParams.get("status") || "all",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { listingId, status } = validation.data;

    try {
        await connectDB();

        const session = await getSession();
        if (!session?.orgId) {
            return apiError("UNAUTHORIZED", "Authentication required", 401);
        }
        const orgId = new mongoose.Types.ObjectId(session.orgId);

        // Build filter — always scoped to org
        const filter: Record<string, unknown> = {
            orgId,
            proposedPrice: { $exists: true, $ne: null },
        };

        if (listingId) {
            filter.listingId = new mongoose.Types.ObjectId(String(listingId));
        }

        // Status filter
        if (status !== "all") {
            filter.proposalStatus = status;
        } else {
            // Default: show pending + approved (exclude rejected/pushed)
            filter.proposalStatus = { $in: ["pending", "approved"] };
        }

        const inventoryDocs = await InventoryMaster.find(filter)
            .sort({ date: 1 })
            .limit(200)
            .lean();

        if (inventoryDocs.length === 0) {
            return apiSuccess({ proposals: [], count: 0 });
        }

        // Fetch listing metadata for enrichment (batch by unique listingIds)
        const uniqueListingIds = [...new Set(inventoryDocs.map(d => d.listingId.toString()))];
        const listings = await Listing.find({
            _id: { $in: uniqueListingIds.map(id => new mongoose.Types.ObjectId(id)) },
        }).select("name area currencyCode priceFloor priceCeiling").lean();

        const listingMap = new Map(listings.map(l => [l._id.toString(), l]));

        // Read org guardrails for auto-approve threshold display
        const org = await Organization.findById(orgId)
            .select("settings.guardrails")
            .lean();
        const autoApproveThreshold = org?.settings?.guardrails?.autoApproveThreshold ?? 5;

        const proposals = inventoryDocs.map((doc, idx) => {
            const listing = listingMap.get(doc.listingId.toString());
            const changePct = doc.changePct ?? (
                doc.currentPrice > 0
                    ? Math.round(((doc.proposedPrice! - doc.currentPrice) / doc.currentPrice) * 100)
                    : 0
            );
            return {
                id: idx + 1,                          // numeric id for bulk action compat
                _id: doc._id.toString(),              // real MongoDB id
                listingId: doc.listingId.toString(),
                listingName: listing?.name ?? "Unknown Property",
                area: listing?.area ?? "",
                date: doc.date,
                currentPrice: doc.currentPrice,
                proposedPrice: doc.proposedPrice!,
                currencyCode: listing?.currencyCode ?? "AED",
                priceFloor: listing?.priceFloor ?? doc.currentPrice * 0.5,
                priceCeiling: listing?.priceCeiling ?? doc.currentPrice * 3,
                changePct,
                riskLevel: classifyRisk(changePct, autoApproveThreshold),
                status: doc.proposalStatus ?? "pending",
                reasoning: doc.reasoning ?? "",
                batchId: doc.batchId,
                autoApproved: Math.abs(changePct) <= autoApproveThreshold,
                updatedAt: doc.updatedAt,
            };
        });

        return apiSuccess({
            proposals,
            count: proposals.length,
            autoApproveThreshold,
            pendingCount:  proposals.filter(p => p.status === "pending").length,
            approvedCount: proposals.filter(p => p.status === "approved").length,
        });
    } catch (error: unknown) {
        console.error("❌ [v1/revenue/proposals GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to fetch pricing proposals", 500);
    }
}

function classifyRisk(changePct: number, autoApproveThreshold: number): "low" | "medium" | "high" {
    const abs = Math.abs(changePct);
    if (abs <= autoApproveThreshold) return "low";
    if (abs <= autoApproveThreshold * 3) return "medium";
    return "high";
}

// ── POST /api/v1/revenue/proposals — bulk action ──────────────────────────────
// Supports: approve | reject | push | save
// `ids` are numeric positional IDs from the GET response (1-indexed).
// `_ids` (MongoDB ObjectId strings) are preferred if the client sends them.

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`revenue-proposals-bulk:${ip}`, RATE_LIMITS.standard);
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

        // Accept either numeric ids OR MongoDB _id strings
        const mongoIds: mongoose.Types.ObjectId[] = [];

        if (Array.isArray(body._ids) && body._ids.length > 0) {
            // Preferred: client sends real MongoDB _ids
            for (const id of body._ids) {
                if (mongoose.Types.ObjectId.isValid(id)) {
                    mongoIds.push(new mongoose.Types.ObjectId(id));
                }
            }
        }

        // Validate action via existing schema (ids field optional when _ids provided)
        const validation = bulkProposalActionSchema.safeParse({
            ids: body.ids ?? body._ids?.map((_: unknown, i: number) => i + 1) ?? [1],
            action: body.action,
        });

        if (!validation.success) {
            return apiError("VALIDATION_ERROR", "Invalid bulk request", 400, formatZodErrors(validation.error));
        }

        const { action } = validation.data;

        // Map action → new proposalStatus
        const STATUS_MAP: Record<string, "approved" | "rejected" | "pushed"> = {
            approve: "approved",
            reject:  "rejected",
            apply:   "pushed",
            push:    "pushed",
            save:    "approved", // "save" treated as approve
        };

        const newStatus = STATUS_MAP[action];
        if (!newStatus) {
            return apiError("INVALID_ACTION", `Unknown action: ${action}`, 400);
        }

        // Validate org ownership before updating
        const filter: Record<string, unknown> = { orgId };
        if (mongoIds.length > 0) {
            filter._id = { $in: mongoIds };
        }

        // Guard: only allow pushing already-approved proposals
        if (newStatus === "pushed") {
            filter.proposalStatus = "approved";
        }

        const result = await InventoryMaster.updateMany(filter, {
            $set: { proposalStatus: newStatus },
        });

        // If pushing: save previousPrice, then copy proposedPrice → currentPrice
        if (newStatus === "pushed") {
            const toPush = await InventoryMaster.find(filter).lean();
            for (const doc of toPush) {
                if (doc.proposedPrice != null) {
                    await InventoryMaster.updateOne(
                        { _id: doc._id },
                        {
                            $set: {
                                previousPrice: doc.currentPrice, // snapshot before push
                                currentPrice:  doc.proposedPrice,
                                proposalStatus: "pushed",
                                pushedAt:       new Date(),
                            },
                        }
                    );
                }
            }
        }

        console.log(`💼 [Revenue/Proposals] ${action} → ${newStatus} for ${result.modifiedCount} proposals (org: ${session.orgId})`);

        return apiSuccess({
            processed: result.modifiedCount,
            action,
            newStatus,
            message: `${result.modifiedCount} proposal(s) ${newStatus}.`,
        });

    } catch (error: unknown) {
        console.error("❌ [v1/revenue/proposals POST] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to process bulk pricing action", 500);
    }
}
