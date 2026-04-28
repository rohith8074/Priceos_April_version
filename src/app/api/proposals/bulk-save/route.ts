import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[Bulk Save] Received proposals:", body.proposals?.length || 0);
    return NextResponse.json({ success: true, count: body.proposals?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
