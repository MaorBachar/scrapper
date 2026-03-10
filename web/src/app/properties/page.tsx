import { supabaseAdmin, fetchAllRows } from "@/lib/supabase";
import { getSessionUser } from "@/lib/auth";
import { getPropertyKey, getListDate } from "@/lib/propertyKey";
import {
  type PropertyFilters,
  parseFiltersFromSearchParams,
  DEFAULT_PAGE_SIZE,
} from "@/lib/propertyFilters";
import PropertiesTable from "../components/PropertiesTable";
import MobileFilterBar from "../components/MobileFilterBar";
import PipelineBar from "../components/PipelineBar";
import ScrapeForm from "../components/ScrapeForm";
import type { LifecycleStats, OppSettings } from "@/lib/types";

type Listing = {
  id?: string | null;
  zpid?: string | null;
  property_key_hash?: string | null;
  url: string;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  state?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  home_type?: string | null;
  architectural_style?: string | null;
  days_on_zillow?: number | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  created_at?: string | null;
};

function mapRow(l: Record<string, unknown>): Listing {
  return {
    id: l.id as string | null,
    zpid: l.zpid as string | null,
    property_key_hash: l.property_key_hash as string | null,
    url: l.url as string,
    address: l.address as string | null,
    zipcode: l.zipcode as string | null,
    city: l.city as string | null,
    state: l.state as string | null,
    price: l.price as number | null,
    beds: l.beds as number | null,
    baths: l.baths as number | null,
    sqft: l.sqft as number | null,
    home_type: l.home_type as string | null,
    architectural_style: l.architectural_style as string | null,
    days_on_zillow: l.days_on_zillow as number | null,
    agent_name: l.agent_name as string | null,
    agent_phone: l.agent_phone as string | null,
    created_at: l.created_at as string | null,
  };
}

function getListedDateTimestamp(l: Listing): number {
  const d = getListDate(l);
  if (d === "unknown") return -Infinity;
  return new Date(d).getTime();
}

async function getUniqueZipcodes(llcId: string | null): Promise<string[]> {
  try {
    if (!supabaseAdmin) return [];
    let query = supabaseAdmin.from("listings").select("zipcode")
      .eq("listing_status", "FOR_SALE");
    if (llcId) query = query.eq("llc_id", llcId);
    const { data, error } = await query;
    if (error || !data) return [];
    const zips = new Set<string>();
    for (const row of data) {
      const z = row.zipcode;
      if (typeof z === "string" && z.trim()) zips.add(z.trim());
    }
    return Array.from(zips).sort();
  } catch {
    return [];
  }
}

async function getLifecycleStats(llcId: string | null): Promise<LifecycleStats> {
  const empty: LifecycleStats = { total: 0, byCycle: {}, overdueFollowUps: 0, priceDropCount: 0 };
  try {
    if (!supabaseAdmin) return empty;

    const listingsData = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("listings").select("property_key_hash")
        .eq("listing_status", "FOR_SALE");
      if (llcId) q = q.eq("llc_id", llcId);
      return q.range(from, to);
    });

    // Deduplicate by property_key_hash to get true total
    const hashSet = new Set<string>();
    for (const row of listingsData) {
      if (row.property_key_hash) hashSet.add(row.property_key_hash as string);
    }
    const total = hashSet.size;

    const lcData = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("lifecycle").select("property_key_hash, lifecycle, follow_up_date, created_at")
        .order("created_at", { ascending: false });
      if (llcId) q = q.or(`llc_id.eq.${llcId},llc_id.is.null`);
      return q.range(from, to);
    });

    const latestByHash = new Map<string, { lifecycle: string; follow_up_date: string | null }>();
    for (const row of lcData ?? []) {
      const hash = row.property_key_hash as string;
      if (hash && !latestByHash.has(hash)) {
        latestByHash.set(hash, {
          lifecycle: row.lifecycle,
          follow_up_date: row.follow_up_date ?? null,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const byCycle: Record<string, number> = {};
    let overdueFollowUps = 0;
    let withLifecycle = 0;
    for (const hash of hashSet) {
      const entry = latestByHash.get(hash);
      if (!entry) continue;
      byCycle[entry.lifecycle] = (byCycle[entry.lifecycle] ?? 0) + 1;
      withLifecycle++;
      if (entry.lifecycle === "Do follow up" && entry.follow_up_date && entry.follow_up_date < today) {
        overdueFollowUps++;
      }
    }
    const newCount = total - withLifecycle;
    if (newCount > 0) {
      byCycle["New"] = (byCycle["New"] ?? 0) + newCount;
    }

    // Count recent price drops (last 14 days) — auto entries are property-level (no llc_id)
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const pdData = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("lifecycle")
        .select("property_key_hash")
        .eq("lifecycle", "Price Drop")
        .eq("source", "auto")
        .gte("created_at", twoWeeksAgo);
      return q.range(from, to);
    });
    const pdHashes = new Set<string>();
    for (const row of pdData) {
      if (row.property_key_hash) pdHashes.add(row.property_key_hash);
    }
    const priceDropCount = pdHashes.size;

    return { total, byCycle, overdueFollowUps, priceDropCount };
  } catch {
    return empty;
  }
}

