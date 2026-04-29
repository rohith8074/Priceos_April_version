import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { PricingRule } from "@/lib/db/models";
import { Types } from "mongoose";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string, ruleId: string }> }) {
  try {
    const params = await props.params;
    const { ruleId } = params;
    const body = await req.json();

    if (!ruleId || !Types.ObjectId.isValid(ruleId)) {
      return NextResponse.json({ error: "Invalid ruleId" }, { status: 400 });
    }

    await connectToDatabase();

    const updated = await PricingRule.findOneAndUpdate(
      { _id: new Types.ObjectId(ruleId) },
      { $set: body },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const mapped = {
      ...updated,
      _id: updated._id.toString(),
      orgId: updated.orgId.toString(),
      groupId: updated.groupId?.toString() || null,
      listingId: updated.listingId?.toString() || null
    };

    return NextResponse.json(mapped, { status: 200 });
  } catch (err: any) {
    console.error(`[api/groups/rules] PUT error`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string, ruleId: string }> }) {
  try {
    const params = await props.params;
    const { ruleId } = params;

    if (!ruleId || !Types.ObjectId.isValid(ruleId)) {
      return NextResponse.json({ error: "Invalid ruleId" }, { status: 400 });
    }

    await connectToDatabase();
    await PricingRule.deleteOne({ _id: new Types.ObjectId(ruleId) });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[api/groups/rules] DELETE error`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
