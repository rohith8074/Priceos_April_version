import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  const { path } = await props.params;
  const fullPath = path.join("/");
  
  // Extract query parameters
  const { searchParams } = new URL(req.url);
  const searchStr = searchParams.toString();

  // Determine the upstream URL
  let upstreamPath = `/v1/${fullPath}`;
  if (fullPath === "get-agent-system-status") {
    upstreamPath = "/system-status";
  }

  // Fallback map for paths that might not be prefixed with /v1/ in FastAPI
  const pathMap: Record<string, string> = {
    "get-property-profile": "/v1/get-property-profile",
    "get-property-reservations": "/v1/get-property-reservations",
    "get-property-calendar-metrics": "/v1/get-property-calendar-metrics",
    "get-property-market-events": "/v1/get-property-market-events",
    "get-property-benchmark": "/v1/get-property-benchmark",
    "get-agent-system-status": "/system-status",
  };

  if (pathMap[fullPath]) {
    upstreamPath = pathMap[fullPath];
  }

  const backendUrl = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000";
  const upstreamUrl = `${backendUrl}/api/agent-tools${upstreamPath}${searchStr ? `?${searchStr}` : ""}`;

  console.log(`[Tool Proxy] GET /api/agent-tools/v1/${fullPath} -> ${upstreamUrl}`);

  try {
    const res = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error(`[Tool Proxy] Upstream returned status ${res.status}`);
      const text = await res.text();
      return NextResponse.json(
        { error: `Upstream returned status ${res.status}`, details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error(`[Tool Proxy] Connection to ${upstreamUrl} failed:`, err);
    return NextResponse.json(
      { error: "Failed to reach Python backend service", details: err.message },
      { status: 502 }
    );
  }
}
