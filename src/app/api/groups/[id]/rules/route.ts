import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PricingRule } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json([], { status: 400 });
    }

    await connectToDatabase();
    const groupOid = new Types.ObjectId(id);

    const rules = await PricingRule.find({ groupId: groupOid }).lean();

    const mappedRules = rules.map((r: any) => ({
      ...r,
      _id: r._id.toString(),
      orgId: r.orgId.toString(),
      listingId: r.listingId?.toString() || null,
      groupId: r.groupId?.toString() || null
    }));

    return NextResponse.json(mappedRules, { status: 200 });
  } catch (err: any) {
    console.error(`[api/groups/rules] GET error`, err);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const { id } = params;
    const body = await req.json();

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid groupId" }, { status: 400 });
    }

    await connectToDatabase();
    const { PropertyGroup } = await import("@/lib/db/models");
    const group = await PropertyGroup.findById(new Types.ObjectId(id)).lean();
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const doc = await PricingRule.create({
      ...body,
      orgId: group.orgId,
      groupId: group._id,
      scope: "group"
    });

    const mapped = {
      ...doc.toObject(),
      _id: doc._id.toString(),
      orgId: doc.orgId.toString(),
      groupId: doc.groupId?.toString() || null,
      listingId: doc.listingId?.toString() || null
    };

    return NextResponse.json(mapped, { status: 201 });
  } catch (err: any) {
    console.error(`[api/groups/rules] POST error`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
