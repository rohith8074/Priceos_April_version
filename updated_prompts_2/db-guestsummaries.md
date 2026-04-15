# Collection: `guestsummaries`

**Topic:** AI Guest Intelligence & Operations Summary
**Agent Access:** READ / WRITE (Conversation Summary Agent)

## Description
This collection stores the structured analysis of guest conversation threads. Instead of making agents read raw logs every time, this collection provides a pre-processed summary of sentiment, themes, and action items for each property.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `dateFrom` | String | Start of analyzed period (YYYY-MM-DD). |
| `dateTo` | String | End of analyzed period (YYYY-MM-DD). |
| `sentiment` | Enum | `Positive`, `Neutral`, `Needs Attention`. |
| `themes` | String[] | Top recurring conversation topics (e.g. "Pool heating", "Check-in"). |
| `actionItems` | String[]| Actionable tasks for the property manager. |
| `bulletPoints`| String[]| One-line thread summaries. |
| `totalConversations`| Number| Count of threads analyzed. |
| `needsReplyCount`| Number| Number of guests currently waiting for a reply. |

## Relationship Logic
- **UI Data Source:** The **Summary Tab → Guest Insights** panel in the PriceOS Dashboard reads directly from this collection.
- **Agent Output:** The `Conversation Summary Agent` generates/updates these records whenever it is triggered.
