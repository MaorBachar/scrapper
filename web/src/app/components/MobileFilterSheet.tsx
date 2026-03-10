"use client";

import { useEffect, useRef, useState } from "react";
import { buildSearchParams, LIFECYCLE_STATUSES, type PropertyFilters } from "@/lib/propertyFilters";
import { useNavigation } from "./NavigationContext";

type SortKey =
  | "price" | "beds" | "baths" | "sqft"
  | "days" | "listed" | "added" | "lifecycle_updated";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "added",            label: "Added" },
  { key: "price",            label: "Price" },
  { key: "beds",             label: "Beds" },
  { key: "baths",            label: "Baths" },
  { key: "sqft",             label: "Sqft" },
  { key: "listed",           label: "Listed" },
  { key: "days",             label: "Days" },
  { key: "lifecycle_updated",label: "Updated" },
];

type Props = {
  currentFilters: PropertyFilters;
  uniqueZipcodes: string[];
  onClose: () => void;
};

function fmt(n: number | undefined): string {
  return n && n > 0 ? String(n) : "";
}

export default function MobileFilterSheet({ currentFilters, uniqueZipcodes, onClose }: Props) {
  const { push } = useNavigation();
  const panelRef = useRef<HTMLDivElement>(null);
  const zipId = "mfs-zip-datalist";

  const [sortKey, setSortKey] = useState<SortKey>((currentFilters.sort as SortKey) ?? "added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(currentFilters.sortDir ?? "desc");
  const [zip, setZip] = useState(currentFilters.zipcode ?? "");
  const [lifecycle, setLifecycle] = useState(currentFilters.lifecycle ?? "");
  const [priceMin, setPriceMin] = useState(fmt(currentFilters.priceMin));
  const [priceMax, setPriceMax] = useState(fmt(currentFilters.priceMax));
  const [oppOnly, setOppOnly] = useState(currentFilters.opportunity !== false);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  function handleSortPill(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleApply() {
    const min = priceMin.trim() ? parseInt(priceMin.replace(/\D/g, ""), 10) : undefined;
    const max = priceMax.trim() ? parseInt(priceMax.replace(/\D/g, ""), 10) : undefined;
    const filters: PropertyFilters = {
      zipcode: zip.trim() || undefined,
      lifecycle: lifecycle || undefined,
      opportunity: oppOnly ? undefined : false,
      priceMin: min && !isNaN(min) && min > 0 ? min : undefined,
      priceMax: max && !isNaN(max) && max > 0 ? max : undefined,
      sort: sortKey,
      sortDir,
      page: 1,
    };
    const qs = buildSearchParams(filters);
    push(qs ? `/properties?${qs}` : "/properties");
    onClose();
  }

  function handleClear() {
    push("/properties");
    onClose();
  }

  const hasChanges =
    zip.trim() !== (currentFilters.zipcode ?? "") ||
    lifecycle !== (currentFilters.lifecycle ?? "") ||
    oppOnly !== (currentFilters.opportunity !== false) ||
    priceMin !== fmt(currentFilters.priceMin) ||
    priceMax !== fmt(currentFilters.priceMax) ||
    sortKey !== (currentFilters.sort ?? "added") ||
    sortDir !== (currentFilters.sortDir ?? "desc");

  const hasActiveFilters =
    !!currentFilters.zipcode ||
    !!currentFilters.lifecycle ||
    !!currentFilters.opportunity ||
    (currentFilters.priceMin != null && currentFilters.priceMin > 0) ||
    (currentFilters.priceMax != null && currentFilters.priceMax > 0);

  return (
    <div className="sheet-backdrop" onClick={handleBackdrop}>
      <div className="sheet-panel" ref={panelRef}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div className="sheet-address" style={{ fontSize: 17 }}>Filter &amp; Sort</div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Sort section */}
        <div className="filter-sheet-section">
          <div className="filter-sheet-label">Sort by</div>
          <div className="sort-pills">
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`sort-pill ${sortKey === key ? "active" : ""}`}
                onClick={() => handleSortPill(key)}
              >
                {label}
                {sortKey === key && (
                  <span className="sort-pill-dir">
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Stage section */}
        <div className="filter-sheet-section">
          <div className="filter-sheet-label">Stage</div>
          <div className="sort-pills">
            <button
              type="button"
              className={`sort-pill ${!lifecycle ? "active" : ""}`}
              onClick={() => setLifecycle("")}
            >
              All
            </button>
            {LIFECYCLE_STATUSES.map((stage) => (
              <button
                key={stage}
                type="button"
                className={`sort-pill ${lifecycle === stage ? "active" : ""}`}
                onClick={() => setLifecycle(lifecycle === stage ? "" : stage)}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>

        {/* Opportunities toggle */}
        <div className="filter-sheet-section">
          <div className="filter-sheet-label">Opportunities</div>
          <div className="sort-pills">
            <button
              type="button"
              className={`sort-pill ${!oppOnly ? "active" : ""}`}
              onClick={() => setOppOnly(false)}
            >
              All
            </button>
            <button
              type="button"
              className={`sort-pill opp-chip ${oppOnly ? "active" : ""}`}
              onClick={() => setOppOnly(true)}
            >
              Opportunities only
            </button>
          </div>
        </div>

        {/* ZIP section */}
        <div className="filter-sheet-section">
          <div className="filter-sheet-label">ZIP Code</div>
          <input
            type="text"
            inputMode="numeric"
            className="form-input"
            style={{ width: "100%" }}
            placeholder="e.g. 44125"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            list={zipId}
          />
          <datalist id={zipId}>
            {uniqueZipcodes.map((z) => <option key={z} value={z} />)}
          </datalist>
        </div>

        {/* Price section */}
        <div className="filter-sheet-section">
          <div className="filter-sheet-label">Price Range</div>
          <div className="filter-sheet-price-row">
            <input
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="Min $"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))}
            />
            <span className="filter-sheet-sep">—</span>
            <input
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="Max $"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="filter-sheet-footer">
          {hasActiveFilters ? (
            <button type="button" className="btn btn-secondary" onClick={handleClear}>
              Clear All
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApply}
          >
            {hasChanges ? "Apply" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
