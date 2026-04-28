'use client'

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { usePropertyStore } from '@/stores/property-store'
import { callAIAgent, extractText } from '@/lib/agents/ai-agent'
import { MANAGER_AGENT_ID, ACTIVITY_STEPS } from '@/lib/agents/constants'
import type { ChatMessage, PricingData } from '@/types/chat'

export function useChat() {
  const {
    messages,
    isLoading,
    activityStep,
    sessionId,
    addMessage,
    setLoading,
    setActivityStep,
  } = useChatStore()
  const { activeProperty } = usePropertyStore()

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      // Add user message
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
        propertyId: activeProperty?.id,
      }
      addMessage(userMessage)
      setLoading(true)

      // Build context
      let contextMessage = content
      if (activeProperty) {
        const ctx = [
          `Property: ${activeProperty.name}`,
          `Area: ${activeProperty.area}`,
          `Type ID: ${activeProperty.propertyTypeId}`,
          `Bedrooms: ${activeProperty.bedroomsNumber}`,
          `Base Price: ${activeProperty.price} ${activeProperty.currencyCode}`,
          `Price Range: ${activeProperty.priceFloor}-${activeProperty.priceCeiling} ${activeProperty.currencyCode}`,
          activeProperty.personCapacity
            ? `Max Guests: ${activeProperty.personCapacity}`
            : null,
          activeProperty.amenities?.length
            ? `Amenities: ${(activeProperty.amenities as string[]).join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join('. ')
        contextMessage = `[Context: ${ctx}]\n\n${content}`
      }

      // Run activity animation
      let stepIndex = 0
      const activityInterval = setInterval(() => {
        if (stepIndex < ACTIVITY_STEPS.length) {
          setActivityStep(stepIndex)
          stepIndex++
        } else {
          clearInterval(activityInterval)
        }
      }, 2000)

      try {
        const result = await callAIAgent(contextMessage, MANAGER_AGENT_ID, {
          session_id: sessionId,
        })

        clearInterval(activityInterval)
        setActivityStep(null)

        const response = result.response

        if (result.success && response?.status === 'success') {
          const data = response.result
          let structured: PricingData | null = null

          if (data?.recommended_price_aed || data?.risk_level) {
            structured = {
              recommended_price_aed: data.recommended_price_aed,
              risk_level: data.risk_level,
              confidence: data.confidence,
              reasoning: data.reasoning,
              event_context: data.event_context,
              market_signals: data.market_signals,
              booking_window_advice: data.booking_window_advice,
              current_price: data.current_price,
              price_change_pct: data.price_change_pct,
            }
          }

          const text = extractText(response)
          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: text || 'Here is my analysis:',
            timestamp: new Date(),
            structured,
            propertyId: activeProperty?.id,
          }
          addMessage(assistantMessage)
        } else {
          addMessage({
            id: `msg-${Date.now()}`,
            role: 'error',
            content: response?.message || result.error || 'Failed to get response',
            timestamp: new Date(),
          })
        }
      } catch (error) {
        clearInterval(activityInterval)
        setActivityStep(null)
        addMessage({
          id: `msg-${Date.now()}`,
          role: 'error',
          content: error instanceof Error ? error.message : 'An error occurred',
          timestamp: new Date(),
        })
      } finally {
        setLoading(false)
      }
    },
    [isLoading, activeProperty, sessionId, addMessage, setLoading, setActivityStep]
  )

  return { messages, isLoading, activityStep, sendMessage }
}
