export const SUPPORT_AGENT_STREAM_EVENT = "support-agent-stream-event"

export interface SupportAgentActivityEvent {
    feature?: string
    status?: string
    message?: string
    thinking?: string
    event_type?: string
    timestamp?: string
    agent_name?: string
    arguments?: Record<string, unknown>
    response?: string | Record<string, unknown>
    function_name?: string
    tool_name?: string
    context_type?: string
    iteration?: number
    max_iterations?: number
    execution_time?: number
    parallel_execution?: boolean
}

export interface SupportAgentStreamEventPayload {
    sessionId: string
    event: SupportAgentActivityEvent
}

export function emitSupportAgentStreamEvent(
    sessionId: string,
    event: SupportAgentActivityEvent
): void {
    if (typeof window === "undefined") return
    if (!sessionId?.trim()) return
    try {
        window.dispatchEvent(
            new CustomEvent<SupportAgentStreamEventPayload>(SUPPORT_AGENT_STREAM_EVENT, {
                detail: {
                    sessionId,
                    event,
                },
            })
        )
    } catch {
        // best-effort event bus
    }
}

