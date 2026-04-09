import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "priceos-session";

const PUBLIC_PATHS = [
  "/login",
  "/waitlist",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/v1/auth",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isValidToken(token: string): boolean {
  try {
    // Edge-compatible JWT decode (no crypto verification needed just for routing)
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Decode base64url payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    const payload = JSON.parse(jsonPayload);

    // Check expiration if present
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    }

    return true;
  } catch (err) {
    console.log("[Middleware] isValidToken error:", err);
    return false;
  }
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — always allow
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon.png") ||
    pathname.startsWith("/apple-icon")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  console.log(`[Middleware] Checking path ${pathname} | token exists:`, !!token);
  const valid = token ? isValidToken(token) : false;
  console.log(`[Middleware] token valid:`, valid);

  // Root redirect
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(valid ? "/dashboard" : "/login", request.url)
    );
  }

  // API routes — return 401 JSON instead of redirect
  if (pathname.startsWith("/api/") && !valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes — redirect to login
  if (!valid) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Already logged in, don't show login page
  if (valid && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icon\\.png|apple-icon\\.png).*)",
  ],
};
