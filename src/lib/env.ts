type EnvValue = string | undefined;

function readEnv(name: string): EnvValue {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function getEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

export function requireEnv(...names: string[]): string {
  const value = getEnv(...names);
  if (value) return value;
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

export function getJwtSecrets() {
  return {
    access: requireEnv("JWT_SECRET"),
    refresh: requireEnv("JWT_REFRESH_SECRET"),
  };
}

export function getLyzrConfig() {
  return {
    apiKey: getEnv("LYZR_API_KEY"),
    chatUrl: getEnv("LYZR_API_URL"),
    streamUrl: getEnv("LYZR_STREAM_URL"),
    baseUrl: getEnv("LYZR_BASE_URL"),
    ragBaseUrl: getEnv("LYZR_RAG_BASE_URL"),
    uploadUrl: getEnv("LYZR_UPLOAD_URL"),
    crawlUrl: getEnv("LYZR_RAG_CRAWL_URL"),
    contextId: getEnv("LYZR_CONTEXT_ID"),
  };
}

export function requireLyzrChatUrl() {
  return requireEnv("LYZR_API_URL");
}

export function requireLyzrBaseUrl() {
  return requireEnv("LYZR_BASE_URL");
}

export function requireLyzrUploadUrl() {
  return requireEnv("LYZR_UPLOAD_URL");
}

export function requireLyzrRagBaseUrl() {
  return requireEnv("LYZR_RAG_BASE_URL");
}

export function requireLyzrRagCrawlUrl() {
  return requireEnv("LYZR_RAG_CRAWL_URL");
}

export function getAgentId(name: string, ...legacyNames: string[]) {
  return getEnv(name, ...legacyNames);
}

export function requireHostawayApiBaseUrl() {
  return requireEnv("HOSTAWAY_API_BASE_URL");
}

export function getDemoSeedCredentials() {
  return {
    email: getEnv("DEMO_EMAIL"),
    password: getEnv("DEMO_PASSWORD"),
  };
}