function getSortValue(l: Listing, sortKey: string): number {
  switch (sortKey) {
    case "price": return l.price ?? -Infinity;
    case "beds": return l.beds ?? -Infinity;
    case "baths": return l.baths ?? -Infinity;
    case "sqft": return l.sqft ?? -Infinity;
    case "days": return l.days_on_zillow ?? -Infinity;
    case "listed": {
      if (l.days_on_zillow != null && l.created_at) {
        const scraped = new Date(l.created_at).getTime();
        if (!isNaN(scraped)) return scraped - l.days_on_zillow * 86400000;
      }
      return -Infinity;
    }
    case "added": return l.created_at ? new Date(l.created_at).getTime() : -Infinity;
    default: return 0;
  }
}

const OPP_DEFAULTS: OppSettings = { pctBelow: 30, minComps: 2, sqftRange: 20, maxDistance: 0.5, maxCompMonths: 3 };

async function getOppSettings(llcId: string | null): Promise<OppSettings> {
  if (!llcId || !supabaseAdmin) return OPP_DEFAULTS;
  const { data } = await supabaseAdmin
    .from("llc_opportunity_settings")
    .select("pct_below, min_comps, sqft_range, max_distance_miles, max_comp_months")
    .eq("llc_id", llcId)
    .single();
  if (!data) return OPP_DEFAULTS;
  return {
    pctBelow: data.pct_below ?? OPP_DEFAULTS.pctBelow,
    minComps: data.min_comps ?? OPP_DEFAULTS.minComps,
    sqftRange: data.sqft_range ?? OPP_DEFAULTS.sqftRange,
    maxDistance: data.max_distance_miles ?? OPP_DEFAULTS.maxDistance,
    maxCompMonths: data.max_comp_months ?? OPP_DEFAULTS.maxCompMonths,
  };
}

type CompEntry = { sold_price: number | null; sqft: number | null; distance_miles: number | null; sold_date: string | null };

function computeOpportunityIds(
  listings: Listing[],
  compsMap: Map<string, CompEntry[]>,
  settings: OppSettings
): Set<string> {
  const oppIds = new Set<string>();
  const priceThreshold = 1 - settings.pctBelow / 100;
  const sqftLo = 1 - settings.sqftRange / 100;
  const sqftHi = 1 + settings.sqftRange / 100;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - settings.maxCompMonths);
  const cutoffMs = cutoff.getTime();

  for (const l of listings) {
    if (!l.id || l.price == null || l.price <= 0) continue;
    const listingSqft = l.sqft != null && l.sqft > 0 ? l.sqft : null;
    if (!listingSqft) continue;

    const comps = compsMap.get(l.id);
    if (!comps) continue;

    let qualifying = 0;
    for (const c of comps) {
      if (c.sold_price == null) continue;
      if (c.sqft == null || c.sqft <= 0) continue;
      if (c.distance_miles == null || c.distance_miles > settings.maxDistance) continue;
      if (!c.sold_date || new Date(c.sold_date).getTime() < cutoffMs) continue;
      const sqftOk = c.sqft >= listingSqft * sqftLo && c.sqft <= listingSqft * sqftHi;
      const priceOk = l.price <= c.sold_price * priceThreshold;
      if (sqftOk && priceOk) qualifying++;
    }
    if (qualifying >= settings.minComps) oppIds.add(l.id);
  }
  return oppIds;
}

