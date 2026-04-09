export interface PricingData {
  recommended_price_aed?: number
  risk_level?: string
  confidence?: number
  reasoning?: string
  event_context?: string
  market_signals?: string
  booking_window_advice?: string
  current_price?: number
  price_change_pct?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
  structured?: PricingData | null
  propertyId?: string | number
}
