import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { buildAgentContext } from '@/lib/agents/db-context-builder'
import { callLyzrAgent } from '@/lib/lyzr/client'

interface NormalizedAgentResponse {
  status: 'success' | 'error'
  result: Record<string, any>
  message?: string
  metadata?: {
    agent_name?: string
    timestamp?: string
    [key: string]: any
  }
}

function normalizeResponse(parsed: any): NormalizedAgentResponse {
  if (!parsed) {
    return {
      status: 'error',
      result: {},
      message: 'Empty response from agent',
    }
  }

  if (typeof parsed === 'string') {
    return {
      status: 'success',
      result: { text: parsed },
      message: parsed,
    }
  }

  if (typeof parsed !== 'object') {
    return {
      status: 'success',
      result: { value: parsed },
      message: String(parsed),
    }
  }

  if ('status' in parsed && 'result' in parsed) {
    return {
      status: parsed.status === 'error' ? 'error' : 'success',
      result: parsed.result || {},
      message: parsed.message,
      metadata: parsed.metadata,
    }
  }

  if ('status' in parsed) {
    const { status, message, metadata, ...rest } = parsed
    return {
      status: status === 'error' ? 'error' : 'success',
      result: Object.keys(rest).length > 0 ? rest : {},
      message,
      metadata,
    }
  }

  if ('result' in parsed) {
    return {
      status: 'success',
      result: parsed.result,
      message: parsed.message,
      metadata: parsed.metadata,
    }
  }

  if ('message' in parsed && typeof parsed.message === 'string') {
    return {
      status: 'success',
      result: { text: parsed.message },
      message: parsed.message,
    }
  }

  if ('response' in parsed) {
    return normalizeResponse(parsed.response)
  }

  return {
    status: 'success',
    result: parsed,
    message: undefined,
    metadata: undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, agent_id, session_id, cache, listing_id } = body
    const resolvedAgentId = agent_id || process.env.AGENT_ID

    if (!message || !resolvedAgentId) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'message and agent_id are required',
          },
          error: 'message and agent_id are required',
        },
        { status: 400 }
      )
    }

    // Get authenticated user
    const session = await getSession()

    if (!session?.userId) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: 'Unauthorized',
          },
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    let finalMessage = message;
    if (session.orgId) {
       try {
          const dbContext = await buildAgentContext(session.orgId, listing_id);
          finalMessage = `[SYSTEM CONTEXT - USE EXCLUSIVELY]\n${dbContext}\n\n[USER QUESTION]\n${message}`;
       } catch (err) {
          console.error("Failed to build DB context:", err);
       }
    }

    const finalSessionId = session_id || `${resolvedAgentId}-${session.userId}`
    const lyzrResult = await callLyzrAgent({
      message: finalMessage,
      agentId: resolvedAgentId,
      userId: session.userId,
      sessionId: finalSessionId,
    })

    if (!lyzrResult.ok) {
      return NextResponse.json(
        {
          success: false,
          response: {
            status: 'error',
            result: {},
            message: lyzrResult.error || 'Lyzr agent error',
          },
          error: lyzrResult.error || 'Lyzr agent error',
        },
        { status: 502 }
      )
    }

    const normalized = normalizeResponse(lyzrResult.parsedJson || lyzrResult.response)

    return NextResponse.json({
      success: true,
      response: normalized,
      agent_id: resolvedAgentId,
      user_id: session.userId,
      session_id: finalSessionId,
      timestamp: new Date().toISOString(),
      raw_response: lyzrResult.response,
    })

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Server error'
    return NextResponse.json(
      {
        success: false,
        response: { status: 'error', result: {}, message: errorMsg },
        error: errorMsg,
      },
      { status: 500 }
    )
  }
}
