# Collection: `pricingrules`

**Topic:** Automated Pricing Logic & Guardrails
**Agent Access:** READ-ONLY (Property Analyst, PriceGuard)

## Description
This collection stores the dynamic pricing logic defined for each property. These rules act as the "standard operating procedure" that the AI must follow when generating nightly price recommendations.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `name` | String | Rule name (e.g., "Weekend Uplift", "Last-Minute Discount"). |
| `ruleType` | Enum | `DOW` (Day of Week), `LEAD_TIME`, `SEASONAL`. |
| `priority` | Number | Execution order (1 = highest priority). |
| `priceAdjPct` | Number | Percentage to add (positive) or subtract (negative). |
| `daysOfWeek` | Number[] | 0-6 array (0=Sun, 4=Thu, 5=Fri, 6=Sat). |
| `leadTimeDays`| Number | For `LEAD_TIME` rules (e.g., 7 means "apply within 7 days of stay"). |
| `enabled` | Boolean | Whether the rule is currently live. |

## Relationship Logic
- **Calculation Chain:** The `Property Analyst` first determines a "Market Rate", then iterates through these rules in `priority` order to reach a final `proposedPrice`.
- **Precedence:** DOW rules usually have higher priority than lead-time rules.
