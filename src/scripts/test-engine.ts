import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import mongoose from "mongoose";
import { connectDB, Listing, PricingRule, InventoryMaster } from "../lib/db";
import { runPipeline } from "../lib/engine/pipeline";

async function test() {
    console.log("🚀 Starting Rule Engine Verification...");

    try {
        await connectDB();

        // 1. Find a listing to test with
        const listing = await Listing.findOne({ isActive: true }).lean();
        if (!listing) {
            console.log("❌ No listings found. Please seed the database first.");
            return;
        }
        const lid = listing._id as mongoose.Types.ObjectId;
        console.log(`\n🏠 Testing with Listing: ${listing.name} (ID: ${lid})`);

        // 2. Configure Autopilot settings
        console.log("⚙️ Configuring Autopilot settings...");
        await Listing.findByIdAndUpdate(lid, {
            $set: {
                lastMinuteEnabled: true,
                lastMinuteDaysOut: 7,
                lastMinuteDiscountPct: 20,
                farOutEnabled: true,
                farOutDaysOut: 30,
                farOutMarkupPct: 15,
                dowPricingEnabled: true,
                dowDays: [4, 5], // Thu, Fri
                dowPriceAdjPct: 10,
            },
        });

        // 3. Add a seasonal rule
        console.log("📅 Adding a seasonal rule...");
        const today = new Date();
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);

        await PricingRule.deleteMany({ listingId: lid });

        await PricingRule.create({
            orgId: listing.orgId,
            listingId: lid,
            ruleType: "SEASON",
            name: "Verification Season",
            enabled: true,
            startDate: today.toISOString().split("T")[0],
            endDate: nextMonth.toISOString().split("T")[0],
            priceAdjPct: 5,
            priority: 10,
            isBlocked: false,
            closedToArrival: false,
            closedToDeparture: false,
            suspendLastMinute: false,
            suspendGapFill: false,
        });

        // 4. Run the pipeline
        console.log("🔄 Running Pricing Pipeline...");
        const run = await runPipeline(lid, "Verification Run");
        if (!run) throw new Error("Pipeline run failed to return a result object.");
        console.log(`✅ Pipeline completed (Status: ${run.status}, Days Changed: ${run.daysChanged})`);

        // 5. Verify results
        console.log("\n📊 Verifying results in InventoryMaster...");
        const results = await InventoryMaster.find({ listingId: lid })
            .sort({ date: 1 })
            .limit(10)
            .lean();

        results.forEach((r) => {
            console.log(
                `  Date: ${r.date} | Current: ${r.currentPrice} | Proposed: ${r.proposedPrice} | Reasoning: ${r.reasoning?.substring(0, 100)}...`
            );
        });

        console.log("\n✨ Verification script finished.");
    } catch (err) {
        console.error("❌ Test failed:", err);
    } finally {
        await mongoose.disconnect();
    }
}

test();
