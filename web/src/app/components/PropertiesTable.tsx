"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { getPropertyKey, getListDate } from "@/lib/propertyKey";
import { buildSearchParams } from "@/lib/propertyFilters";
import { useNavigation } from "./NavigationContext";
import type { PropertyFilters } from "@/lib/propertyFilters";
import { useToast } from "./ToastContext";
import LifecycleModal from "./LifecycleModal";
import SmsModal from "./SmsModal";
import PropertyDetailSheet from "./PropertyDetailSheet";
import CompsPanel from "./CompsPanel";
import type { CompSummary, OppSettings } from "@/lib/types";

type CompsByListingId = Record<string, CompSummary>;

type SortKey =
  | "price"
  | "beds"
  | "baths"
  | "sqft"
  | "days"
  | "listed"
  | "added"
  | "lifecycle_updated"
  | null;
type SortDir = "asc" | "desc";

type Listing = {
  id?: string | null;
  zpid?: string | null;
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
  property_key_hash?: string | null;
};

function currency(n: number | null | undefined): string {
  if (n == null) return "-";
  return "$" + Math.abs(n).toLocaleString("en-US");
}

function fmtDelta(oldPrice: number, newPrice: number): string {
  const diff = oldPrice - newPrice;
  const pct = oldPrice > 0 ? ((diff / oldPrice) * 100).toFixed(1) : "0";
  const diffK = diff >= 1000 ? `$${(diff / 1000).toFixed(0)}K` : `$${diff.toLocaleString()}`;
  return `↓${diffK} (${pct}%)`;
}

function listDateDisplay(l: Listing): string {
  const d = getListDate(l);
  if (d === "unknown") return "-";
  const [y, m, day] = d.split("-");
  return `${parseInt(m, 10)}/${parseInt(day, 10)}/${y}`;
}

