export const ACTIVITY_STEPS = [
  {
    id: "routing",
    icon: "Zap",
    label: "Routing Request",
    description: "CRO Router analyzing your query",
  },
  {
    id: "analyzing",
    icon: "BarChart3",
    label: "Analyzing Data",
    description: "Property Analyst processing metrics",
  },
  {
    id: "validating",
    icon: "ShieldCheck",
    label: "Validating Pricing",
    description: "PriceGuard checking proposals",
  },
  {
    id: "generating",
    icon: "Check",
    label: "Generating Response",
    description: "Finalizing recommendations",
  },
] as const;

export type ActivityStep = (typeof ACTIVITY_STEPS)[number];

export const SUGGESTED_PROMPTS = [
  "Analyze my property's pricing performance vs. competitors",
  "What's the optimal nightly rate for the upcoming weekend?",
  "Show me the demand pacing for my neighborhood",
  "Review my current minimum stay rules",
];

export const MANAGER_AGENT_ID = "69998743f4d61186679a9515";

// Optional worker agents (used by UI panels)
export const EVENT_AGENT_ID = "event-agent";
export const MARKET_AGENT_ID = "market-agent";
export const STRATEGY_AGENT_ID = "strategy-agent";

