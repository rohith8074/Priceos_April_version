import { connectDB, Organization } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const org = await Organization.findById(
        new mongoose.Types.ObjectId(session.orgId)
    ).select("-passwordHash -refreshToken").lean();

    if (!org) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
        id: (org._id as mongoose.Types.ObjectId).toString(),
        name: org.name || "",
        fullName: org.fullName || "",
        email: org.email,
        role: org.role,
        isApproved: org.isApproved,
        plan: org.plan || "starter",
        marketCode: org.marketCode || "UAE_DXB",
        currency: org.currency || "AED",
        timezone: org.timezone || "Asia/Dubai",
        hostawayApiKey: org.hostawayApiKey || "",
        hostawayAccountId: org.hostawayAccountId || "",
        systemState: org.systemState || "connected",
        settings: {
            guardrails: {
                maxSingleDayChangePct: org.settings?.guardrails?.maxSingleDayChangePct ?? 15,
                autoApproveThreshold: org.settings?.guardrails?.autoApproveThreshold ?? 5,
                absoluteFloorMultiplier: org.settings?.guardrails?.absoluteFloorMultiplier ?? 0.5,
                absoluteCeilingMultiplier: org.settings?.guardrails?.absoluteCeilingMultiplier ?? 3.0,
            },
            automation: {
                autoPushApproved: org.settings?.automation?.autoPushApproved ?? false,
                dailyPipelineRun: org.settings?.automation?.dailyPipelineRun ?? true,
            },
            overrides: {
                currency: org.settings?.overrides?.currency || null,
                timezone: org.settings?.overrides?.timezone || null,
                weekendDefinition: org.settings?.overrides?.weekendDefinition || null,
            },
        },
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await req.json();

    const $set: Record<string, unknown> = {};

    if (body.name !== undefined) $set.name = body.name;
    if (body.fullName !== undefined) $set.fullName = body.fullName;
    if (body.email !== undefined) $set.email = body.email;
    if (body.hostawayApiKey !== undefined) $set.hostawayApiKey = body.hostawayApiKey;
    if (body.marketCode !== undefined) $set.marketCode = body.marketCode;
    if (body.currency !== undefined) $set.currency = body.currency;
    if (body.timezone !== undefined) $set.timezone = body.timezone;

    if (body.settings?.guardrails) {
        const g = body.settings.guardrails;
        if (g.maxSingleDayChangePct !== undefined)
            $set["settings.guardrails.maxSingleDayChangePct"] = Number(g.maxSingleDayChangePct);
        if (g.autoApproveThreshold !== undefined)
            $set["settings.guardrails.autoApproveThreshold"] = Number(g.autoApproveThreshold);
        if (g.absoluteFloorMultiplier !== undefined)
            $set["settings.guardrails.absoluteFloorMultiplier"] = Number(g.absoluteFloorMultiplier);
        if (g.absoluteCeilingMultiplier !== undefined)
            $set["settings.guardrails.absoluteCeilingMultiplier"] = Number(g.absoluteCeilingMultiplier);
    }

    if (body.settings?.automation) {
        const a = body.settings.automation;
        if (a.autoPushApproved !== undefined)
            $set["settings.automation.autoPushApproved"] = Boolean(a.autoPushApproved);
        if (a.dailyPipelineRun !== undefined)
            $set["settings.automation.dailyPipelineRun"] = Boolean(a.dailyPipelineRun);
    }

    if (body.settings?.overrides) {
        const o = body.settings.overrides;
        if (o.currency !== undefined)
            $set["settings.overrides.currency"] = o.currency || null;
        if (o.timezone !== undefined)
            $set["settings.overrides.timezone"] = o.timezone || null;
        if (o.weekendDefinition !== undefined)
            $set["settings.overrides.weekendDefinition"] = o.weekendDefinition || null;
    }

    if (Object.keys($set).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await Organization.findByIdAndUpdate(
        new mongoose.Types.ObjectId(session.orgId),
        { $set },
        { new: true }
    ).select("-passwordHash -refreshToken").lean();

    if (!updated) {
        return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        id: (updated._id as mongoose.Types.ObjectId).toString(),
        name: updated.name,
        marketCode: updated.marketCode,
        currency: updated.currency,
        timezone: updated.timezone,
        settings: updated.settings,
    });
}
