# PriceOS — Semantic Data Dictionary (MongoDB / NoSQL)

**Database:** MongoDB (AWS DocumentDB compatible)
**Collections:** 15 collections — 8 agent-accessible, 7 system-internal
**Data Source:** Hostaway PMS API sync + Lyzr AI Agents + PriceOS backend
**Last Updated:** April 2026

---

## ⚠️ Access Restrictions

- **READ-ONLY access** — agents only read via `buildAgentContext()` injection
- **Agents never query MongoDB directly** — context is pre-built by the backend and injected into the Lyzr prompt as structured JSON
- **Every query is orgId-scoped** — cross-tenant data access is architecturally impossible
- All data modifications happen through the PriceOS backend application layer only

---

## Access Classification

| Collection | Agent Access | System Only |
|---|---|---|
| `listings` | ✅ READ + WRITE (Benchmark Agent) | |
| `inventorymasters` | ✅ READ + WRITE (Pricing Optimizer) | |
| `reservations` | ✅ READ (Booking Intelligence) | |
| `marketevents` | ✅ READ + WRITE (Market Research, onboarding) | |
| `pricingrules` | ✅ READ (PriceGuard, Pricing Optimizer) | |
| `benchmarkdatas` | ✅ READ + WRITE (Benchmark Agent) | |
| `insights` | ✅ READ + WRITE (PriceGuard, Guardrails) | |
| `hostawayconversations` | ✅ READ (Guest Inbox Agents) | |
| `guestsummaries` | ✅ READ + WRITE (Conversation Summary Agent) | |
| `organizations` | | ✅ Auth + config only |
| `users` | | ✅ Auth only |
| `markettemplates` | | ✅ Onboarding seed only |
| `chatmessages` | | ✅ UI persistence only |
| `engineruns` | | ✅ Job logs only |
| `sources` / `detectors` / `sourceruns` | | ✅ Pipeline infra only |

---

# Collection: `listings`

**Description:** The master property registry. One document per physical short-term rental property managed by PriceOS. This is the anchor collection — every other collection references `listingId`. Always read `priceFloor` and `priceCeiling` before proposing any price change.

**Primary Agents:** CRO Router, Property Analyst, PriceGuard, Marketing Agent, Benchmark Agent, Chat Response Agent

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique MongoDB document ID — the primary key | `ObjectId("6642a3f...")` |
| `orgId` | ObjectId | References the owning organization — **required on every query** | `ObjectId("663a1b2...")` |
| `hostawayId` | String | Property ID from Hostaway PMS, namespaced with orgId suffix to prevent collision | `"abc123_listing-1"` |
| `name` | String | Human-readable property name as shown on booking platforms | `"Luxury Marina View Suite"` |
| `city` | String | City of the property | `"Dubai"` |
| `area` | String | Neighborhood sub-market — critical for competitor grouping | `"Dubai Marina"` |
| `bedroomsNumber` | Number | Number of bedrooms | `2` |
| `bathroomsNumber` | Number | Number of bathrooms | `2` |
| `personCapacity` | Number | Maximum occupancy | `4` |
| `propertyTypeId` | Number | Property type category (0=apartment, 1=villa, 2=studio) | `0` |
| `price` | Number | Current default nightly base rate (AED) | `850` |
| `priceFloor` | Number | **Hard minimum** — agent cannot recommend below this under any condition | `500` |
| `priceCeiling` | Number | **Hard maximum** — agent cannot recommend above this under any condition | `2000` |
| `currencyCode` | String | 3-character currency code | `"AED"` |
| `amenities` | String[] | Array of amenity tags | `["pool","wifi","gym","parking"]` |
| `isActive` | Boolean | Whether this property is currently managed by PriceOS | `true` |
| `benchmarkData` | Object | Nested competitor intelligence from Benchmark Agent | `{ p50_rate: 920, verdict: "FAIR" }` |
| `createdAt` | Date | Record creation timestamp | `2026-04-01T10:00:00Z` |
| `updatedAt` | Date | Last modification timestamp | `2026-04-14T08:30:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get all active properties for an org
db.listings.find({
  orgId: ObjectId("663a1b2..."),
  isActive: true
}).project({ name: 1, area: 1, price: 1, priceFloor: 1, priceCeiling: 1 });

// 2. Find a specific property by name (case-insensitive)
db.listings.find({
  orgId: ObjectId("663a1b2..."),
  name: { $regex: /marina/i }
});

// 3. Get floor/ceiling for a specific listing (guardrail check)
db.listings.findOne(
  { _id: ObjectId("6642a3f..."), orgId: ObjectId("663a1b2...") },
  { priceFloor: 1, priceCeiling: 1, price: 1, currencyCode: 1 }
);

// 4. Portfolio summary — all property names + base prices
db.listings.find(
  { orgId: ObjectId("663a1b2..."), isActive: true },
  { name: 1, city: 1, area: 1, price: 1, currencyCode: 1 }
);

// 5. Group properties by area
db.listings.aggregate([
  { $match: { orgId: ObjectId("663a1b2..."), isActive: true } },
  { $group: { _id: "$area", count: { $sum: 1 }, avgPrice: { $avg: "$price" } } },
  { $sort: { count: -1 } }
]);
```

