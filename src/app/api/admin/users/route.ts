import { NextRequest, NextResponse } from "next/server";
import { connectDB, Organization, MarketTemplate } from "@/lib/db";
import { getSession } from "@/lib/auth/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list all registered users (admin only)
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectDB();

        const orgs = await Organization.find({})
            .select("_id fullName name email role isApproved marketCode currency plan createdAt onboarding")
            .sort({ createdAt: -1 })
            .lean();

        const users = orgs.map((o: any) => ({
            id: o._id.toString(),
            name: o.fullName || o.name,
            email: o.email,
            role: o.role,
            isApproved: o.isApproved,
            marketCode: o.marketCode,
            currency: o.currency,
            plan: o.plan,
            createdAt: o.createdAt,
            onboardingStep: o.onboarding?.step ?? "complete",
        }));

        return NextResponse.json({ users });
    } catch (err) {
        console.error("[admin/users GET]", err);
        return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }
}

/**
 * POST /api/admin/users
 * Admin creates a new user directly — no self-signup required.
 * Admin can set role, market, and whether to skip the onboarding wizard.
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { fullName, email, role, marketCode, skipOnboarding, temporaryPassword } = await req.json();

        if (!fullName || !email) {
            return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
        }

        await connectDB();

        const existing = await Organization.findOne({ email: email.toLowerCase() });
        if (existing) {
            return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
        }

        const mktCode = marketCode || "UAE_DXB";
        const template = await MarketTemplate.findOne({ marketCode: mktCode });

        // Generate a secure temporary password if not provided
        const rawPassword = temporaryPassword || Math.random().toString(36).slice(-10) + "A1!";
        const passwordHash = await bcrypt.hash(rawPassword, 12);

        const newUser = await Organization.create({
            name: fullName,
            fullName,
            email: email.toLowerCase(),
            passwordHash,
            role: role || "viewer",
            isApproved: true, // Admin-created users are pre-approved
            marketCode: mktCode,
            currency: template?.currency || "AED",
            timezone: template?.timezone || "Asia/Dubai",
            plan: "starter",
            onboarding: {
                step: skipOnboarding ? "complete" : "connect",
                selectedListingIds: [],
                activatedListingIds: [],
                ...(skipOnboarding ? { completedAt: new Date() } : {}),
            },
            settings: {
                guardrails: {
                    maxSingleDayChangePct: template?.guardrailDefaults?.maxSingleDayChangePct ?? 15,
                    autoApproveThreshold: template?.guardrailDefaults?.autoApproveThreshold ?? 5,
                    absoluteFloorMultiplier: template?.guardrailDefaults?.absoluteFloorMultiplier ?? 0.5,
                    absoluteCeilingMultiplier: template?.guardrailDefaults?.absoluteCeilingMultiplier ?? 3.0,
                },
                automation: { autoPushApproved: false, dailyPipelineRun: true },
                overrides: {},
            },
        });

        return NextResponse.json({
            success: true,
            user: {
                id: newUser._id.toString(),
                email: newUser.email,
                name: newUser.fullName,
                role: newUser.role,
                temporaryPassword: rawPassword, // Return once so admin can share with user
            },
        }, { status: 201 });

    } catch (err) {
        console.error("[admin/users POST]", err);
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/users
 * Update an existing user's onboarding step, role, or approval status.
 */
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (session.role !== "owner" && session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { userId, isApproved, role, onboardingStep } = await req.json();
        if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

        await connectDB();

        const updates: Record<string, unknown> = {};
        if (isApproved !== undefined) updates.isApproved = isApproved;
        if (role) updates.role = role;
        if (onboardingStep) {
            updates["onboarding.step"] = onboardingStep;
            if (onboardingStep === "complete") updates["onboarding.completedAt"] = new Date();
        }

        await Organization.findByIdAndUpdate(userId, { $set: updates });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[admin/users PATCH]", err);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}
