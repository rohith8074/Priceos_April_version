"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
    SUPPORT_AGENT_STREAM_EVENT,
    type SupportAgentStreamEventPayload,
} from "@/lib/chat/inference-events"

export interface LyzrAgentEvent {
    feature?: string
    level?: string
    status?: string
    message?: string
    thinking?: string
    event_type?: string
    timestamp?: string
    run_id?: string
    trace_id?: string
    session_id?: string
    log_id?: string
    iteration?: number
    max_iterations?: number
    execution_time?: number
    parallel_execution?: boolean
    agent_name?: string
    arguments?: Record<string, unknown>
    response?: string | Record<string, unknown>
    tool_input?: string
    tool_output?: string | Record<string, unknown>
    function_name?: string
    tool_name?: string
    context_type?: string
}

export interface LyzrAgentEventsState {
    isConnected: boolean
    events: LyzrAgentEvent[]
    lastThinkingMessage: string | null
}

const WS_BASE_URL = process.env.NEXT_PUBLIC_LYZR_WS_BASE_URL ?? "wss://metrics.studio.lyzr.ai/session"
const FALLBACK_WS_API_KEY =
    process.env.NEXT_PUBLIC_LYZR_API_KEY2 ?? process.env.NEXT_PUBLIC_LYZR_API_KEY ?? null
const MAX_SESSION_EVENTS = 180

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value.trim())
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (normalized === "true") return true
        if (normalized === "false") return false
    }
    return undefined
}

function toEventFingerprint(event: LyzrAgentEvent): string {
    return [
        event.timestamp ?? "",
        event.event_type ?? "",
        String(event.iteration ?? ""),
        event.status ?? "",
        event.message ?? "",
        event.thinking ?? "",
        event.function_name ?? "",
        event.tool_name ?? "",
    ].join("::")
}

function normalizeEvent(payload: unknown): LyzrAgentEvent | null {
    const source = asRecord(payload)
    if (!source) return null
    const data = asRecord(source.data)
    const timestamp = asString(source.timestamp) ?? new Date().toISOString()

    const event: LyzrAgentEvent = {
        feature: asString(source.feature) ?? asString(data?.feature),
        level: asString(source.level) ?? asString(data?.level),
        status: asString(source.status) ?? asString(data?.status),
        message: asString(source.message) ?? asString(data?.message),
        thinking: asString(source.thinking) ?? asString(data?.thinking),
        event_type: asString(source.event_type) ?? asString(source.type) ?? asString(data?.event_type),
        timestamp,
        run_id: asString(source.run_id) ?? asString(data?.run_id),
        trace_id: asString(source.trace_id) ?? asString(data?.trace_id),
        session_id: asString(source.session_id) ?? asString(data?.session_id),
        log_id: asString(source.log_id) ?? asString(data?.log_id),
        iteration: asNumber(source.iteration) ?? asNumber(data?.iteration),
        max_iterations: asNumber(source.max_iterations) ?? asNumber(data?.max_iterations),
        execution_time: asNumber(source.execution_time) ?? asNumber(data?.execution_time),
        parallel_execution:
            asBoolean(source.parallel_execution) ?? asBoolean(data?.parallel_execution),
        agent_name: asString(source.agent_name) ?? asString(data?.agent_name),
        arguments:
            asRecord(source.arguments) ??
            asRecord(source.args) ??
            asRecord(data?.arguments) ??
            undefined,
        response:
            asString(source.response) ??
            (asRecord(source.response) ?? asRecord(source.result) ?? asRecord(data?.response) ?? undefined),
        tool_input: asString(source.tool_input) ?? asString(data?.tool_input),
        tool_output:
            asString(source.tool_output) ??
            (asRecord(source.tool_output) ?? asRecord(data?.tool_output) ?? undefined),
        function_name:
            asString(source.function_name) ??
            asString(source.functionName) ??
            asString(data?.function_name),
        tool_name: asString(source.tool_name) ?? asString(source.toolName) ?? asString(data?.tool_name),
        context_type: asString(source.context_type) ?? asString(data?.context_type),
    }

    if (
        !event.message &&
        !event.thinking &&
        !event.event_type &&
        !event.status &&
        !event.function_name &&
        !event.tool_name &&
        !event.arguments &&
        !event.response &&
        !event.tool_output
    ) {
        return null
    }
    return event
}

