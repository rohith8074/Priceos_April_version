import { PriceProposal, ReviewedProposal } from "./types";
import { EventSignal } from "@/data/mock-events";
import {
  CompetitorSignal,
} from "@/data/mock-competitors";
import { CalendarDay } from "@/types/hostaway";
import {
  eachDayOfInterval,
  parseISO,
  differenceInDays,
  format,
} from "date-fns";

/**
 * Mock Pricing Optimizer Agent
 * Generates price proposals based on:
 * - Event signals
 * - Competitor market signals
 * - Booking velocity and demand patterns
 * - Seasonal and day-of-week patterns
 */

export interface OptimizerInput {
  listingMapId: number;
  calendar: CalendarDay[];
  dateRange: {
    start: Date;
    end: Date;
  };
  events: EventSignal[];
  competitorSignals: CompetitorSignal[];
  propertyInfo: { price: number; priceFloor: number; priceCeiling: number; area: string };
}

export function generatePriceProposals(
  inputs: OptimizerInput[]
): PriceProposal[] {
  const proposals: PriceProposal[] = [];
  let proposalId = 1;

  inputs.forEach((input) => {
    const property = input.propertyInfo;

    const daysInRange = eachDayOfInterval({
      start: input.dateRange.start,
      end: input.dateRange.end,
    });

    daysInRange.forEach((date, dayIndex) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const currentDay = input.calendar.find((d) => d.date === dateStr);

      if (!currentDay || currentDay.status !== "available") {
        return;
      }

      // 1. Get relevant events for this date
      const relevantEvents = input.events.filter((e) => {
        const start = parseISO(e.startDate);
        const end = parseISO(e.endDate);
        return date >= start && date <= end;
      });

      // 2. Get relevant competitor signals
      const relevantSignals = input.competitorSignals.filter((s) => {
        const start = parseISO(s.dateRange.start);
        const end = parseISO(s.dateRange.end);
        return (
          date >= start &&
          date <= end &&
          s.area === property.area
        );
      });

      // 3. Calculate booking velocity
      const daysUntilDate = differenceInDays(date, new Date());
      const bookingVelocity = calculateBookingVelocity(
        daysUntilDate,
        (currentDay.status as string) === "booked"
      );

      // 4. Calculate base proposal
      const proposal = calculateProposal({
        listingMapId: input.listingMapId,
        date: dateStr,
        currentPrice: currentDay.price,
        basePrice: property.price,
        floor: property.priceFloor,
        ceiling: property.priceCeiling,
        events: relevantEvents,
        competitorSignals: relevantSignals,
        bookingVelocity,
        daysUntilDate,
      });

      proposals.push({
        id: `PROP-${proposalId++}`,
        ...proposal,
      } as any);
    });
  });

  return proposals;
}

function calculateBookingVelocity(
  daysUntilDate: number,
  isBooked: boolean
): string {
  if (isBooked) return "high";
  if (daysUntilDate < 7) return "extreme";
  if (daysUntilDate < 14) return "high";
  if (daysUntilDate < 30) return "medium";
  return "low";
}

interface ProposalCalcInput {
  listingMapId: number;
  date: string;
  currentPrice: number;
  basePrice: number;
  floor: number;
  ceiling: number;
  events: EventSignal[];
  competitorSignals: CompetitorSignal[];
  bookingVelocity: string;
  daysUntilDate: number;
}

function calculateProposal(input: ProposalCalcInput): any {
  let priceMultiplier = 1.0;
  let reasoning = "Base price";

  // 1. Event impact
  const eventImpact = calculateEventImpact(input.events);
  if (eventImpact.multiplier !== 1.0) {
    priceMultiplier *= eventImpact.multiplier;
    reasoning += ` + Event impact (${eventImpact.reason})`;
  }

  // 2. Competitor signal impact
  const competitorImpact = calculateCompetitorImpact(
    input.competitorSignals,
    input.currentPrice
  );
  if (competitorImpact.multiplier !== 1.0) {
    priceMultiplier *= competitorImpact.multiplier;
    reasoning += ` + Competitor signal (${competitorImpact.reason})`;
  }

  // 3. Booking velocity impact
  const velocityImpact = calculateVelocityImpact(
    input.bookingVelocity,
    input.daysUntilDate
  );
  if (velocityImpact.multiplier !== 1.0) {
    priceMultiplier *= velocityImpact.multiplier;
    reasoning += ` + Booking velocity (${velocityImpact.reason})`;
  }

  const proposedPrice = Math.round(input.currentPrice * priceMultiplier);
  const clampedPrice = Math.max(
    input.floor,
    Math.min(input.ceiling, proposedPrice)
  );
  const changePct = Math.round(
    ((clampedPrice - input.currentPrice) / input.currentPrice) * 100
  );

  // Determine risk level
  const riskLevel = determineRiskLevel(Math.abs(changePct));

  return {
    listingMapId: input.listingMapId,
    date: input.date,
    currentPrice: input.currentPrice,
    proposedPrice: clampedPrice,
    changePct,
    riskLevel,
    reasoning,
    signals: {
      events: input.events,
      demand: {
        bookingVelocity: input.bookingVelocity,
        occupancyTrend: "increasing", // Simplified
        daysUntilFull:
          input.daysUntilDate < 14
            ? Math.max(1, 14 - input.daysUntilDate)
            : undefined,
      },
      patterns: {
        dayOfWeek: getDateDayOfWeek(input.date),
        seasonal: "Peak season",
        avgPrice: input.basePrice,
      },
      competition: {
        marketSignal: input.competitorSignals[0]?.signal || "stable",
        pricePosition: getPricePosition(
          clampedPrice,
          input.currentPrice,
          input.basePrice
        ),
        avgMarketPrice:
          input.competitorSignals[0]?.dataPoints.averagePrice ||
          input.currentPrice,
      },
    },
  };
}

