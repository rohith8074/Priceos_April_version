import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { Listing } from "@/lib/db/models/Listing";
import { InventoryMaster } from "@/lib/db/models/InventoryMaster";
import { Reservation } from "@/lib/db/models/Reservation";
import { ChatMessage } from "@/lib/db/models/ChatMessage";
import { BenchmarkData } from "@/lib/db/models/BenchmarkData";
import { MarketEvent } from "@/lib/db/models/MarketEvent";
import { PricingRule } from "@/lib/db/models/PricingRule";
import { HostawayConversation } from "@/lib/db/models/HostawayConversation";
import { GuestThread } from "@/lib/db/models/guest_thread";
import { Types } from "mongoose";

// DELETE /api/admin/users/[id]
// Caller must be owner/admin and cannot delete themselves.
// Cascades deletion across every collection that belongs to the target org.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Auth: resolve caller from JWT cookie ──────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token) as any;
  if (!payload?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const callerOrgId: string = payload.orgId;
  const callerRole: string  = payload.role ?? "viewer";

  if (callerRole !== "owner" && callerRole !== "admin") {
    return NextResponse.json({ error: "Only owners or admins can delete users." }, { status: 403 });
  }

  const { id: targetOrgId } = await params;

  if (!targetOrgId || !Types.ObjectId.isValid(targetOrgId)) {
    return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  }

  if (targetOrgId === callerOrgId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  await connectToDatabase();

  const targetOrg = await Organization.findById(targetOrgId)
    .select("email name hostawayWebhookId hostawayToken hostawayApiKey")
    .lean() as any;

  if (!targetOrg) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const targetOid = new Types.ObjectId(targetOrgId);
  const log: string[] = [];

  console.log(`[delete-user] ── Deleting org=${targetOrgId} (${targetOrg.email}) requested by caller=${callerOrgId} ──`);

  // ── Step 1: Remove Hostaway webhook ──────────────────────────────────────
  if (targetOrg.hostawayWebhookId) {
    try {
      const bearerToken = targetOrg.hostawayToken || targetOrg.hostawayApiKey || "";
      if (bearerToken) {
        const res = await fetch(
          `https://api.hostaway.com/v1/webhooks/${targetOrg.hostawayWebhookId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              "Cache-control": "no-cache",
            },
          }
        );
        log.push(`webhook removed from Hostaway (status=${res.status})`);
        console.log(`[delete-user]   Webhook id=${targetOrg.hostawayWebhookId} removed — status=${res.status}`);
      }
    } catch (e: any) {
      log.push(`webhook removal attempt failed: ${e?.message}`);
      console.warn(`[delete-user]   Webhook removal failed — continuing: ${e?.message}`);
    }
  }

  // ── Step 2: Collect listing IDs (needed for listing-scoped collections) ──
  const listings = await Listing.find({ orgId: targetOid }).select("_id").lean();
  const listingIds = listings.map((l: any) => l._id);
  console.log(`[delete-user]   Found ${listingIds.length} listings to cascade-delete`);

  // ── Step 3: Delete all org-scoped collections ─────────────────────────────
  type DeleteResult = { deletedCount?: number };

  const results: Record<string, number> = {};

  const del = async (label: string, promise: Promise<DeleteResult>) => {
    try {
      const r = await promise;
      const n = r?.deletedCount ?? 0;
      results[label] = n;
      console.log(`[delete-user]   ${label}: ${n} deleted`);
    } catch (e: any) {
      results[label] = -1;
      console.error(`[delete-user]   ${label} FAILED: ${e?.message}`);
    }
  };

  await del("inventory_masters",      InventoryMaster.deleteMany({ orgId: targetOid }));
  await del("reservations",           Reservation.deleteMany({ orgId: targetOid }));
  await del("chat_messages",          ChatMessage.deleteMany({ orgId: targetOid }));
  await del("benchmark_data",         BenchmarkData.deleteMany({ orgId: targetOid }));
  await del("market_events",          MarketEvent.deleteMany({ orgId: targetOid }));
  await del("pricing_rules",          PricingRule.deleteMany({ orgId: targetOid }));
  await del("hostaway_conversations", HostawayConversation.deleteMany({ orgId: targetOid }));
  await del("guest_threads",          GuestThread.deleteMany({ orgId: targetOid }));
  await del("listings",               Listing.deleteMany({ orgId: targetOid }));

  // ── Step 4: Delete the organization itself ────────────────────────────────
  await Organization.findByIdAndDelete(targetOid);
  console.log(`[delete-user]   Organization record deleted`);
  console.log(`[delete-user] ── Done ──────────────────────────────────────────`);

  return NextResponse.json({
    ok: true,
    deleted: {
      email: targetOrg.email,
      name: targetOrg.name,
      collections: results,
    },
  });
}
