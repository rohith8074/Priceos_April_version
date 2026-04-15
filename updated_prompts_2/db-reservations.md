# Collection: `reservations`

**Topic:** Booking Ledger & Financial Data
**Agent Access:** READ-ONLY (Booking Intelligence, CRO Router)

## Description
This collection stores the confirmed guest bookings synced from the Hostaway PMS. It is the primary source for revenue, occupancy, and guest behavior analytics.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `listingId` | ObjectId | References `listings._id`. |
| `guestName` | String | Guest's full name. |
| `checkIn` | String | Format: `YYYY-MM-DD`. Guest arrival. |
| `checkOut` | String | Format: `YYYY-MM-DD`. Guest departure. |
| `nights` | Number | Total stay duration. |
| `totalPrice` | Number | Gross booking revenue in property currency. |
| `channelName` | String | Source of booking (e.g., Airbnb, Booking.com, Direct). |
| `status` | Enum | `confirmed`, `cancelled`, `staying`. |

## Relationship Logic
- **Revenue Calculation:** Summing `totalPrice` across dates provides the historical revenue data.
- **Gap Identification:** Comparing `reservations` windows against `inventorymasters` helps identify unsold inventory ("gap nights") for the Marketing Agent.
