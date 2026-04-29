import mongoose from "mongoose";
import { HostawayClient } from "@/lib/pms/hostaway-client";
import { getOrgHostawayToken } from "@/lib/hostaway/token";
import {
  syncListingsToDb,
  syncReservationsToDb,
  syncCalendarToDb,
  syncConversationsToDb,
} from "@/lib/sync-server-utils";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { Listing } from "@/lib/db/models/Listing";
import { Reservation } from "@/lib/db/models/Reservation";

export type StepStatus = "pending" | "running" | "complete" | "error";

export type SyncStep = {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  detail?: string;
  count?: number;
};

export type GlobalSyncStatus = {
  status: "idle" | "syncing" | "complete" | "error";
  message: string;
  startedAt?: number;
  completedAt?: number;
  steps: SyncStep[];
  errorMessage?: string;
};

declare global {
  var syncStatus: GlobalSyncStatus | undefined;
}

const DEFAULT_STEPS: SyncStep[] = [
  { id: "listings",      label: "Properties",          description: "Syncing your property listings",   status: "pending" },
  { id: "calendar",      label: "Calendar & Pricing",  description: "Fetching 90 days of calendar data", status: "pending" },
  { id: "reservations",  label: "Reservations",        description: "Importing booking history",         status: "pending" },
  { id: "conversations", label: "Guest Conversations", description: "Syncing guest message threads",     status: "pending" },
];

globalThis.syncStatus = globalThis.syncStatus || {
  status: "idle",
  message: "",
  steps: structuredClone(DEFAULT_STEPS),
};

export function getBackgroundSyncStatus(): GlobalSyncStatus {
  return globalThis.syncStatus || { status: "idle", message: "", steps: structuredClone(DEFAULT_STEPS) };
}

function setStep(id: string, patch: Partial<SyncStep>) {
  if (!globalThis.syncStatus) return;
  globalThis.syncStatus.steps = globalThis.syncStatus.steps.map((s) =>
    s.id === id ? { ...s, ...patch } : s
  );
}

