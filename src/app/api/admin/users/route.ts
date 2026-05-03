import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";

async function resolveCallerRole(): Promise<{ orgId: string; role: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return null;
  const payload = verifyToken(token) as any;
  if (!payload?.orgId) return null;
  return { orgId: payload.orgId, role: payload.role ?? "viewer" };
}

// GET /api/admin/users — list all orgs
export async function GET() {
  const caller = await resolveCallerRole();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "owner" && caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectToDatabase();

  const orgs = await Organization.find({})
    .select("name email role isApproved marketCode currency plan onboarding createdAt")
    .sort({ createdAt: -1 })
    .lean() as any[];

  const users = orgs.map((o: any) => ({
    id: String(o._id),
    name: o.name,
    email: o.email,
    role: o.role,
    isApproved: o.isApproved,
    marketCode: o.marketCode,
    currency: o.currency,
    plan: o.plan,
    onboardingStep: o.onboarding?.step ?? "connect",
    createdAt: o.createdAt,
  }));

  return NextResponse.json({ users });
}

// POST /api/admin/users — create a new user
export async function POST(req: NextRequest) {
  const caller = await resolveCallerRole();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "owner" && caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { fullName, email, role = "viewer", marketCode = "UAE_DXB", skipOnboarding = false, temporaryPassword } = body;

  if (!fullName?.trim() || !email?.trim()) {
    return NextResponse.json({ error: "fullName and email are required" }, { status: 400 });
  }

  await connectToDatabase();

  const existing = await Organization.findOne({ email: email.toLowerCase().trim() }).lean();
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const password = temporaryPassword?.trim() || Math.random().toString(36).slice(-10) + "!A1";
  const passwordHash = await bcrypt.hash(password, 10);

  const org = await Organization.create({
    name: fullName.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role,
    isApproved: true,
    marketCode,
    currency: "AED",
    timezone: "Asia/Dubai",
    plan: "starter",
    systemState: "connected",
    onboarding: {
      step: skipOnboarding ? "complete" : "connect",
      selectedListingIds: [],
      activatedListingIds: [],
      ...(skipOnboarding ? { completedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({
    user: {
      id: String(org._id),
      email: org.email,
      name: org.name,
      temporaryPassword: password,
    },
  });
}

// PATCH /api/admin/users — update a user's role / onboarding step / approval
export async function PATCH(req: NextRequest) {
  const caller = await resolveCallerRole();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "owner" && caller.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, role, onboardingStep, isApproved } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await connectToDatabase();

  const update: Record<string, unknown> = {};
  if (role !== undefined) update.role = role;
  if (isApproved !== undefined) update.isApproved = isApproved;
  if (onboardingStep !== undefined) update["onboarding.step"] = onboardingStep;

  const org = await Organization.findByIdAndUpdate(userId, update, { new: true })
    .select("name email role isApproved")
    .lean() as any;

  if (!org) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ ok: true, user: { id: String(org._id), name: org.name, email: org.email, role: org.role, isApproved: org.isApproved } });
}
