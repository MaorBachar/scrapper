"use client";

import React, { useMemo, useState } from "react";

type SortKey = "price" | "beds" | "baths" | "sqft" | "comps" | "days" | "listed" | null;
type SortDir = "asc" | "desc";

type Comp = {
  url: string;
  sold_price?: number | null;
  sold_date?: string | null;
  distance_miles?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  address?: string | null;
  home_type?: string | null;
  architectural_style?: string | null;
};

type MatchedResult = {
  listing: {
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
    created_at?: string | null;
  };
  comps: Comp[];
  comp_search_window: "3mo" | "6mo";
};

function currency(n: number | null | undefined): string {
  if (n == null) return "-";
  return "$" + Math.abs(n).toLocaleString("en-US");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}/${dt.getUTCFullYear()}`;
  } catch {
    return "-";
  }
}

function listDate(l: MatchedResult["listing"]): string {
  if (l.days_on_zillow != null && l.created_at) {
    try {
      const scraped = new Date(l.created_at);
      if (!isNaN(scraped.getTime())) {
        const listed = new Date(scraped.getTime() - l.days_on_zillow * 86400000);
        return `${listed.getUTCMonth() + 1}/${listed.getUTCDate()}/${listed.getUTCFullYear()}`;
      }
    } catch { /* fall through */ }
  }
  return "-";
}

function CompCard({ comp }: { comp: Comp }) {
  return (
    <div className="comp-card">
      <div className="comp-card-header">
        <div className="comp-card-address">{comp.address ?? "Unknown"}</div>
        <div className="comp-card-price">{currency(comp.sold_price)}</div>
      </div>
      <dl className="comp-card-details">
        <dt>Sold</dt>
        <dd>{fmtDate(comp.sold_date)}</dd>
        <dt>Beds / Baths</dt>
        <dd>
          {comp.beds ?? "-"} / {comp.baths ?? "-"}
        </dd>
        <dt>Sqft</dt>
        <dd>
          {comp.sqft && comp.sqft > 0 ? comp.sqft.toLocaleString("en-US") : "-"}
        </dd>
        <dt>Style</dt>
        <dd>{comp.architectural_style ?? "-"}</dd>
      </dl>
      <div className="comp-card-footer">
        <span className="comp-distance">
          {comp.distance_miles
            ? `${comp.distance_miles.toFixed(2)} mi away`
            : ""}
        </span>
        <a href={comp.url} target="_blank" rel="noreferrer" className="link">
          View listing
        </a>
      </div>
    </div>
  );
}

function ListingRow({ row }: { row: MatchedResult }) {
  const [open, setOpen] = useState(false);
  const l = row.listing;

  return (
    <>
      <tr className="listing-row" onClick={() => setOpen(!open)}>
        <td>
          <span className={`expand-icon ${open ? "open" : ""}`}>&#x25B6;</span>
          {l.address ?? l.city ?? "Unknown"}
        </td>
        <td className="text-mono">{l.zipcode ?? ""}</td>
        <td className="text-right text-nowrap">{currency(l.price)}</td>
        <td className="text-right">{l.beds ?? "-"}</td>
        <td className="text-right">{l.baths ?? "-"}</td>
        <td className="text-right">
          {l.sqft && l.sqft > 0 ? l.sqft.toLocaleString("en-US") : "-"}
        </td>
        <td>{l.architectural_style ?? "-"}</td>
        <td className="text-nowrap">{listDate(l)}</td>
        <td className="text-right">{l.days_on_zillow ?? "-"}</td>
        <td className="text-right">
          <span className="comps-count-badge">{row.comps.length}</span>
        </td>
        <td>
          <span
            className={`badge badge-${row.comp_search_window === "3mo" ? "completed" : "warning"}`}
          >
            {row.comp_search_window}
          </span>
        </td>
        <td>
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="link"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        </td>
      </tr>

      {open && (
        <tr className="comps-panel">
          <td colSpan={12}>
            <div className="comps-grid">
              {row.comps.map((c, i) => (
                <CompCard key={i} comp={c} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function sortValue(row: MatchedResult, key: SortKey): number {
  switch (key) {
    case "price":
      return row.listing.price ?? -Infinity;
    case "beds":
      return row.listing.beds ?? -Infinity;
    case "baths":
      return row.listing.baths ?? -Infinity;
    case "sqft":
      return row.listing.sqft ?? -Infinity;
    case "comps":
      return row.comps.length;
    case "days":
      return row.listing.days_on_zillow ?? -Infinity;
    case "listed": {
      const l = row.listing;
      if (l.days_on_zillow != null && l.created_at) {
        const scraped = new Date(l.created_at).getTime();
        if (!isNaN(scraped)) return scraped - l.days_on_zillow * 86400000;
      }
      return -Infinity;
    }
    default:
      return 0;
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

export default function ResultsTable({
  results,
}: {
  results: MatchedResult[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return results;
    return [...results].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [results, sortKey, sortDir]);

  if (results.length === 0) {
    return (
      <div className="table-wrap">
        <div className="empty-state">
          <div className="empty-state-icon">&#x1F50D;</div>
          <div className="empty-state-title">No results found</div>
          <div className="empty-state-desc">
            Try a different run, property type, or sqft tolerance.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ paddingLeft: 32 }}>Address</th>
            <th>ZIP</th>
            <SortableHeader label="Price" sortKey="price" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <SortableHeader label="Beds" sortKey="beds" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <SortableHeader label="Baths" sortKey="baths" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <SortableHeader label="Sqft" sortKey="sqft" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <th>Style</th>
            <SortableHeader label="Listed" sortKey="listed" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Days" sortKey="days" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <SortableHeader label="Comps" sortKey="comps" activeKey={sortKey} activeDir={sortDir} onSort={handleSort} align="right" />
            <th>Window</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <ListingRow
              key={row.listing.zpid ?? row.listing.url}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
