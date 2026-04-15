# Collection: `inventorymasters`

**Topic:** Daily Calendar & Pricing Operations
**Agent Access:** READ / WRITE (Property Analyst, PriceGuard, Guardrails)

## Description
This collection stores the daily "state" of each property. It is essentially a calendar of rows, with one document per property per day. It contains the live pricing and availability status, as well as the AI-generated pricing proposals.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `date` | String | Format: `YYYY-MM-DD`. The specific day this record represents. |
| `status` | Enum | `available`, `booked`, or `blocked`. |
| `currentPrice` | Number | The nightly rate currently live on all booking channels. |
| `proposedPrice` | Number | The price recommended by the AI (null if no recommendation yet). |
| `changePct` | Number | The percentage difference between `currentPrice` and `proposedPrice`. |
| `proposalStatus`| Enum | `pending` (needs review), `approved` (sent to PMS), `rejected`. |
| `reasoning` | String | The LLM-generated logic for why this price was chosen. |
| `minStay` | Number | Minimum nights required to book on this date. |

## Relationship Logic
- **Pricing Loop:** The `Property Analyst` reads the `currentPrice`, detects a need for change based on `marketevents`, and writes to `proposedPrice`.
- **Approval Loop:** The User or `PriceGuard` reviews `proposedPrice` and updates `proposalStatus`.
- **Occupancy Source:** `status === 'booked'` defines the actual occupancy state for revenue agents.