export async function performBackgroundSync(orgId?: string) {
  globalThis.syncStatus = {
    status: "syncing",
    message: "Starting sync...",
    startedAt: Date.now(),
    steps: structuredClone(DEFAULT_STEPS),
  };

  try {
    if (!orgId) throw new Error("Missing organization for Hostaway sync.");

    await connectToDatabase();

    const org = await Organization.findById(orgId).select("hostawayApiKey hostawayAccountId");
    if (!org?.hostawayApiKey) {
      throw new Error("Save Hostaway credentials in Settings before running sync.");
    }

    const bearerToken = await getOrgHostawayToken(orgId);
    const client = new HostawayClient(bearerToken);

    console.log("------------------------------------------");
    console.log("🚀 Starting Hostaway Synchronization (BACKGROUND)...");
    console.log("------------------------------------------");

    // ── Step 1: Listings ──────────────────────────────────────────────────────
    setStep("listings", { status: "running", detail: "Fetching from Hostaway…" });
    globalThis.syncStatus!.message = "Syncing property listings…";

    const hListings = await client.listListings();
    const existingCount = await Listing.countDocuments();
    console.log(`📥 Step 1: Fetched ${hListings.length} listings from Hostaway.`);

    setStep("listings", { detail: `Saving ${hListings.length} listings…` });
    await syncListingsToDb(hListings.map((l) => ({ ...l, id: Number(l.id) })), orgId);

    const dbListings = await Listing.find({ orgId }, { hostawayId: 1 });
    const hostawayToInternalIdMap = new Map<number, mongoose.Types.ObjectId>(
      dbListings
        .filter((l) => l.hostawayId)
        .map((l) => [Number(l.hostawayId), l._id as mongoose.Types.ObjectId])
    );

    const newListingCount = (await Listing.countDocuments()) - existingCount;
    console.log(`✅ Step 1 Complete: ${dbListings.length} listings in DB (${newListingCount} new).`);
    setStep("listings", { status: "complete", count: dbListings.length, detail: `${dbListings.length} properties synced` });

    // ── Step 2: Calendar ──────────────────────────────────────────────────────
    setStep("calendar", { status: "running", detail: "Fetching 90-day calendar…" });
    globalThis.syncStatus!.message = "Syncing calendar data…";
    console.log("📥 Step 2: Fetching Calendar data (90-day window)...");

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 90);

    let calendarsSynced = 0;
    let calendarErrors = 0;

    for (let i = 0; i < hListings.length; i++) {
      const hl = hListings[i];
      const internalId = hostawayToInternalIdMap.get(Number(hl.id));
      if (!internalId) continue;

      setStep("calendar", { detail: `Property ${i + 1} of ${hListings.length}…` });
      console.log(`   [${i + 1}/${hListings.length}] Syncing calendar for ${hl.name} (${hl.id})...`);

      try {
        await syncCalendarToDb(client, [internalId], startDate, endDate, Number(hl.id));
        calendarsSynced++;
      } catch (calErr: any) {
        console.error(`   ❌ Failed calendar for ${hl.id}:`, calErr.message);
        calendarErrors++;
      }
    }

    console.log(`✅ Step 2 Complete: Synced ${calendarsSynced} property calendars (${calendarErrors} failed).`);
    setStep("calendar", { status: "complete", count: calendarsSynced, detail: `${calendarsSynced} calendars synced` });

    // ── Step 3: Reservations ──────────────────────────────────────────────────
    setStep("reservations", { status: "running", detail: "Fetching reservations…" });
    globalThis.syncStatus!.message = "Syncing reservations…";
    console.log("📥 Step 3: Fetching Reservations (Limit: 1000)...");

    const hReservations = await client.getReservations({ limit: 1000 } as any);
    console.log(`📥 Fetched ${hReservations.length} reservations from Hostaway.`);

    const existingResCount = await Reservation.countDocuments();
    setStep("reservations", { detail: `Saving ${hReservations.length} reservations…` });

    const mappedReservations = hReservations
      .map((r) => {
        const internalListingId = hostawayToInternalIdMap.get(Number(r.listingMapId));
        if (!internalListingId) return null;
        return { ...r, listingMapId: internalListingId };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (mappedReservations.length > 0) {
      await syncReservationsToDb(mappedReservations as any, new Date(), orgId);
    }

    const newReservationCount = (await Reservation.countDocuments()) - existingResCount;
    console.log(`✅ Step 3 Complete: Reservations synced (${newReservationCount} new).`);
    setStep("reservations", { status: "complete", count: hReservations.length, detail: `${hReservations.length} reservations synced` });

    // ── Step 4: Conversations ─────────────────────────────────────────────────
    setStep("conversations", { status: "running", detail: "Fetching guest threads…" });
    globalThis.syncStatus!.message = "Syncing guest conversations…";
    console.log("📥 Step 4: Fetching Conversations...");

    const convStats = await syncConversationsToDb(hostawayToInternalIdMap, bearerToken, orgId);
    console.log(`✅ Step 4 Complete: Synced ${convStats.synced} conversations (${convStats.errors} errors).`);
    setStep("conversations", { status: "complete", count: convStats.synced, detail: `${convStats.synced} conversations synced` });

    console.log("------------------------------------------");
    console.log("🎉 Hostaway Sync Finished Successfully.");
    console.log("------------------------------------------");

    globalThis.syncStatus = {
      ...globalThis.syncStatus!,
      status: "complete",
      message: "Sync completed successfully!",
      completedAt: Date.now(),
    };
  } catch (err: any) {
    console.error("❌ Critical Sync Error in Background Job:", err);
    globalThis.syncStatus = {
      ...globalThis.syncStatus!,
      status: "error",
      message: err.message || "Unknown sync error",
      errorMessage: err.message,
    };
  }
}

export function startBackgroundSync(orgId?: string) {
  const current = getBackgroundSyncStatus();

  if (current.status === "syncing") {
    return {
      started: false,
      status: "already_syncing" as const,
      message: "A sync is already in progress.",
    };
  }

  performBackgroundSync(orgId)
    .then(() => console.log("Background sync promise resolved."))
    .catch((err) => console.error("Unhandled background sync error:", err));

  return {
    started: true,
    status: "syncing" as const,
    message: "Hostaway synchronization started.",
  };
}
