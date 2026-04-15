# Collection: `listings`

**Topic:** Property Master Registry
**Agent Access:** READ (Primary) / WRITE (Benchmark Agent - updates stats)

## Description
This is the master registry for all short-term rental properties managed by PriceOS. Every other collection (inventory, reservations, rules) references the `_id` of this collection as `listingId`. It contains static metadata, location data, and critical pricing guardrails.

## Schema & Fields

| Field | Type | Semantic Meaning |
|---|---|---|
| `_id` | ObjectId | The unique internal ID for this property. Used as `listingId` in other collections. |
| `orgId` | ObjectId | The ID of the owner/organization. All queries must be scoped to this. |
| `hostawayId` | String | External ID from the Hostaway PMS (used for syncing). |
| `name` | String | The public name of the property (e.g., "Luxury Marina View Suite"). |
| `city` | String | The city where the property is located (e.g., "Dubai"). |
| `area` | String | Specific neighborhood (e.g., "Dubai Marina"). Critical for competitor analysis. |
| `price` | Number | The current default nightly base price (AED). |
| `priceFloor` | Number | **MANDATORY LOWER LIMIT.** Agents must NEVER propose a price below this. |
| `priceCeiling` | Number | **MANDATORY UPPER LIMIT.** Agents must NEVER propose a price above this. |
| `currencyCode` | String | Usually "AED". |
| `bedroomsNumber` | Number | Number of bedrooms. Use for identifying comparable properties. |
| `bathroomsNumber`| Number | Number of bathrooms. |
| `personCapacity` | Number | Maximum guest count. |
| `isActive` | Boolean | If false, the property is hidden and pricing updates are disabled. |

## Relationship Logic
- **Inventory Parent:** Every date in `inventorymasters` belongs to a listing in this collection.
- **Rules Parent:** Rules in `pricingrules` are applied specifically to these listings.
- **Market Anchor:** The `area` field here determines which `marketevents` and `benchmarkdatas` are relevant to the property.
