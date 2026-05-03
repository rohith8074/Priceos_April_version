import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("priceos-session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = verifyToken(token) as any;
  const orgId = payload?.orgId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  await Organization.findByIdAndUpdate(orgId, {
    hostawayWebhookId: "manual",
    hostawayWebhookUrl: "manual",
  });

  console.log(`[mark-manual] org=${orgId} marked webhook as manually registered`);
  return NextResponse.json({ ok: true });
}