export function useLyzrAgentEvents(
    sessionId: string | null,
    isProcessing: boolean
): LyzrAgentEventsState {
    const [isConnected, setIsConnected] = useState(false)
    const [events, setEvents] = useState<LyzrAgentEvent[]>([])
    const [lastThinkingMessage, setLastThinkingMessage] = useState<string | null>(null)
    const [wsBaseUrl, setWsBaseUrl] = useState<string>(WS_BASE_URL)
    const [apiKey, setApiKey] = useState<string | null>(FALLBACK_WS_API_KEY)

    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const seenFingerprintsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        let mounted = true
        fetch("/api/chat/status", { cache: "no-store" })
            .then((res) => res.json())
            .then((data: { wsApiKey?: string | null; wsBaseUrl?: string | null }) => {
                if (!mounted) return
                if (data.wsBaseUrl) setWsBaseUrl(data.wsBaseUrl)
                setApiKey(data.wsApiKey ?? FALLBACK_WS_API_KEY)
            })
            .catch(() => {
                if (!mounted) return
                setApiKey(FALLBACK_WS_API_KEY)
            })
        return () => {
            mounted = false
        }
    }, [])

    useEffect(() => {
        seenFingerprintsRef.current = new Set()
        setEvents([])
        setLastThinkingMessage(null)
    }, [sessionId])

    const resetConnection = useCallback(() => {
        if (wsRef.current) {
            try {
                wsRef.current.close()
            } catch {
                // ignore websocket close errors
            }
            wsRef.current = null
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
        }
        setIsConnected(false)
    }, [])

    const ingestEvent = useCallback((payload: unknown) => {
        const normalized = normalizeEvent(payload)
        if (!normalized) {
            // Check if it's a raw string message (some older Lyzr versions)
            if (typeof payload === "string" && payload.trim().length > 0) {
                const text = payload.trim()
                const msgEvent: LyzrAgentEvent = {
                    timestamp: new Date().toISOString(),
                    event_type: "agent_thinking",
                    message: text,
                    thinking: text,
                }
                setEvents((prev) => [msgEvent, ...prev].slice(0, MAX_SESSION_EVENTS))
                if (text.length > 3) setLastThinkingMessage(text)
            }
            return
        }

        const fingerprint = toEventFingerprint(normalized)
        if (seenFingerprintsRef.current.has(fingerprint)) return
        seenFingerprintsRef.current.add(fingerprint)

        setEvents((prev) => [normalized, ...prev].slice(0, MAX_SESSION_EVENTS))
        
        // Prioritize 'thinking' over 'message' for the live status
        const liveText = normalized.thinking || normalized.message
        if (liveText && liveText.trim().length > 3) {
            setLastThinkingMessage(liveText)
        }
    }, [])

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            try {
                const payload = JSON.parse(event.data) as unknown
                ingestEvent(payload)
            } catch {
                // ignore malformed websocket payloads
            }
        },
        [ingestEvent]
    )

    useEffect(() => {
        if (!sessionId || !isProcessing) {
            resetConnection()
            return
        }

        let cancelled = false

        const connect = () => {
            if (cancelled || !sessionId || !isProcessing) return
            const keyQuery = apiKey ? `?x-api-key=${encodeURIComponent(apiKey)}` : ""
            const wsUrl = `${wsBaseUrl}/${encodeURIComponent(sessionId)}${keyQuery}`

            try {
                resetConnection()
                const ws = new WebSocket(wsUrl)
                wsRef.current = ws

                ws.onopen = () => {
                    if (cancelled) return
                    setIsConnected(true)
                }
                ws.onmessage = handleMessage
                ws.onerror = () => {
                    if (cancelled) return
                    setIsConnected(false)
                }
                ws.onclose = () => {
                    if (cancelled) return
                    setIsConnected(false)
                    wsRef.current = null
                    reconnectTimeoutRef.current = setTimeout(connect, 1200)
                }
            } catch {
                setIsConnected(false)
                reconnectTimeoutRef.current = setTimeout(connect, 1200)
            }
        }

        const timeoutId = setTimeout(connect, 100)
        return () => {
            cancelled = true
            clearTimeout(timeoutId)
            resetConnection()
        }
    }, [apiKey, handleMessage, isProcessing, resetConnection, sessionId])

    useEffect(() => {
        if (typeof window === "undefined" || !sessionId || !isProcessing) return

        const onStreamActivity = (event: Event) => {
            const customEvent = event as CustomEvent<SupportAgentStreamEventPayload>
            const detail = customEvent.detail
            if (!detail || detail.sessionId !== sessionId) return
            ingestEvent(detail.event)
        }

        window.addEventListener(SUPPORT_AGENT_STREAM_EVENT, onStreamActivity as EventListener)
        return () => {
            window.removeEventListener(
                SUPPORT_AGENT_STREAM_EVENT,
                onStreamActivity as EventListener
            )
        }
    }, [ingestEvent, isProcessing, sessionId])

    return {
        isConnected,
        events,
        lastThinkingMessage,
    }
}