function addedAtDisplay(l: Listing): string {
  if (!l.created_at) return "-";
  try {
    const d = new Date(l.created_at);
    if (isNaN(d.getTime())) return "-";
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  } catch {
    return "-";
  }
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      className={`sortable-th ${align === "right" ? "text-right" : ""}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="sort-label">
        {label}
        <span className={`sort-arrow ${isActive ? "active" : ""}`}>
          {isActive ? (activeDir === "asc" ? "\u2191" : "\u2193") : "\u2195"}
        </span>
      </span>
    </th>
  );
}

function formatPriceInput(n: number | undefined): string {
  if (n == null || n <= 0) return "";
  return String(n);
}

function PriceFilterHeader({
  priceMin,
  priceMax,
  activeKey,
  activeDir,
  onSort,
  currentFilters,
}: {
  priceMin?: number;
  priceMax?: number;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  currentFilters: PropertyFilters;
}) {
  const { push } = useNavigation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [minVal, setMinVal] = useState(formatPriceInput(priceMin));
  const [maxVal, setMaxVal] = useState(formatPriceInput(priceMax));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMinVal(formatPriceInput(priceMin));
    setMaxVal(formatPriceInput(priceMax));
  }, [priceMin, priceMax]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const hasFilter = (priceMin != null && priceMin > 0) || (priceMax != null && priceMax > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let min = minVal.trim() ? parseInt(minVal.replace(/\D/g, ""), 10) : undefined;
    let max = maxVal.trim() ? parseInt(maxVal.replace(/\D/g, ""), 10) : undefined;
    if (min != null && isNaN(min)) min = undefined;
    if (max != null && isNaN(max)) max = undefined;
    if (min != null && max != null && min > max) [min, max] = [max, min];
    const filters: PropertyFilters = {
      ...currentFilters,
      priceMin: min && min > 0 ? min : undefined,
      priceMax: max && max > 0 ? max : undefined,
      page: 1,
    };
    const qs = buildSearchParams(filters);
    push(qs ? `/properties?${qs}` : "/properties");
    setOpen(false);
  };

  const isActive = activeKey === "price";
  return (
    <th className="sortable-th text-right col-filterable">
      <span className="col-header-with-filter">
        <span
          className="sort-label"
          onClick={() => onSort("price")}
          style={{ cursor: "pointer" }}
        >
          Price
          <span className={`sort-arrow ${isActive ? "active" : ""}`}>
            {isActive ? (activeDir === "asc" ? "\u2191" : "\u2193") : "\u2195"}
          </span>
        </span>
        <button
          type="button"
          className={`filter-icon-btn ${hasFilter ? "active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title="Filter by price range"
          aria-label="Filter by price range"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
      </span>
      {open && (
        <div ref={popoverRef} className="filter-popover filter-popover-price">
          <form onSubmit={handleSubmit}>
            <div className="filter-row">
              <input
                id={`${listId}-min`}
                type="text"
                inputMode="numeric"
                className="form-input filter-autocomplete"
                placeholder="Min"
                value={minVal}
                onChange={(e) => setMinVal(e.target.value.replace(/\D/g, ""))}
              />
              <span className="filter-sep">–</span>
              <input
                id={`${listId}-max`}
                type="text"
                inputMode="numeric"
                className="form-input filter-autocomplete"
                placeholder="Max"
                value={maxVal}
                onChange={(e) => setMaxVal(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="filter-popover-actions">
              <button type="submit" className="btn btn-primary btn-sm">
                Apply
              </button>
              {hasFilter && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const qs = buildSearchParams({ ...currentFilters, priceMin: undefined, priceMax: undefined, page: 1 });
                    push(qs ? `/properties?${qs}` : "/properties");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </th>
  );
}

function sortValue(
  listing: Listing,
  key: SortKey,
  lifecycleByKey?: Record<string, { created_at?: string | null }>
): number {
  switch (key) {
    case "price":
      return listing.price ?? -Infinity;
    case "beds":
      return listing.beds ?? -Infinity;
    case "baths":
      return listing.baths ?? -Infinity;
    case "sqft":
      return listing.sqft ?? -Infinity;
    case "days":
      return listing.days_on_zillow ?? -Infinity;
    case "listed": {
      if (listing.days_on_zillow != null && listing.created_at) {
        const scraped = new Date(listing.created_at).getTime();
        if (!isNaN(scraped))
          return scraped - listing.days_on_zillow * 86400000;
      }
      return -Infinity;
    }
    case "added":
      return listing.created_at
        ? new Date(listing.created_at).getTime()
        : -Infinity;
    case "lifecycle_updated": {
      if (!lifecycleByKey) return -Infinity;
      const ca = lifecycleByKey[listing.property_key_hash ?? ""]?.created_at;
      return ca ? new Date(ca).getTime() : -Infinity;
    }
    default:
      return 0;
  }
}

function ActionsMenu({
  listing,
  onSmsClick,
}: {
  listing: Listing;
  onSmsClick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="actions-menu">
      <button
        type="button"
        className="actions-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Actions"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="6" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="actions-menu-dropdown">
          <button
            type="button"
            className="actions-menu-item"
            onClick={() => {
              onSmsClick();
              setOpen(false);
            }}
          >
            SMS
          </button>
        </div>
      )}
    </div>
  );
}

function ZipFilterHeader({
  zipcodeFilter,
  uniqueZipcodes,
  currentFilters,
}: {
  zipcodeFilter?: string;
  uniqueZipcodes: string[];
  currentFilters: PropertyFilters;
}) {
  const { push } = useNavigation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(zipcodeFilter ?? "");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(zipcodeFilter ?? "");
  }, [zipcodeFilter]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const z = value.trim();
    const filters: PropertyFilters = { ...currentFilters, zipcode: z || undefined, page: 1 };
    const qs = buildSearchParams(filters);
    push(qs ? `/properties?${qs}` : "/properties");
    setOpen(false);
  };

  return (
    <th className="col-filterable">
      <span className="col-header-with-filter">
        <span>ZIP</span>
        <button
          type="button"
          className={`filter-icon-btn ${zipcodeFilter ? "active" : ""}`}
          onClick={() => setOpen((o) => !o)}
          title="Filter by ZIP"
          aria-label="Filter by ZIP"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
      </span>
      {open && (
        <div ref={popoverRef} className="filter-popover">
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              className="form-input filter-autocomplete"
              placeholder="Type ZIP..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              list={listId}
            />
            <datalist id={listId}>
              {uniqueZipcodes.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <div className="filter-popover-actions">
              <button type="submit" className="btn btn-primary btn-sm">
                Apply
              </button>
              {zipcodeFilter && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const qs = buildSearchParams({ ...currentFilters, zipcode: undefined, page: 1 });
                    push(qs ? `/properties?${qs}` : "/properties");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </th>
  );
}

export default function PropertiesTable({
  listings,
  total,
  page,
  pageSize,
  zipcodeFilter,
  priceMin,
  priceMax,
  uniqueZipcodes = [],
  sortKey: sortKeyProp = "added",
  sortDir: sortDirProp = "desc",
  opportunityIds = [],
  priceDropInfo = {},
  oppSettings,
  opportunity,
  priceDrop,
}: {
  listings: Listing[];
  total: number;
  page: number;
  pageSize: number;
  zipcodeFilter?: string;
  priceMin?: number;
  priceMax?: number;
  uniqueZipcodes?: string[];
  sortKey?: SortKey;
  sortDir?: SortDir;
  opportunityIds?: string[];
  priceDropInfo?: Record<string, number>;
  oppSettings: OppSettings;
  opportunity?: boolean;
  priceDrop?: boolean;
}) {
  const { push, isPending } = useNavigation();
  const [lifecycleByKey, setLifecycleByKey] = useState<
    Record<string, { lifecycle: string; created_at?: string | null }>
  >({});
  const [modal, setModal] = useState<{
    propertyKey: string;
    propertyKeyHash: string;
    address: string;
    status: string;
  } | null>(null);
  const [smsModal, setSmsModal] = useState<{
    propertyKey: string;
    propertyKeyHash: string;
    address: string;
    agentName?: string;
    agentPhone?: string;
  } | null>(null);
  const [detailSheet, setDetailSheet] = useState<Listing | null>(null);
  const [compsByListingId, setCompsByListingId] = useState<CompsByListingId>({});
  const [compsPanel, setCompsPanel] = useState<{
    address: string;
    listingPrice: number | null;
    listingSqft: number | null;
    comps: CompSummary["comps"];
    avgPrice: number | null;
  } | null>(null);
  const { showToast } = useToast();

  const propertyHashes = useMemo(
    () => listings.map((l) => l.property_key_hash ?? "").filter(Boolean),
    [listings]
  );

  const fetchLifecycle = useCallback(async () => {
    if (propertyHashes.length === 0) return;
    const res = await fetch("/api/lifecycle/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyKeyHashes: propertyHashes }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, { lifecycle: string; created_at?: string | null }> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === "object" && "lifecycle" in v) {
          const entry = v as { lifecycle: string; created_at?: string | null };
          map[k] = { lifecycle: entry.lifecycle, created_at: entry.created_at };
        }
      }
      setLifecycleByKey(map);
    }
  }, [propertyHashes]);

  const handleLifecycleSaved = useCallback(
    (pk: string, entry: { lifecycle: string; created_at: string }) => {
      setLifecycleByKey((prev) => ({
        ...prev,
        [pk]: { lifecycle: entry.lifecycle, created_at: entry.created_at },
      }));
    },
    []
  );

  useEffect(() => {
    fetchLifecycle();
  }, [fetchLifecycle]);

  const listingIds = useMemo(
    () => listings.map((l) => l.id).filter((id): id is string => !!id),
    [listings]
  );

  const oppIdSet = useMemo(() => new Set(opportunityIds), [opportunityIds]);
  const pdIdSet = useMemo(() => new Set(Object.keys(priceDropInfo)), [priceDropInfo]);

  useEffect(() => {
    if (listingIds.length === 0) return;
    fetch("/api/comps/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingIds }),
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setCompsByListingId(data))
      .catch(() => {});
  }, [listingIds]);


  const handleCompsClick = (listing: Listing) => {
    const summary = listing.id ? compsByListingId[listing.id] : undefined;
    const addr =
      listing.address ??
      [listing.city, listing.state, listing.zipcode].filter(Boolean).join(", ") ??
      "Unknown";
    setCompsPanel({
      address: addr,
      listingPrice: listing.price ?? null,
      listingSqft: listing.sqft ?? null,
      comps: summary?.comps ?? [],
      avgPrice: summary?.avgPrice ?? null,
    });
  };

  const handleSort = (key: SortKey) => {
    const newDir =
      sortKeyProp === key && sortDirProp === "desc" ? "asc" : "desc";
    const filters: PropertyFilters = {
      zipcode: zipcodeFilter,
      priceMin,
      priceMax,
      page: 1,
      pageSize,
      sort: key ?? "added",
      sortDir: newDir,
    };
    const qs = buildSearchParams(filters);
    push(qs ? `/properties?${qs}` : "/properties");
  };

  const currentFilters: PropertyFilters = useMemo(
    () => ({
      zipcode: zipcodeFilter,
      priceMin,
      priceMax,
      page,
      pageSize,
      sort: sortKeyProp ?? "added",
      sortDir: sortDirProp,
      opportunity,
      priceDrop,
    }),
    [zipcodeFilter, priceMin, priceMax, page, pageSize, sortKeyProp, sortDirProp, opportunity, priceDrop]
  );

  const sorted = listings;

  const handleLifecycleClick = (listing: Listing, selectedStatus: string) => {
    const pk = getPropertyKey(listing);
    const addr =
      listing.address ??
      [listing.city, listing.state, listing.zipcode].filter(Boolean).join(", ") ??
      "Unknown";
    setModal({ propertyKey: pk, propertyKeyHash: listing.property_key_hash ?? "", address: addr, status: selectedStatus });
  };

  const handleSmsClick = (listing: Listing) => {
    const pk = getPropertyKey(listing);
    const addr =
      listing.address ??
      [listing.city, listing.state, listing.zipcode].filter(Boolean).join(", ") ??
      "Unknown";
    setSmsModal({
      propertyKey: pk,
      propertyKeyHash: listing.property_key_hash ?? "",
      address: addr,
      agentName: listing.agent_name ?? undefined,
      agentPhone: listing.agent_phone ?? undefined,
    });
  };

  const activeFilterCount = [
    zipcodeFilter,
    priceMin && priceMin > 0 ? priceMin : null,
    priceMax && priceMax > 0 ? priceMax : null,
  ].filter(Boolean).length;

  return (
    <>
      {listings.length === 0 ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-state-icon">&#x1F50D;</div>
            <div className="empty-state-title">No properties found</div>
            <div className="empty-state-desc">
              {activeFilterCount > 0
                ? "No properties match the current filters."
                : "No properties yet. Start a scrape on the Comps page."}
            </div>
          </div>
        </div>
      ) : (
      <>
      <div className="table-loading-container">
      {isPending && (
        <div className="table-loading-overlay">
          <div className="table-loading-spinner" />
        </div>
      )}
      <div className="table-wrap table-wrap-compact">
        <table>
          <thead>
            <tr>
              <th>Address</th>
              <ZipFilterHeader
                zipcodeFilter={zipcodeFilter}
                uniqueZipcodes={uniqueZipcodes}
                currentFilters={currentFilters}
              />
              <PriceFilterHeader
                priceMin={priceMin}
                priceMax={priceMax}
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
                currentFilters={currentFilters}
              />
              <SortableHeader
                label="Beds"
                sortKey="beds"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Baths"
                sortKey="baths"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Sqft"
                sortKey="sqft"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
                align="right"
              />
              <th>Style</th>
              <SortableHeader
                label="Listed"
                sortKey="listed"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
              />
              <SortableHeader
                label="Days"
                sortKey="days"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                label="Added at"
                sortKey="added"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
              />
              <th>Lifecycle</th>
              <SortableHeader
                label="Updated"
                sortKey="lifecycle_updated"
                activeKey={sortKeyProp}
                activeDir={sortDirProp}
                onSort={handleSort}
              />
              <th className="col-comps">Comps</th>
              <th>Link</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const pk = getPropertyKey(l);
              const hash = l.property_key_hash ?? "";
              const current = lifecycleByKey[hash]?.lifecycle ?? "New";
              const isOpp = !!(l.id && oppIdSet.has(l.id));
              const isPD = !!(l.id && pdIdSet.has(l.id));
              const rowClass = isPD ? "price-drop-row" : isOpp ? "opportunity-row" : "";
              return (
                <tr key={pk} className={rowClass}>
                  <td className="col-address">
                    {/* Address — tappable on mobile to open detail sheet */}
                    <button
                      type="button"
                      className="prop-addr-link"
                      onClick={() => setDetailSheet(l)}
                    >
                      {l.address ?? l.city ?? "Unknown"}
                    </button>

                    {/* Mobile: key stats sub-row */}
                    <div className="prop-mobile-sub">
                      <span>{l.beds ?? "-"}bd</span>
                      <span className="prop-sub-sep">·</span>
                      <span>{l.baths ?? "-"}ba</span>
                      <span className="prop-sub-sep">·</span>
                      <span>{l.sqft && l.sqft > 0 ? l.sqft.toLocaleString("en-US") + "sf" : "-"}</span>
                      <span className="prop-sub-sep">·</span>
                      <span>
                        {l.price != null ? "$" + Math.abs(l.price).toLocaleString("en-US") : "-"}
                        {isPD && l.id && priceDropInfo[l.id] > 0 && (
                          <>
                            <span className="price-drop-badge">{fmtDelta(priceDropInfo[l.id], l.price ?? 0)}</span>
                            <span className="price-drop-old" style={{ marginLeft: 4 }}>{currency(priceDropInfo[l.id])}</span>
                          </>
                        )}
                        {isPD && (!l.id || !priceDropInfo[l.id!]) && (
                          <span className="price-drop-badge">Drop</span>
                        )}
                      </span>
                      {l.architectural_style && (
                        <>
                          <span className="prop-sub-sep">·</span>
                          <span>{l.architectural_style}</span>
                        </>
                      )}
                      <span className="prop-sub-sep">·</span>
                      <span>{listDateDisplay(l)}</span>
                      {l.id && compsByListingId[l.id] && compsByListingId[l.id].count > 0 && (
                        <>
                          <span className="prop-sub-sep">·</span>
                          <button
                            type="button"
                            className="comps-inline-btn"
                            onClick={(e) => { e.stopPropagation(); handleCompsClick(l); }}
                          >
                            {compsByListingId[l.id].count} comps
                          </button>
                          {isOpp && <span className="opp-badge">Opp</span>}
                        </>
                      )}
                    </div>

                    {/* Mobile: inline action shortcuts */}
                    <div className="prop-mobile-actions">
                      <button
                        type="button"
                        className="lifecycle-btn"
                        style={{ fontSize: 11, padding: "4px 8px", minWidth: 0 }}
                        onClick={() => handleLifecycleClick(l, current)}
                      >
                        {current}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSmsClick(l)}
                      >
                        SMS
                      </button>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Link
                      </a>
                    </div>
                  </td>
                  <td className="text-mono col-zip">{l.zipcode ?? ""}</td>
                  <td className="text-right text-nowrap">
                    {currency(l.price)}
                    {isPD && l.id && priceDropInfo[l.id] > 0 && (
                      <>
                        <span className="price-drop-badge">{fmtDelta(priceDropInfo[l.id], l.price ?? 0)}</span>
                        <div className="price-drop-old">{currency(priceDropInfo[l.id])}</div>
                      </>
                    )}
                    {isPD && (!l.id || !priceDropInfo[l.id!]) && (
                      <span className="price-drop-badge">Price Drop</span>
                    )}
                  </td>
                  <td className="text-right">{l.beds ?? "-"}</td>
                  <td className="text-right">{l.baths ?? "-"}</td>
                  <td className="text-right">
                    {l.sqft && l.sqft > 0 ? l.sqft.toLocaleString("en-US") : "-"}
                  </td>
                  <td className="col-style">{l.architectural_style ?? "-"}</td>
                  <td className="text-nowrap col-date">{listDateDisplay(l)}</td>
                  <td className="text-right">{l.days_on_zillow ?? "-"}</td>
                  <td className="text-nowrap col-date">{addedAtDisplay(l)}</td>
                  <td>
                    <button
                      type="button"
                      className="lifecycle-btn"
                      onClick={() => handleLifecycleClick(l, current)}
                    >
                      {current}
                    </button>
                  </td>
                  <td className="text-nowrap col-date">
                    {lifecycleByKey[hash]?.created_at
                      ? (() => {
                          try {
                            const d = new Date(lifecycleByKey[hash].created_at!);
                            return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
                          } catch {
                            return "-";
                          }
                        })()
                      : "-"}
                  </td>
                  <td className="col-comps">
                    {l.id && compsByListingId[l.id] && compsByListingId[l.id].count > 0 ? (
                      <span className="comps-cell-wrap">
                        <button
                          type="button"
                          className="comps-cell-btn"
                          onClick={() => handleCompsClick(l)}
                        >
                          {compsByListingId[l.id].count} · {currency(compsByListingId[l.id].avgPrice)}
                        </button>
                        {isOpp && <span className="opp-badge">Opp</span>}
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="col-link">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="link"
                    >
                      View
                    </a>
                  </td>
                  <td className="col-actions">
                    <ActionsMenu
                      listing={l}
                      onSmsClick={() => handleSmsClick(l)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>

      {total > 0 && (
        <div className="pagination-bar">
          <span className="pagination-info">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="pagination-controls">
            {page > 1 ? (
              <button
                type="button"
                className="pagination-btn"
                onClick={() => {
                  const qs = buildSearchParams({ ...currentFilters, page: page - 1 });
                  push(qs ? `/properties?${qs}` : "/properties");
                }}
              >
                Previous
              </button>
            ) : (
              <span className="pagination-btn disabled">Previous</span>
            )}
            <span className="pagination-page">
              Page {page} of {Math.ceil(total / pageSize) || 1}
            </span>
            {page < Math.ceil(total / pageSize) ? (
              <button
                type="button"
                className="pagination-btn"
                onClick={() => {
                  const qs = buildSearchParams({ ...currentFilters, page: page + 1 });
                  push(qs ? `/properties?${qs}` : "/properties");
                }}
              >
                Next
              </button>
            ) : (
              <span className="pagination-btn disabled">Next</span>
            )}
          </div>
        </div>
      )}
      </>
      )}

      {modal && (
        <LifecycleModal
          isOpen={!!modal}
          onClose={() => setModal(null)}
          propertyKey={modal.propertyKey}
          propertyKeyHash={modal.propertyKeyHash}
          address={modal.address}
          initialStatus={modal.status}
          onSaved={handleLifecycleSaved}
        />
      )}

      {smsModal && (
        <SmsModal
          isOpen={!!smsModal}
          onClose={() => setSmsModal(null)}
          propertyKey={smsModal.propertyKey}
          propertyKeyHash={smsModal.propertyKeyHash}
          address={smsModal.address}
          initialAgentName={smsModal.agentName}
          initialAgentPhone={smsModal.agentPhone}
          onSent={handleLifecycleSaved}
          onShowToast={showToast}
        />
      )}

      {detailSheet && (
        <PropertyDetailSheet
          listing={detailSheet}
          lifecycleStatus={lifecycleByKey[detailSheet.property_key_hash ?? ""]?.lifecycle ?? "New"}
          onClose={() => setDetailSheet(null)}
          onLifecycleClick={() => {
            const l = detailSheet;
            const current = lifecycleByKey[l.property_key_hash ?? ""]?.lifecycle ?? "New";
            handleLifecycleClick(l, current);
            setDetailSheet(null);
          }}
          onSmsClick={() => {
            handleSmsClick(detailSheet);
            setDetailSheet(null);
          }}
        />
      )}

      {compsPanel && (
        <CompsPanel
          isOpen={!!compsPanel}
          onClose={() => setCompsPanel(null)}
          address={compsPanel.address}
          listingPrice={compsPanel.listingPrice}
          listingSqft={compsPanel.listingSqft}
          comps={compsPanel.comps}
          avgPrice={compsPanel.avgPrice}
          oppSettings={oppSettings}
        />
      )}
    </>
  );
}