---

# Collection: `inventorymasters`

**Description:** The daily operations and pricing matrix. One document per property per calendar day. Contains both the live state (current price, booking status) and the AI's proposed changes (`proposedPrice`, `proposalStatus`). This is the most frequently read collection at inference time — the entire 30-day calendar window is injected into every agent context block.

**Primary Agents:** Property Analyst (READ+WRITE), PriceGuard (READ+WRITE), CRO Router (READ), Guardrails Agent (READ+WRITE), Marketing Agent (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique daily record ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | References `listings._id` | `ObjectId("6642a3f...")` |
| `date` | String | Calendar date (YYYY-MM-DD) — one row per property per day | `"2026-05-15"` |
| `status` | Enum | Current day state: `"available"`, `"booked"`, `"blocked"` | `"available"` |
| `currentPrice` | Number | Live nightly rate on all channels (AED) | `850` |
| `basePrice` | Number | Property base price at time of seeding (snapshot) | `850` |
| `proposedPrice` | Number | AI's pricing recommendation (null = no proposal exists) | `930` |
| `changePct` | Number | % difference between currentPrice and proposedPrice | `9.4` |
| `proposalStatus` | Enum | State of proposal: `"pending"`, `"approved"`, `"rejected"` | `"pending"` |
| `reasoning` | String | Agent-generated explanation for the proposed price | `"GITEX week — high-demand period, +15% event uplift applied"` |
| `minStay` | Number | Minimum nights required for a booking on this date | `2` |
| `maxStay` | Number | Maximum stay length covering this date | `30` |
| `createdAt` | Date | Row creation time | `2026-04-01T00:00:00Z` |
| `updatedAt` | Date | Last modified time | `2026-04-14T06:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get 30-day calendar window for a property (context builder query)
db.inventorymasters.find({
  listingId: ObjectId("6642a3f..."),
  date: { $gte: "2026-04-14", $lte: "2026-05-14" }
}).sort({ date: 1 });

// 2. Find available (gap) nights in date range
db.inventorymasters.find({
  orgId: ObjectId("663a1b2..."),
  listingId: ObjectId("6642a3f..."),
  status: "available",
  date: { $gte: "2026-04-14", $lte: "2026-05-14" }
}).project({ date: 1, currentPrice: 1 });

// 3. All pending proposals for this org (HITL approval inbox)
db.inventorymasters.find({
  orgId: ObjectId("663a1b2..."),
  proposalStatus: "pending"
}).project({ listingId: 1, date: 1, currentPrice: 1, proposedPrice: 1, changePct: 1, reasoning: 1 });

// 4. Compute occupancy rate for a property over a date range
db.inventorymasters.aggregate([
  { $match: {
    listingId: ObjectId("6642a3f..."),
    date: { $gte: "2026-04-01", $lte: "2026-04-30" }
  }},
  { $group: {
    _id: null,
    totalDays: { $sum: 1 },
    bookedDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
    blockedDays: { $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] } },
    totalRevenue: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, "$currentPrice", 0] } }
  }}
]);

// 5. Write a proposal (Property Analyst writes this)
db.inventorymasters.updateOne(
  { listingId: ObjectId("6642a3f..."), date: "2026-05-01" },
  { $set: {
    proposedPrice: 1050,
    changePct: 23.5,
    proposalStatus: "pending",
    reasoning: "Dubai Airshow week — critical impact event detected"
  }}
);
```

---

# Collection: `reservations`

**Description:** The guest booking and financial ledger. Each document is one confirmed guest reservation synced from the Hostaway PMS. Source of truth for revenue analytics, length-of-stay analysis, channel mix breakdowns, and occupancy confirmation. Read-only for all agents.

**Primary Agents:** Booking Intelligence Agent (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique reservation ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | References `listings._id` | `ObjectId("6642a3f...")` |
| `guestName` | String | Full guest name from PMS | `"Ahmed Al Mansouri"` |
| `checkIn` | String | Arrival date (YYYY-MM-DD) | `"2026-05-02"` |
| `checkOut` | String | Departure date (YYYY-MM-DD) | `"2026-05-07"` |
| `nights` | Number | Length of stay | `5` |
| `guests` | Number | Number of guests in the booking | `2` |
| `totalPrice` | Number | Gross payout for the entire stay (AED) | `4250` |
| `channelName` | String | Booking source: `"Airbnb"`, `"Booking.com"`, `"VRBO"`, `"Direct"` | `"Airbnb"` |
| `status` | Enum | Booking state: `"confirmed"`, `"pending"`, `"cancelled"` | `"confirmed"` |
| `hostawayReservationId` | String | Hostaway PMS internal ID for deduplication | `"HW-98763"` |
| `createdAt` | Date | Record creation timestamp | `2026-04-10T14:22:00Z` |

### MongoDB Query Examples

```javascript
// 1. All active bookings for a property in a date window
db.reservations.find({
  listingId: ObjectId("6642a3f..."),
  status: "confirmed",
  checkIn: { $lte: "2026-05-14" },
  checkOut: { $gte: "2026-04-14" }
});

// 2. Revenue by channel (channel mix analysis)
db.reservations.aggregate([
  { $match: {
    orgId: ObjectId("663a1b2..."),
    status: "confirmed",
    checkIn: { $gte: "2026-01-01" }
  }},
  { $group: {
    _id: "$channelName",
    totalRevenue: { $sum: "$totalPrice" },
    count: { $sum: 1 },
    avgNights: { $avg: "$nights" }
  }},
  { $sort: { totalRevenue: -1 } }
]);

// 3. Total revenue for a property YTD
db.reservations.aggregate([
  { $match: {
    listingId: ObjectId("6642a3f..."),
    status: "confirmed",
    checkIn: { $gte: "2026-01-01" }
  }},
  { $group: {
    _id: null,
    totalRevenue: { $sum: "$totalPrice" },
    totalNights: { $sum: "$nights" },
    bookings: { $sum: 1 }
  }}
]);

// 4. ADR (Average Daily Rate) = totalRevenue / totalNights
db.reservations.aggregate([
  { $match: { orgId: ObjectId("663a1b2..."), status: "confirmed" }},
  { $group: {
    _id: null,
    totalRevenue: { $sum: "$totalPrice" },
    totalNights: { $sum: "$nights" }
  }},
  { $project: {
    adr: { $divide: ["$totalRevenue", "$totalNights"] }
  }}
]);

// 5. Upcoming check-ins in the next 7 days
db.reservations.find({
  orgId: ObjectId("663a1b2..."),
  status: "confirmed",
  checkIn: {
    $gte: new Date().toISOString().split("T")[0],
    $lte: new Date(Date.now() + 7*86400000).toISOString().split("T")[0]
  }
}).sort({ checkIn: 1 });
```

---

# Collection: `marketevents`

**Description:** The AI-generated market intelligence store. Populated at two points: (1) during onboarding Setup when the Lyzr Market Research Agent queries Lyzr Studio for real-world events; (2) during ongoing agent runs. Each document is one market signal — a public holiday, concert, conference, or demand anomaly. Agents read these to apply event-based price uplifts.

**Primary Agents:** Market Research Agent (READ+WRITE), Property Analyst (READ), CRO Router (READ), Marketing Agent (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique event record ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization — events are org-scoped | `ObjectId("663a1b2...")` |
| `name` | String | Event title | `"GITEX Global 2026"` |
| `startDate` | String | Event start (YYYY-MM-DD) | `"2026-10-13"` |
| `endDate` | String | Event end (YYYY-MM-DD) | `"2026-10-17"` |
| `impactLevel` | Enum | Demand impact: `"critical"`, `"high"`, `"moderate"`, `"low"` | `"critical"` |
| `upliftPct` | Number | Suggested % price increase during this event period | `45` |
| `isActive` | Boolean | Whether this event is currently considered in pricing | `true` |
| `description` | String | Agent-generated explanation of demand impact (tagged `[Lyzr Market Research Agent]`) | `"[Lyzr Market Research Agent] Global tech expo..."` |
| `area` | String | Geographic area this event impacts (optional) | `"Dubai World Trade Centre area"` |
| `source` | String | Source attribution — URL or reference | `"gitex.com"` |
| `createdAt` | Date | Record creation timestamp | `2026-04-14T09:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Find events overlapping a date range (context builder query)
db.marketevents.find({
  orgId: ObjectId("663a1b2..."),
  endDate: { $gte: "2026-04-14" },
  startDate: { $lte: "2026-05-14" },
  isActive: true
}).sort({ startDate: 1 });

// 2. High-impact events in the next 90 days
db.marketevents.find({
  orgId: ObjectId("663a1b2..."),
  impactLevel: { $in: ["critical", "high"] },
  startDate: { $lte: new Date(Date.now() + 90*86400000).toISOString().split("T")[0] },
  endDate: { $gte: new Date().toISOString().split("T")[0] }
}).sort({ upliftPct: -1 });

// 3. Upsert a Lyzr-sourced event (Market Research Agent writes)
db.marketevents.updateOne(
  { orgId: ObjectId("663a1b2..."), name: "GITEX Global 2026" },
  { $set: {
    startDate: "2026-10-13",
    endDate: "2026-10-17",
    impactLevel: "critical",
    upliftPct: 45,
    isActive: true,
    description: "[Lyzr Market Research Agent] Annual global tech event..."
  }},
  { upsert: true }
);

// 4. Calendar uplift lookup for a specific date
db.marketevents.findOne({
  orgId: ObjectId("663a1b2..."),
  startDate: { $lte: "2026-10-14" },
  endDate: { $gte: "2026-10-14" },
  isActive: true
}, { name: 1, upliftPct: 1, impactLevel: 1 });
```

---

# Collection: `pricingrules`

**Description:** Market-specific guardrail rules seeded during onboarding. Each rule defines how the Property Analyst Agent should adjust prices based on day-of-week patterns or booking lead time. These are the pricing engine's instruction set — read by both the Property Analyst and PriceGuard at every inference.

**Primary Agents:** Property Analyst (READ), PriceGuard (READ), CRO Router (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique rule ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | Property this rule applies to | `ObjectId("6642a3f...")` |
| `name` | String | Human-readable rule name | `"Weekend Uplift"` |
| `ruleType` | Enum | Logic type: `"DOW"` (day-of-week), `"LEAD_TIME"` (days before check-in), `"SEASONAL"` | `"DOW"` |
| `priority` | Number | Execution order — lower = applied first (1 = highest) | `1` |
| `priceAdjPct` | Number | Percentage adjustment (positive = increase, negative = discount) | `20` |
| `daysOfWeek` | Number[] | For DOW rules: 0=Sun, 1=Mon, 4=Thu, 5=Fri, 6=Sat | `[4, 5]` |
| `leadTimeDays` | Number | For LEAD_TIME rules: apply when booking is within X days | `7` |
| `enabled` | Boolean | Whether this rule is currently active | `true` |
| `createdAt` | Date | Seeded timestamp | `2026-04-14T09:30:00Z` |

### MongoDB Query Examples

```javascript
// 1. All enabled rules for a listing (context builder query)
db.pricingrules.find({
  listingId: ObjectId("6642a3f..."),
  enabled: true
}).sort({ priority: 1 });

// 2. Get DOW rules (weekend/weekday pricing patterns)
db.pricingrules.find({
  orgId: ObjectId("663a1b2..."),
  ruleType: "DOW",
  enabled: true
});

// 3. Get lead-time rules (last-minute discounts / far-out markups)
db.pricingrules.find({
  listingId: ObjectId("6642a3f..."),
  ruleType: "LEAD_TIME",
  enabled: true
}).sort({ leadTimeDays: 1 });

// 4. Upsert a rule (seeded at onboarding)
db.pricingrules.updateOne(
  { orgId: ObjectId("663a1b2..."), listingId: ObjectId("6642a3f..."), name: "Weekend Uplift" },
  { $set: { ruleType: "DOW", priority: 1, priceAdjPct: 20, daysOfWeek: [4, 5], enabled: true }},
  { upsert: true }
);
```

---

# Collection: `benchmarkdatas`

**Description:** Competitor pricing intelligence. One document per listing containing percentile rates (P25/P50/P75/P90), average weekday/weekend rates, positioning verdict, and recommended AI rate targets. The P50 (market median) rate is the **primary anchor** used by all pricing agents. Written by the Benchmark Agent and periodically refreshed.

**Primary Agents:** Benchmark Agent (READ+WRITE), Market Research Agent (READ), Property Analyst (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique benchmark record ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | Property this benchmark is for | `ObjectId("6642a3f...")` |
| `dateFrom` | String | Start date of the benchmark window | `"2026-04-14"` |
| `dateTo` | String | End date of the benchmark window | `"2026-07-14"` |
| `sampleSize` | Number | Number of competitor properties sampled | `24` |
| `p25Rate` | Number | 25th percentile rate (AED) — budget tier indicator | `580` |
| `p50Rate` | Number | **Market median (AED) — PRIMARY pricing anchor for all agents** | `820` |
| `p75Rate` | Number | 75th percentile (AED) — premium tier target | `1150` |
| `p90Rate` | Number | 90th percentile (AED) — luxury/event ceiling | `1650` |
| `avgWeekday` | Number | Average weekday rate across all comps | `790` |
| `avgWeekend` | Number | Average weekend rate across all comps | `980` |
| `yourPrice` | Number | Property's current price at time of benchmark | `850` |
| `percentile` | Number | Where this property's price sits vs comps (0-100) | `55` |
| `verdict` | Enum | `"UNDERPRICED"`, `"FAIR"`, `"SLIGHTLY_ABOVE"`, `"OVERPRICED"` | `"FAIR"` |
| `rateTrend` | Enum | Market direction: `"rising"`, `"stable"`, `"falling"` | `"rising"` |
| `trendPct` | Number | % change vs prior period | `4.5` |
| `recommendedWeekday` | Number | Agent's weekday rate recommendation (AED) | `820` |
| `recommendedWeekend` | Number | Agent's weekend rate recommendation (AED) | `980` |
| `recommendedEvent` | Number | Agent's event-period rate recommendation (AED) | `1280` |
| `reasoning` | String | Agent explanation for recommended rates | `"P50 anchor at AED 820, weekend at P65..."` |
| `comps` | Object[] | Array of individual competitor records (not queryable with predicates) | `[{ name: "Marina Gem", avgRate: 790 }]` |
| `createdAt` | Date | Benchmark creation timestamp | `2026-04-14T10:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get benchmark for a listing
db.benchmarkdatas.findOne({
  listingId: ObjectId("6642a3f..."),
  orgId: ObjectId("663a1b2...")
}, { p50Rate: 1, verdict: 1, recommendedWeekday: 1, recommendedWeekend: 1, recommendedEvent: 1 });

// 2. Check competitor positioning across portfolio
db.benchmarkdatas.find({
  orgId: ObjectId("663a1b2...")
}).project({ listingId: 1, yourPrice: 1, p50Rate: 1, verdict: 1, percentile: 1 });

// 3. Find underpriced properties in the portfolio
db.benchmarkdatas.find({
  orgId: ObjectId("663a1b2..."),
  verdict: "UNDERPRICED"
}).project({ listingId: 1, yourPrice: 1, p50Rate: 1 });

// 4. AED gap (yourPrice - p50Rate) — computed, not stored
db.benchmarkdatas.aggregate([
  { $match: { orgId: ObjectId("663a1b2...") }},
  { $project: {
    listingId: 1,
    yourPrice: 1,
    p50Rate: 1,
    aedGap: { $subtract: ["$yourPrice", "$p50Rate"] },
    verdict: 1
  }}
]);
```

---

# Collection: `insights`

**Description:** AI-generated pricing intelligence cards displayed on the Dashboard Insights panel. Written by PriceGuard and Guardrails Agent after each pipeline run. Each insight is a structured recommendation with category, status, severity, and suggested actions.

**Primary Agents:** PriceGuard (WRITE), Guardrails Agent (WRITE), CRO Router (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique insight ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | Property this insight is about | `ObjectId("6642a3f...")` |
| `category` | Enum | `"pricing"`, `"occupancy"`, `"event"`, `"competitor"`, `"guardrail"` | `"pricing"` |
| `title` | String | Short headline | `"Dubai Airshow: +45% price opportunity"` |
| `body` | String | Full insight explanation | `"Dubai Airshow runs Oct 13–17. Your current price of AED 850 is 35% below market..."` |
| `severity` | Enum | `"critical"`, `"warning"`, `"info"` | `"critical"` |
| `status` | Enum | `"new"`, `"seen"`, `"dismissed"` | `"new"` |
| `actions` | Object[] | Suggested action buttons to display in UI | `[{ label: "Apply +45%", action: "PROPOSE_PRICE_CHANGE" }]` |
| `expiresAt` | Date | When this insight should auto-dismiss | `2026-10-14T00:00:00Z` |
| `createdAt` | Date | When this insight was generated | `2026-04-14T06:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get all active insights for an org dashboard
db.insights.find({
  orgId: ObjectId("663a1b2..."),
  status: { $in: ["new", "seen"] },
  expiresAt: { $gte: new Date() }
}).sort({ severity: 1, createdAt: -1 });

// 2. Critical pricing alerts
db.insights.find({
  orgId: ObjectId("663a1b2..."),
  severity: "critical",
  status: "new"
});

// 3. Mark insight as seen
db.insights.updateOne(
  { _id: ObjectId("...") },
  { $set: { status: "seen" } }
);
```

---

# Collection: `hostawayconversations`

**Description:** Guest message threads synced from the Hostaway PMS. Each document is one conversation thread (one guest stay). The `messages` array contains all individual message objects in chronological order. Read-only for agents — the Guest Inbox Agents (Conversation Summary + Chat Response) receive this data as an inline payload injected into their prompts.

**Primary Agents:** Conversation Summary Agent (READ), Chat Response Agent (READ)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique conversation ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | Property this conversation is about | `ObjectId("6642a3f...")` |
| `hostawayConversationId` | String | Hostaway's internal conversation ID | `"HW-CONV-44521"` |
| `guestName` | String | Guest's full name | `"Sarah Johnson"` |
| `guestEmail` | String | Guest contact email | `"sarah@example.com"` |
| `status` | Enum | `"open"`, `"closed"`, `"needs_reply"` | `"needs_reply"` |
| `messages` | Object[] | Chronological message array: `{ sender, text, timestamp }` | See example below |
| `lastMessageAt` | Date | Timestamp of most recent message | `2026-04-14T16:30:00Z` |
| `createdAt` | Date | When conversation was first created | `2026-04-10T09:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get all open/needs-reply conversations for Guest Inbox
db.hostawayconversations.find({
  orgId: ObjectId("663a1b2..."),
  status: { $in: ["open", "needs_reply"] }
}).sort({ lastMessageAt: -1 });

// 2. Get a specific conversation thread for the reply agent
db.hostawayconversations.findOne({
  _id: ObjectId("..."),
  orgId: ObjectId("663a1b2...")
});

// 3. Count conversations needing reply
db.hostawayconversations.countDocuments({
  orgId: ObjectId("663a1b2..."),
  status: "needs_reply"
});

// 4. All conversations for a specific property
db.hostawayconversations.find({
  listingId: ObjectId("6642a3f..."),
  orgId: ObjectId("663a1b2...")
}).sort({ lastMessageAt: -1 }).limit(20);
```

---

# Collection: `guestsummaries`

**Description:** Structured AI-generated summaries of guest conversation threads produced by the Conversation Summary Agent. Each document stores the sentiment, recurring themes, action items, and per-thread bullet points for a date range of conversations for one property.

**Primary Agents:** Conversation Summary Agent (WRITE)

### Fields

| Field | Type | Description | Example |
|---|---|---|---|
| `_id` | ObjectId | Unique summary ID | `ObjectId("...")` |
| `orgId` | ObjectId | Owning organization | `ObjectId("663a1b2...")` |
| `listingId` | ObjectId | Property this summary covers | `ObjectId("6642a3f...")` |
| `dateFrom` | String | Start of the analyzed date range | `"2026-04-01"` |
| `dateTo` | String | End of the analyzed date range | `"2026-04-14"` |
| `sentiment` | Enum | `"Positive"`, `"Neutral"`, `"Needs Attention"` | `"Neutral"` |
| `themes` | String[] | Top 5 recurring topics | `["Check-in process","Pool heating","Parking"]` |
| `actionItems` | String[] | Recommended actions for property manager | `["Add pool temp to listing","Create parking doc"]` |
| `bulletPoints` | String[] | One-line summary per conversation thread | `["John asked about pool — resolved"]` |
| `totalConversations` | Number | Count of threads analyzed | `8` |
| `needsReplyCount` | Number | Threads still awaiting admin reply | `2` |
| `createdAt` | Date | When this summary was generated | `2026-04-14T18:00:00Z` |

### MongoDB Query Examples

```javascript
// 1. Get latest summary for a property
db.guestsummaries.findOne({
  listingId: ObjectId("6642a3f..."),
  orgId: ObjectId("663a1b2...")
}, { sort: { createdAt: -1 } });

// 2. Find properties with "Needs Attention" sentiment
db.guestsummaries.find({
  orgId: ObjectId("663a1b2..."),
  sentiment: "Needs Attention"
}).sort({ createdAt: -1 });
```

---

## Cross-Collection Example Queries

### Full Pricing Intelligence Picture (Context Builder Pattern)
```javascript
// Step 1: Get property metadata
const listing = await db.listings.findOne({
  _id: ObjectId(listingId),
  orgId: ObjectId(orgId)
});

// Step 2: Get 30-day calendar
const inventory = await db.inventorymasters.find({
  listingId: ObjectId(listingId),
  date: { $gte: startDate, $lte: endDate }
}).sort({ date: 1 }).toArray();

// Step 3: Get active bookings
const reservations = await db.reservations.find({
  listingId: ObjectId(listingId),
  status: "confirmed",
  checkIn: { $lte: endDate },
  checkOut: { $gte: startDate }
}).toArray();

// Step 4: Get active market events
const events = await db.marketevents.find({
  orgId: ObjectId(orgId),
  endDate: { $gte: startDate },
  startDate: { $lte: endDate },
  isActive: true
}).toArray();

// Step 5: Get pricing rules
const rules = await db.pricingrules.find({
  listingId: ObjectId(listingId),
  enabled: true
}).sort({ priority: 1 }).toArray();

// → All 5 results combined into a single JSON object
// → Injected as [SYSTEM CONTEXT] into Lyzr agent prompt
```

### Revenue + Occupancy Dashboard Metrics
```javascript
db.inventorymasters.aggregate([
  { $match: {
    orgId: ObjectId("663a1b2..."),
    date: { $gte: "2026-04-01", $lte: "2026-04-30" }
  }},
  { $group: {
    _id: "$listingId",
    occupancyDays: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, 1, 0] } },
    totalDays: { $sum: 1 },
    revenue: { $sum: { $cond: [{ $eq: ["$status", "booked"] }, "$currentPrice", 0] } }
  }},
  { $project: {
    listingId: "$_id",
    occupancyPct: { $multiply: [{ $divide: ["$occupancyDays", "$totalDays"] }, 100] },
    revenue: 1
  }}
]);
```

### Pending Proposal Review (Proposals Inbox)
```javascript
db.inventorymasters.aggregate([
  { $match: { orgId: ObjectId("663a1b2..."), proposalStatus: "pending" }},
  { $lookup: {
    from: "listings",
    localField: "listingId",
    foreignField: "_id",
    as: "listing"
  }},
  { $unwind: "$listing" },
  { $project: {
    propertyName: "$listing.name",
    date: 1,
    currentPrice: 1,
    proposedPrice: 1,
    changePct: 1,
    reasoning: 1
  }},
  { $sort: { date: 1 } }
]);
```
