import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const fullPath = path.join("/");
  
  const { searchParams } = new URL(req.url);
  const searchStr = searchParams.toString();
  const upstreamUrl = `${backendUrl}/api/admin/${fullPath}${searchStr ? `?${searchStr}` : ""}`;

  console.log(`[Admin Proxy] ${req.method} /api/admin/${fullPath} -> ${upstreamUrl}`);

  try {
    let body: any = undefined;
    if (["POST", "PATCH", "PUT"].includes(req.method)) {
      body = await req.text();
    }

    const res = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    });

    if (!res.ok) {
      console.error(`[Admin Proxy] Upstream returned status ${res.status}`);
      const text = await res.text();
      return NextResponse.json(
        { error: `Upstream error ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error(`[Admin Proxy] Connection to ${upstreamUrl} failed:`, err);
    return NextResponse.json(
      { error: "Failed to reach Python backend service", details: err.message },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, props);
}

export async function POST(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, props);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, props);
}