async function getPaginatedListings(
  filters: PropertyFilters = {},
  llcId: string | null = null
): Promise<{ items: Listing[]; total: number; page: number; pageSize: number; opportunityIds: string[]; priceDropInfo: Record<string, number>; oppSettings: OppSettings }> {
  const empty = { items: [] as Listing[], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, opportunityIds: [] as string[], priceDropInfo: {} as Record<string, number>, oppSettings: OPP_DEFAULTS };
  try {
    if (!supabaseAdmin) return empty;

    const data = await fetchAllRows((from, to) => {
      let q = supabaseAdmin!.from("listings").select("*")
        .eq("listing_status", "FOR_SALE");
      if (llcId) q = q.eq("llc_id", llcId);
      if (filters.zipcode) q = q.eq("zipcode", filters.zipcode);
      if (filters.priceMin != null && filters.priceMin > 0) q = q.gte("price", filters.priceMin);
      if (filters.priceMax != null && filters.priceMax > 0) q = q.lte("price", filters.priceMax);
      return q.range(from, to);
    });
    if (!data.length) return empty;

    // Deduplicate
    const byKey = new Map<string, Listing>();
    for (const row of data) {
      const l = mapRow(row);
      const key = getPropertyKey(l);
      const listedTs = getListedDateTimestamp(l);
      const existing = byKey.get(key);
      const existingTs = existing ? getListedDateTimestamp(existing) : -Infinity;
      if (!existing || listedTs > existingTs) {
        byKey.set(key, l);
      } else if (listedTs === existingTs && existingTs !== -Infinity) {
        const created = l.created_at ? new Date(l.created_at).getTime() : 0;
        const existingCreated = existing.created_at ? new Date(existing.created_at).getTime() : 0;
        if (created > existingCreated) byKey.set(key, l);
      }
    }
    let deduped = Array.from(byKey.values());

    // Lifecycle filter
    if (filters.lifecycle) {
      const lcData = await fetchAllRows((from, to) => {
        let q = supabaseAdmin!.from("lifecycle").select("property_key_hash, lifecycle, created_at")
          .order("created_at", { ascending: false });
        if (llcId) q = q.or(`llc_id.eq.${llcId},llc_id.is.null`);
        return q.range(from, to);
      });

      const latestStatus = new Map<string, string>();
      for (const row of lcData ?? []) {
        const hash = row.property_key_hash as string;
        if (hash && !latestStatus.has(hash)) {
          latestStatus.set(hash, row.lifecycle);
        }
      }

      deduped = deduped.filter((l) => {
        const status = latestStatus.get(l.property_key_hash ?? "") ?? "New";
        return status === filters.lifecycle;
      });
    }

    // Opportunity detection -- fetch comps for all listings
    const oppSettings = await getOppSettings(llcId);
    const listingIds = deduped.map((l) => l.id).filter((id): id is string => !!id);
    const compsMap = new Map<string, CompEntry[]>();

    if (listingIds.length > 0) {
      const CHUNK = 100;
      for (let i = 0; i < listingIds.length; i += CHUNK) {
        const chunk = listingIds.slice(i, i + CHUNK);
        const compsData = await fetchAllRows((from, to) =>
          supabaseAdmin!.from("sold_comps")
            .select("listing_id, sold_price, sqft, distance_miles, sold_date")
            .in("listing_id", chunk)
            .range(from, to)
        );
        for (const row of compsData) {
          const lid = row.listing_id as string;
          if (!compsMap.has(lid)) compsMap.set(lid, []);
          compsMap.get(lid)!.push({
            sold_price: row.sold_price as number | null,
            sqft: row.sqft as number | null,
            distance_miles: row.distance_miles as number | null,
            sold_date: row.sold_date as string | null,
          });
        }
      }
    }

    const oppIdSet = computeOpportunityIds(deduped, compsMap, oppSettings);
    const opportunityIds = Array.from(oppIdSet);

    // Price drop detection: find listings with recent Price Drop lifecycle entries
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const priceDropByHash = new Map<string, number>(); // property_key_hash -> old price
    if (supabaseAdmin) {
      const pdLC = await fetchAllRows((from, to) => {
        let q = supabaseAdmin!.from("lifecycle")
          .select("property_key_hash, description")
          .eq("lifecycle", "Price Drop")
          .eq("source", "auto")
          .gte("created_at", twoWeeksAgo);
        return q.range(from, to);
      });
      for (const row of pdLC) {
        const pkh = row.property_key_hash as string;
        if (!pkh || priceDropByHash.has(pkh)) continue;
        // Parse old price from description: "Auto: $275,000 -> $250,000 (-9.1%)"
        const desc = (row.description as string) || "";
        const match = desc.match(/\$([0-9,]+)\s*->/);
        const oldPrice = match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
        priceDropByHash.set(pkh, oldPrice);
      }
    }

    // Map property_key_hash back to listing IDs with old price
    const priceDropIdSet = new Set<string>();
    const priceDropInfo: Record<string, number> = {}; // listingId -> oldPrice
    if (priceDropByHash.size > 0) {
      const hashToId = await fetchAllRows((from, to) => {
        let q = supabaseAdmin!.from("listings")
          .select("id, property_key_hash")
          .in("property_key_hash", Array.from(priceDropByHash.keys()));
        if (llcId) q = q.eq("llc_id", llcId);
        return q.range(from, to);
      });
      for (const row of hashToId) {
        const id = row.id as string;
        const pkh = row.property_key_hash as string;
        if (id && pkh && priceDropByHash.has(pkh)) {
          priceDropIdSet.add(id);
          priceDropInfo[id] = priceDropByHash.get(pkh)!;
        }
      }
    }

    // Apply filters
    if (filters.priceDrop) {
      deduped = deduped.filter((l) => l.id != null && priceDropIdSet.has(l.id));
    } else if (filters.opportunity !== false) {
      deduped = deduped.filter((l) => l.id != null && oppIdSet.has(l.id));
    }

    const total = deduped.length;
    const sortKey = filters.sort ?? "added";
    const sortDir = filters.sortDir ?? "desc";
    deduped.sort((a, b) => {
      // Price drops (last 14 days) always on top
      const aPD = a.id && priceDropIdSet.has(a.id) ? 1 : 0;
      const bPD = b.id && priceDropIdSet.has(b.id) ? 1 : 0;
      if (aPD !== bPD) return bPD - aPD;
      // Then opportunities
      const aOpp = a.id && oppIdSet.has(a.id) ? 1 : 0;
      const bOpp = b.id && oppIdSet.has(b.id) ? 1 : 0;
      if (aOpp !== bOpp) return bOpp - aOpp;
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return sortDir === "asc" ? va - vb : vb - va;
    });

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const items = deduped.slice(start, start + pageSize);

    return { items, total, page, pageSize, opportunityIds, priceDropInfo, oppSettings };
  } catch {
    return empty;
  }
}

