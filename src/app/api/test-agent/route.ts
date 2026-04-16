import { NextResponse } from 'next/server';
import { getAgentId } from '@/lib/env';
import { callLyzrAgent } from '@/lib/lyzr/client';

const NOT_FOUND = NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET() {
  if (process.env.NODE_ENV === "production") return NOT_FOUND;
  try {
    const CRO_AGENT_ID = getAgentId('LYZR_CRO_ROUTER_AGENT_ID', 'AGENT_ID') || '';
    const testQuestion = "What should I price a 1-bedroom apartment in Dubai Marina for next weekend? It has sea view, pool, and gym.";

    console.log('Testing CRO Agent...');
    console.log('Agent ID:', CRO_AGENT_ID);

    const result = await callLyzrAgent({
      agentId: CRO_AGENT_ID,
      message: testQuestion,
      userId: 'test-user-' + Date.now(),
      sessionId: 'test-session-' + Date.now(),
    });

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 502 });
    }

    console.log('Agent responded successfully');

    return NextResponse.json({
      success: true,
      question: testQuestion,
      agent_id: CRO_AGENT_ID,
      response: result.raw,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
