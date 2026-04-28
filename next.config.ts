import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Stop MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Force HTTPS for 1 year
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Referrer policy
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions policy — disable unused browser features
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Content Security Policy
  // Adjust connect-src if you add more external API origins
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval required by Next.js dev + React
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://agent-prod.studio.lyzr.ai https://app.ticketmaster.com https://api.hostaway.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // ── Turbopack root (dev mode) ────────────────────────────────────────────────
  // Prevents Turbopack from crawling up to the parent lockfile and failing to
  // resolve tailwindcss-animate / other CSS plugins from the wrong node_modules.
  turbopack: {
    root: __dirname,
  },
  // ── Security headers on all routes ──────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // ── Image optimisation ───────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }, // tighten to specific hostnames before launch
    ],
    formats: ["image/avif", "image/webp"],
  },

  // ── Production hardening ─────────────────────────────────────────────────────
  compress: true,

  // Strip React source maps in production to avoid leaking component names
  productionBrowserSourceMaps: false,

  // Fail build on TypeScript errors — never ship broken code
  typescript: { ignoreBuildErrors: false },

  // Server-side packages that must not be bundled into client chunks
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;
