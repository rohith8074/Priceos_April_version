import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyToken(token) as any;
    if (!payload || !payload.orgId) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    await connectToDatabase();
    const org = await Organization.findById(payload.orgId).lean();
    
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    
    return NextResponse.json({ settings: org.settings || {} });
  } catch (err) {
    console.error("[user/settings GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const payload = verifyToken(token) as any;
    if (!payload || !payload.orgId) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    
    const body = await req.json();
    await connectToDatabase();
    
    const org = await Organization.findByIdAndUpdate(
      payload.orgId,
      { $set: { settings: body.settings } },
      { returnDocument: "after" }
    );
    
    return NextResponse.json({ success: true, settings: org?.settings || {} });
  } catch (err) {
    console.error("[user/settings POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
