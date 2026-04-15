# Collection: `hostawayconversations`

**Topic:** Guest Message History
**Agent Access:** READ-ONLY (Guest Reply Agent, Summary Agent)

## Description
This collection stores raw message threads from the Hostaway PMS synchronization. Each document contains the full chronological history of messages between a guest and the property manager.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `guestName` | String | Full guest name. |
| `status` | Enum | `open`, `closed`, `needs_reply`. |
| `messages` | Object[] | Array of: `{ sender: 'guest'|'admin', text: string, timestamp: Date }`. |
| `lastMessageAt` | Date | Used to sort the inbox by activity. |

## Relationship Logic
- **Sentiment Source:** The `Conversation Summary Agent` parses this collection to determine the "mood" of the guest across the property portfolio.
- **Reply Context:** The `Guest Reply Agent` reads the `messages` array to generate context-aware professional responses.