export const dynamic = "force-dynamic";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFiltersFromSearchParams(params);
  const sessionUser = await getSessionUser();
  const llcId = sessionUser?.llcId ?? null;

  const [result, uniqueZipcodes, stats] = await Promise.all([
    getPaginatedListings(filters, llcId),
    getUniqueZipcodes(llcId),
    getLifecycleStats(llcId),
  ]);

  return (
    <>
      <MobileFilterBar
        currentFilters={filters}
        uniqueZipcodes={uniqueZipcodes}
      />
      <main className="page-shell">
        <div className="page-header">
          <h1>Properties</h1>
          <p>For-sale listings with lifecycle tracking. Unique by address and listed date.</p>
        </div>

        <ScrapeForm />

        <div className="pipeline-bar-desktop">
          <PipelineBar
            stats={stats}
            currentLifecycle={filters.lifecycle}
            currentFilters={filters}
          />
        </div>

        <PropertiesTable
          listings={result.items}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          zipcodeFilter={filters.zipcode}
          priceMin={filters.priceMin}
          priceMax={filters.priceMax}
          uniqueZipcodes={uniqueZipcodes}
          sortKey={(filters.sort ?? "added") as "price" | "beds" | "baths" | "sqft" | "days" | "listed" | "added" | "lifecycle_updated" | null}
          sortDir={(filters.sortDir ?? "desc") as "asc" | "desc"}
          opportunityIds={result.opportunityIds}
          priceDropInfo={result.priceDropInfo}
          oppSettings={result.oppSettings}
          opportunity={filters.opportunity}
          priceDrop={filters.priceDrop}
        />
      </main>
    </>
  );
}
