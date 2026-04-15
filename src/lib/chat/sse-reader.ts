export interface SSEEvent {
    type: "status" | "complete" | "error";
    step?: string;
    message?: string;
    proposals?: any[];
    metadata?: Record<string, any>;
    duration?: number;
}

export async function readSSEStream(
    response: Response,
    onStatus: (msg: string, step: string) => void,
    onComplete: (data: { message: string; proposals?: any[]; metadata?: any }) => void,
    onError: (msg: string) => void,
): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
        onError("No response stream");
        return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
                const evt: SSEEvent = JSON.parse(jsonStr);

                switch (evt.type) {
                    case "status":
                        onStatus(evt.message || "", evt.step || "");
                        break;
                    case "complete":
                        onComplete({
                            message: evt.message || "",
                            proposals: evt.proposals,
                            metadata: evt.metadata,
                        });
                        break;
                    case "error":
                        onError(evt.message || "Unknown error");
                        break;
                }
            } catch {
                // Malformed SSE line — skip
            }
        }
    }
}
