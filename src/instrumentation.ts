/**
 * Next.js instrumentation hook — runs once at server startup before any routes are served.
 * Validates that all required environment variables are present so the app fails fast
 * with a clear message rather than crashing on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const required: Record<string, string> = {
    MONGODB_URI: "MongoDB connection string",
    JWT_SECRET: "JWT signing secret (access tokens)",
    JWT_REFRESH_SECRET: "JWT signing secret (refresh tokens)",
    LYZR_API_KEY: "Lyzr AI platform API key",
    LYZR_API_URL: "Lyzr chat completions endpoint",
  };

  const missing: string[] = [];

  for (const [name, description] of Object.entries(required)) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      missing.push(`  ${name} — ${description}`);
    }
  }

  if (missing.length > 0) {
    const list = missing.join("\n");
    throw new Error(
      `\n\nMissing required environment variables. Add these to .env.local (dev) or your hosting provider (prod):\n\n${list}\n\nSee docs/environments.md for setup instructions.\n`
    );
  }
}
