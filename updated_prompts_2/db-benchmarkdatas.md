# Collection: `benchmarkdatas`

**Topic:** Competitive Market Intelligence
**Agent Access:** READ / WRITE (Benchmark Agent)

## Description
This collection stores the pricing benchmarks for each property relative to its local competitors. It provides the "Market Anchor" (median rate) used to set baseline prices before applying local rules.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `p50Rate` | Number | **Market Median / Anchor Rate.** The primary benchmark. |
| `p25Rate` | Number | 25th percentile (budget tier competitor rate). |
| `p75Rate` | Number | 75th percentile (premium tier competitor rate). |
| `p90Rate` | Number | 90th percentile (luxury tier competitor rate). |
| `yourPrice` | Number | The property's price during the last benchmark scan. |
| `percentile` | Number | Where this property fits in the market (0-100). |
| `verdict` | Enum | `UNDERPRICED`, `FAIR`, `OVERPRICED`. |
| `rateTrend` | Enum | `rising`, `stable`, `falling`. |

## Relationship Logic
- **Competitive Anchor:** The `Property Analyst` uses the `p50Rate` as the starting point for dynamic pricing if the property's base price is outdated.
- **Positioning:** The `percentile` determines how aggressively the agent can raise rates during high-demand events.
