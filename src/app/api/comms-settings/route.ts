import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ liveMode: false, autoReply: false }, { status: 200 });
    }

    await connectToDatabase();

    const org = await Organization.findById(new Types.ObjectId(orgId))
      .select("settings.comms")
      .lean() as any;

    if (!org) {
      return NextResponse.json({ liveMode: false, autoReply: false }, { status: 200 });
    }

    return NextResponse.json({
      liveMode: org.settings?.comms?.liveMode ?? false,
      autoReply: org.settings?.comms?.autoReply ?? false,
    });
  } catch (err: any) {
    console.error("[GET /api/comms-settings]", err);
    return NextResponse.json({ liveMode: false, autoReply: false }, { status: 200 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgId, liveMode, autoReply } = body;

    if (!orgId || !Types.ObjectId.isValid(orgId)) {
      return NextResponse.json({ ok: false, error: "Invalid orgId" }, { status: 400 });
    }

    await connectToDatabase();

    await Organization.findByIdAndUpdate(
      new Types.ObjectId(orgId),
      { $set: { "settings.comms.liveMode": !!liveMode, "settings.comms.autoReply": !!autoReply } },
      { new: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[PUT /api/comms-settings]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
