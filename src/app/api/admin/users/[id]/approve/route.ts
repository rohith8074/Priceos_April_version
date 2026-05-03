import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";

// POST /api/admin/users/[id]/approve
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token) as any;
  const role = payload?.role ?? "viewer";
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await connectToDatabase();

  const org = await Organization.findByIdAndUpdate(id, { isApproved: true }, { new: true })
    .select("name email isApproved")
    .lean() as any;

  if (!org) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ ok: true, user: { id: String(org._id), name: org.name, email: org.email, isApproved: org.isApproved } });
}
