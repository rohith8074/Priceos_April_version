import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const backendRes = await fetch(`${BACKEND}/auth/admin-reset-password?email=${encodeURIComponent(email)}`);
    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[auth/check-reset proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Fix: Frontend sends newPassword, backend expects password
    const backendPayload = {
      email: body.email,
      password: body.newPassword || body.password
    };

    const backendRes = await fetch(`${BACKEND}/auth/admin-reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backendPayload),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[auth/reset proxy]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
