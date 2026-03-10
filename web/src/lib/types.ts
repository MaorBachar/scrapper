export type CompRow = {
  address: string | null;
  url: string | null;
  sold_price: number | null;
  sold_date: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  distance_miles: number | null;
};

export type CompSummary = {
  count: number;
  avgPrice: number | null;
  isOpportunity: boolean;
  qualifyingComps: number;
  comps: CompRow[];
};

export type OppSettings = {
  pctBelow: number;
  minComps: number;
  sqftRange: number;
  maxDistance: number;
  maxCompMonths: number;
};

export type LifecycleStats = {
  total: number;
  byCycle: Record<string, number>;
  overdueFollowUps: number;
  priceDropCount: number;
};
