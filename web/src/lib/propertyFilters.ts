/**
 * Generic filter types for Properties table.
 * Add new filter keys here to extend filtering.
 */
export type PropertyFilters = {
  zipcode?: string;
  priceMin?: number;
  priceMax?: number;
  lifecycle?: string;
  opportunity?: boolean;
  priceDrop?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
  sortDir?: "asc" | "desc";
};

export const DEFAULT_PAGE_SIZE = 25;
export const SORT_KEYS = [
  "price",
  "beds",
  "baths",
  "sqft",
  "days",
  "listed",
  "added",
  "lifecycle_updated",
] as const;

export const LIFECYCLE_STATUSES = [
  "New",
  "Sent SMS",
  "Waiting for POS",
  "Do follow up",
  "Other",
  "Sold",
] as const;

/** Parse searchParams into PropertyFilters */
export function parseFiltersFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): PropertyFilters {
  const filters: PropertyFilters = {};
  const zip = searchParams.zipcode;
  const zipStr = Array.isArray(zip) ? zip[0] : zip;
  if (typeof zipStr === "string" && zipStr.trim()) {
    filters.zipcode = zipStr.trim();
  }
  const priceMin = searchParams.priceMin;
  const pm = Array.isArray(priceMin) ? priceMin[0] : priceMin;
  if (typeof pm === "string") {
    const n = parseInt(pm.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= 0) filters.priceMin = n;
  }
  const priceMax = searchParams.priceMax;
  const px = Array.isArray(priceMax) ? priceMax[0] : priceMax;
  if (typeof px === "string") {
    const n = parseInt(px.replace(/\D/g, ""), 10);
    if (!isNaN(n) && n >= 0) filters.priceMax = n;
  }
  const lifecycle = searchParams.lifecycle;
  const lcStr = Array.isArray(lifecycle) ? lifecycle[0] : lifecycle;
  if (typeof lcStr === "string" && lcStr.trim()) {
    filters.lifecycle = lcStr.trim();
  }
  const opp = searchParams.opportunity;
  const oppStr = Array.isArray(opp) ? opp[0] : opp;
  if (oppStr === "false" || oppStr === "0") {
    filters.opportunity = false;
  } else {
    filters.opportunity = true;
  }
  const pd = searchParams.priceDrop;
  const pdStr = Array.isArray(pd) ? pd[0] : pd;
  if (pdStr === "true" || pdStr === "1") {
    filters.priceDrop = true;
  }
  const page = searchParams.page;
  const pageNum = Array.isArray(page) ? page[0] : page;
  if (typeof pageNum === "string") {
    const n = parseInt(pageNum, 10);
    if (!isNaN(n) && n >= 1) filters.page = n;
  }
  const pageSize = searchParams.pageSize;
  const ps = Array.isArray(pageSize) ? pageSize[0] : pageSize;
  if (typeof ps === "string") {
    const n = parseInt(ps, 10);
    if (!isNaN(n) && n >= 1 && n <= 100) filters.pageSize = n;
  }
  const sort = searchParams.sort;
  const sortStr = Array.isArray(sort) ? sort[0] : sort;
  if (typeof sortStr === "string" && SORT_KEYS.includes(sortStr as (typeof SORT_KEYS)[number])) {
    filters.sort = sortStr;
  }
  const sortDir = searchParams.sortDir;
  const dir = Array.isArray(sortDir) ? sortDir[0] : sortDir;
  if (dir === "asc" || dir === "desc") filters.sortDir = dir;
  return filters;
}

/** Build URL search string from filters */
export function buildSearchParams(filters: PropertyFilters): string {
  const params = new URLSearchParams();
  if (filters.zipcode) params.set("zipcode", filters.zipcode);
  if (filters.priceMin != null && filters.priceMin > 0)
    params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax != null && filters.priceMax > 0)
    params.set("priceMax", String(filters.priceMax));
  if (filters.lifecycle) params.set("lifecycle", filters.lifecycle);
  if (filters.opportunity === false) params.set("opportunity", "false");
  if (filters.priceDrop) params.set("priceDrop", "true");
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize && filters.pageSize !== DEFAULT_PAGE_SIZE)
    params.set("pageSize", String(filters.pageSize));
  if (filters.sort && filters.sort !== "added") params.set("sort", filters.sort);
  if (filters.sortDir && filters.sortDir !== "desc") params.set("sortDir", filters.sortDir);
  return params.toString();
}

/** Check if any filters are active */
export function hasActiveFilters(filters: PropertyFilters): boolean {
  return Object.keys(filters).some((k) => {
    const v = filters[k as keyof PropertyFilters];
    return v != null && String(v).trim() !== "";
  });
}
