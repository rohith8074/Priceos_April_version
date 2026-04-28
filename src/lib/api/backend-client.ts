/**
 * src/lib/api/backend-client.ts
 * 
 * Centralized API client for calling the FastAPI backend directly.
 * Handles base URL, auth headers, and response parsing.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function backendFetch(path: string, options: RequestInit = {}) {
  // 1. Get token from localStorage (set during login)
  let token = "";
  if (typeof window !== "undefined") {
    token = localStorage.getItem("priceos-token") || "";
  }

  // 2. Prepare headers
  const headers = new Headers(options.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // 3. Clean path (ensure single slash)
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BACKEND_URL}${cleanPath}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Special handling for SSE (Server-Sent Events)
    if (headers.get("Accept") === "text/event-stream" || response.headers.get("Content-Type")?.includes("text/event-stream")) {
      return response;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.error || `API error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[backendFetch] Error calling ${path}:`, error);
    throw error;
  }
}
