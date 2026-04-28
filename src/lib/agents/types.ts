export interface PriceProposal {
  id: string;
  listingId: string;
  listingMapId: string | number;
  date: string;
  currentPrice: number;
  proposedPrice: number;
  changePct: number;
  reasoning: string;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
}

export interface ReviewedProposal {
  proposal: PriceProposal;
  approved: boolean;
  reason?: string;
}

export interface RevenueCycleResult {
  orgId: string;
  timestamp: string;
  approvedProposals: ReviewedProposal[];
  rejectedProposals: ReviewedProposal[];
  stats: {
    total: number;
    approved: number;
    rejected: number;
    autoApproved: number;
    escalated: number;
  };
}

export interface AgentExecutionMetrics {
  agentName: string;
  durationMs: number;
  tokenCount?: number;
  success: boolean;
}
