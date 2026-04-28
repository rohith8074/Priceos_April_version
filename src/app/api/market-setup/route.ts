import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ markets: [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({ success: true, message: "Market setup applied" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
