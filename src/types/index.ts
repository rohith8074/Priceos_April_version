export * from "./hostaway";
export * from "./chat";
export * from "./proposal";

/** Plain object shape for a Listing document returned from MongoDB (after .lean()) */
export interface PropertyListing {
  id: string;
  _id: string;
  name: string;
  area?: string;
  city?: string;
  countryCode?: string;
  price: number | string;
  currencyCode: string;
  bedroomsNumber?: number;
  bathroomsNumber?: number;
  personCapacity?: number;
  priceFloor: number;
  priceCeiling: number;
  guardrailsSource?: "manual" | "ai" | "market_template";
  floorReasoning?: string;
  ceilingReasoning?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface PropertyWithMetrics extends PropertyListing {
  occupancy?: number;
  avgPrice?: number | string;
}
