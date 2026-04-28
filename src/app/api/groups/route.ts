import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PropertyGroup } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ groups: [] }, { status: 200 });
    }

    await connectToDatabase();
    const orgOid = new Types.ObjectId(orgId);

    const groups = await PropertyGroup.find({ orgId: orgOid }).lean();
    
    const mappedGroups = groups.map((g: any) => ({
      ...g,
      _id: g._id.toString(),
      orgId: g.orgId.toString(),
      listingIds: (g.listingIds ?? []).map((id: any) => id.toString())
    }));

    return NextResponse.json({ groups: mappedGroups }, { status: 200 });
  } catch (err: any) {
    console.error("[api/groups] GET error", err);
    return NextResponse.json({ groups: [], error: err.message }, { status: 500 });
  }
}