function calculateEventImpact(
  events: EventSignal[]
): { multiplier: number; reason: string } {
  if (events.length === 0) {
    return { multiplier: 1.0, reason: "No events" };
  }

  // Use highest impact event
  const maxEvent = events.reduce((prev, current) =>
    getImpactScore(current.demandImpact) >
    getImpactScore(prev.demandImpact)
      ? current
      : prev
  );

  const multiplier =
    {
      low: 1.05,
      medium: 1.15,
      high: 1.25,
      extreme: 1.35,
    }[maxEvent.demandImpact] || 1.0;

  return { multiplier, reason: maxEvent.name };
}

function calculateCompetitorImpact(
  signals: CompetitorSignal[],
  currentPrice: number
): { multiplier: number; reason: string } {
  if (signals.length === 0) {
    return { multiplier: 1.0, reason: "No competitor signals" };
  }

  // Use highest confidence signal
  const bestSignal = signals.reduce((prev, current) =>
    current.confidence > prev.confidence ? current : prev
  );

  const priceChange = bestSignal.dataPoints.priceChange / 100;
  const multiplier = 1.0 + priceChange * 0.5; // Half the market change

  const signalName = bestSignal.signal === "compression" ? "Rising" : "Falling";
  return { multiplier, reason: signalName };
}

function calculateVelocityImpact(
  bookingVelocity: string,
  daysUntilDate: number
): { multiplier: number; reason: string } {
  if (daysUntilDate > 30) {
    return { multiplier: 1.0, reason: "Long lead time" };
  }

  const multiplier =
    {
      extreme: 1.25,
      high: 1.15,
      medium: 1.05,
      low: 0.95,
    }[bookingVelocity] || 1.0;

  return { multiplier, reason: bookingVelocity };
}

function determineRiskLevel(
  changePctAbs: number
): "low" | "medium" | "high" {
  if (changePctAbs <= 10) return "low";
  if (changePctAbs <= 20) return "medium";
  return "high";
}

function getImpactScore(impact: string): number {
  return (
    {
      extreme: 4,
      high: 3,
      medium: 2,
      low: 1,
    }[impact] || 0
  );
}

function getPricePosition(
  proposed: number,
  current: number,
  base: number
): string {
  const ratio = proposed / base;
  if (ratio > 1.1) return "above_market";
  if (ratio < 0.9) return "below_market";
  return "market_neutral";
}

function getDateDayOfWeek(dateStr: string): string {
  const date = parseISO(dateStr);
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[date.getDay()];
}

/**
 * Mock Adjustment Reviewer Agent
 * Reviews proposals and applies guardrails
 */

export function reviewProposals(proposals: PriceProposal[]): ReviewedProposal[] {
  return proposals.map((proposal) => {
    const guardrails: string[] = [];
    let approved = true;
    let vetoReason: string | undefined;
    let adjustedPrice: number | undefined;

    // Guardrail 1: Price bounds
    const pAny = proposal as any;
    if (proposal.proposedPrice < pAny.signals?.patterns?.avgPrice! * 0.5) {
      guardrails.push("floor_check");
    }
    if (proposal.proposedPrice > pAny.signals?.patterns?.avgPrice! * 2) {
      guardrails.push("ceiling_check");
    }

    // Guardrail 2: Change magnitude
    if (Math.abs(proposal.changePct) > 30) {
      if (proposal.riskLevel === "high") {
        guardrails.push("high_volatility_check");
      }
    }

    // Guardrail 3: Event confidence
    const lowConfidenceEvents = pAny.signals?.events?.filter(
      (e: any) => e.confidence < 0.7
    );
    if (lowConfidenceEvents && lowConfidenceEvents.length > 0) {
      guardrails.push("event_confidence_check");
    }

    // Guardrail 4: Low-risk auto-approval
    if (proposal.riskLevel === "low" && Math.abs(proposal.changePct) <= 10) {
      approved = true;
    }
    // Guardrail 5: High-risk escalation
    else if (
      proposal.riskLevel === "high" &&
      Math.abs(proposal.changePct) > 25
    ) {
      // Require manual review
      approved = false;
      vetoReason = "High volatility - requires manual review";
    }

    return {
      proposal,
      approved,
      vetoReason,
      guardrailsApplied: guardrails,
      reviewedAt: new Date().toISOString(),
    };
  });
}
