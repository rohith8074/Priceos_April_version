'use server'

import { getSession } from '@/lib/auth/server'

export async function saveChatMessage(data: {
  sessionId: string
  role: string
  content: string
  propertyId?: string
  metadata?: Record<string, unknown>
}) {
  // Chat message persistence is handled by the backend API (/api/chat/history)
  // This server action is kept for compatibility but no longer writes directly to MongoDB.
  const session = await getSession()
  if (!session?.orgId) return
  void data // suppress unused var warning
}
