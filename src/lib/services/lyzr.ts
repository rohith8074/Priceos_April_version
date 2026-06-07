export function getLyzrConfig() {
  const chatUrl = process.env.LYZR_API_URL || "https://agent.api.lyzr.ai/v3/inference/chat";
  const apiKey = process.env.LYZR_API_KEY || "";
  return { chatUrl, apiKey };
}

export function extractLyzrMessage(data: any): string {
  if (!data || typeof data !== "object") return "";

  if (typeof data.response === "string") return data.response;

  if (data.response && typeof data.response === "object") {
    if (data.response.message) return String(data.response.message);
    const resultObj = data.response.result;
    if (resultObj && typeof resultObj === "object") {
      if (resultObj.message) return String(resultObj.message);
      if (resultObj.text) return String(resultObj.text);
      if (resultObj.answer) return String(resultObj.answer);
    }
    if (data.response.data) return String(data.response.data);
  }

  if (typeof data.message === "string") return data.message;

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0 && choices[0].message?.content) {
    return choices[0].message.content;
  }

  if (typeof data.result === "string") return data.result;
  if (typeof data.output === "string") return data.output;

  return "";
}

export function extractJson(text: string): Record<string, any> | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // ignore
    }
  }
  return null;
}

export interface LyzrCallResult {
  response: string;
  raw: any;
  ok: boolean;
  parsedJson: Record<string, any> | null;
  error?: string;
}

export async function callLyzrAgent(
  agentId: string,
  message: string,
  userId: string = "priceos-user",
  sessionId?: string,
  systemPromptVariables?: Record<string, any>,
  filterVariables?: Record<string, any>,
  features?: Record<string, any>[],
  timeoutMs: number = 420_000 // 7 min — above Lyzr's 5-min manager timeout so Lyzr errors first
): Promise<LyzrCallResult> {
  const { chatUrl, apiKey } = getLyzrConfig();
  if (!chatUrl) return { response: "", raw: null, ok: false, parsedJson: null, error: "LYZR_API_URL not configured" };
  if (!apiKey) return { response: "", raw: null, ok: false, parsedJson: null, error: "LYZR_API_KEY not configured" };

  const finalSessionId = sessionId || `session-${Date.now()}`;
  
  const payload: any = {
    user_id: userId,
    agent_id: agentId,
    session_id: finalSessionId,
    message,
  };

  if (systemPromptVariables) payload.system_prompt_variables = systemPromptVariables;
  if (filterVariables) payload.filter_variables = filterVariables;
  if (features) payload.features = features;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      return { response: "", raw: null, ok: false, parsedJson: null, error: errText };
    }

    const data = await res.json();
    const msg = extractLyzrMessage(data);

    console.log(`\n================= AGENT CALL: ${agentId} =================`);
    console.log(`[User Message]: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
    console.log(`[Agent Output]:\n${msg}`);
    console.log(`=================================================================\n`);

    return {
      response: msg,
      raw: data,
      ok: true,
      parsedJson: extractJson(msg),
    };
  } catch (err: any) {
    return { response: "", raw: null, ok: false, parsedJson: null, error: err.message || "Unknown error" };
  }
}
