// PriceOS Lyzr Agents (Updated: 2026-03-03 from live Lyzr Studio)
export const CRO_ROUTER_AGENT_ID = '69998743f4d61186679a9515'     // CRO Router (orchestrator)
export const PROPERTY_ANALYST_ID = '699987c35dbb137e7b66052e'     // Property Analyst
export const BOOKING_INTELLIGENCE_ID = '699988262654671e44099318'  // Booking Intelligence
export const MARKET_RESEARCH_ID = '699991985dbb137e7b660594'      // Market Research (Agent 4)
export const PRICE_GUARD_ID = '6999933b83d9dff0252dd86f'          // PriceGuard (Agent 5)
export const MARKETING_AGENT_ID = process.env.Marketing_Agent_ID || '699993adb8bd4d3aac102a81'        // Marketing Agent (Agent 6)
export const BENCHMARK_AGENT_ID = process.env.LYZR_Competitor_Benchmark_Agent_ID || '699e7b559ff614f6db8964cf'        // Benchmark Agent (Agent 7)
export const GUARDRAILS_AGENT_ID = process.env.Lyzr_Guardrail_Agent_for_Floor_Ceiling_Values || '69a941c5ad0c99ac601ac935' // Guardrails Agent (Agent 10)

// Legacy exports (for backward compatibility)
export const MANAGER_AGENT_ID = CRO_ROUTER_AGENT_ID
export const EVENT_AGENT_ID = BOOKING_INTELLIGENCE_ID
export const MARKET_AGENT_ID = MARKET_RESEARCH_ID
export const STRATEGY_AGENT_ID = PRICE_GUARD_ID

export const ACTIVITY_STEPS = [
  { id: 'events', label: 'Scanning events & demand signals', icon: 'Zap' },
  { id: 'market', label: 'Analyzing market & competitors', icon: 'BarChart3' },
  { id: 'strategy', label: 'Running pricing strategy', icon: 'ShieldCheck' },
  { id: 'review', label: 'Reviewing & finalizing', icon: 'Check' },
] as const

export const SUGGESTED_PROMPTS = [
  "What should I price Marina Heights for next weekend?",
  "How are competitors pricing in Downtown Dubai?",
  "What events are affecting prices this month?",
  "Should I adjust prices for Ramadan?",
  "Give me a pricing strategy for Palm Villa",
  "What's the optimal price for JBR Beach Studio tonight?",
] as const
