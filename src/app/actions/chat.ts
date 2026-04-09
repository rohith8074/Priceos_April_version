'use server'

import { connectDB, ChatMessage } from '@/lib/db'
import { getSession } from '@/lib/auth/server'
import mongoose from 'mongoose'

export async function saveChatMessage(data: {
  sessionId: string
  role: string
  content: string
  propertyId?: string
  metadata?: Record<string, unknown>
}) {
  await connectDB()
  const session = await getSession()
  const orgId = session?.orgId
    ? new mongoose.Types.ObjectId(session.orgId)
    : new mongoose.Types.ObjectId()

  await ChatMessage.create({
    orgId,
    sessionId: data.sessionId,
    role: data.role as 'user' | 'assistant' | 'system',
    content: data.content,
    context: data.propertyId
      ? { type: 'property', propertyId: new mongoose.Types.ObjectId(data.propertyId) }
      : { type: 'portfolio' },
    metadata: data.metadata ?? {},
  })
}
