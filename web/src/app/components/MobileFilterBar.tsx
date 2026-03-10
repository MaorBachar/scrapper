"use client";

import { useEffect, useState } from "react";
import { buildSearchParams, LIFECYCLE_STATUSES, type PropertyFilters } from "@/lib/propertyFilters";
import { useNavigation } from "./NavigationContext";
import MobileFilterSheet from "./MobileFilterSheet";
import OpportunitySettingsPopover from "./OpportunitySettingsPopover";
import type { LifecycleStats } from "@/lib/types";

type Props = {
  currentFilters: PropertyFilters;
  uniqueZipcodes: string[];
};

export default function MobileFilterBar({ currentFilters, uniqueZipcodes }: Props) {
  const { push } = useNavigation();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<LifecycleStats | null>(null);
  const [oppSettings, setOppSettings] = useState({ pctBelow: 30, minComps: 2, sqftRange: 20, maxDistance: 0.5, maxCompMonths: 3 });

  useEffect(() => {
    fetch("/api/lifecycle/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => null);
    fetch("/api/opportunity-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOppSettings(d))
      .catch(() => {});
  }, []);

  const { zipcode: zipcodeFilter, priceMin, priceMax, lifecycle } = currentFilters;

  const activeFilterCount = [
    zipcodeFilter,
    lifecycle,
    priceMin && priceMin > 0 ? priceMin : null,
    priceMax && priceMax > 0 ? priceMax : null,
  ].filter(Boolean).length;

  function navigateLifecycle(stage: string | undefined) {
    const qs = buildSearchParams({ ...currentFilters, lifecycle: stage, page: 1 });
    push(qs ? `/properties?${qs}` : "/properties");
  }

  return (
    <>
      <div className="mobile-filter-bar">
        {/* Row 1: filter button + active chips */}
        <div className="mobile-filter-row">
          <button
            type="button"
            className={`mobile-filter-btn ${activeFilterCount > 0 ? "has-filters" : ""}`}
            onClick={() => setOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            Filter &amp; Sort
            {activeFilterCount > 0 && (
              <span className="mobile-filter-badge">{activeFilterCount}</span>
            )}
          </button>

          <OpportunitySettingsPopover
            pctBelow={oppSettings.pctBelow}
            minComps={oppSettings.minComps}
            sqftRange={oppSettings.sqftRange}
            maxDistance={oppSettings.maxDistance}
            maxCompMonths={oppSettings.maxCompMonths}
            onSave={(p, m, s, d, mo) => {
              setOppSettings({ pctBelow: p, minComps: m, sqftRange: s, maxDistance: d, maxCompMonths: mo });
              push(window.location.pathname + window.location.search);
            }}
          />

          {currentFilters.opportunity !== false && (
            <span className="mobile-chip">
              Opp only
              <a className="mobile-chip-remove" onClick={() => {
                const qs = buildSearchParams({ ...currentFilters, opportunity: false, page: 1 });
                push(qs ? `/properties?${qs}` : "/properties");
              }}>×</a>
            </span>
          )}

          {lifecycle && (
            <span className="mobile-chip">
              Stage: {lifecycle}
              <a className="mobile-chip-remove" onClick={() => navigateLifecycle(undefined)}>×</a>
            </span>
          )}
          {zipcodeFilter && (
            <span className="mobile-chip">
              ZIP: {zipcodeFilter}
              <a className="mobile-chip-remove" onClick={() => {
                const qs = buildSearchParams({ ...currentFilters, zipcode: undefined, page: 1 });
                push(qs ? `/properties?${qs}` : "/properties");
              }}>×</a>
            </span>
          )}
          {priceMin && priceMin > 0 ? (
            <span className="mobile-chip">
              Min: ${priceMin.toLocaleString()}
              <a className="mobile-chip-remove" onClick={() => {
                const qs = buildSearchParams({ ...currentFilters, priceMin: undefined, page: 1 });
                push(qs ? `/properties?${qs}` : "/properties");
              }}>×</a>
            </span>
          ) : null}
          {priceMax && priceMax > 0 ? (
            <span className="mobile-chip">
              Max: ${priceMax.toLocaleString()}
              <a className="mobile-chip-remove" onClick={() => {
                const qs = buildSearchParams({ ...currentFilters, priceMax: undefined, page: 1 });
                push(qs ? `/properties?${qs}` : "/properties");
              }}>×</a>
            </span>
          ) : null}
          {activeFilterCount > 0 && (
            <button className="mobile-clear-btn" onClick={() => push("/properties")}>
              Clear all
            </button>
          )}
        </div>

        {/* Row 2: pipeline stage chips */}
        <div className="mobile-pipeline-row">
          <button
            type="button"
            className={`pipeline-chip ${currentFilters.opportunity === false ? "active" : ""}`}
            onClick={() => {
              const qs = buildSearchParams({ ...currentFilters, opportunity: false, page: 1 });
              push(qs ? `/properties?${qs}` : "/properties");
            }}
          >
            All {stats && <span className="pipeline-chip-count">{stats.total}</span>}
          </button>
          <button
            type="button"
            className={`pipeline-chip opp-chip ${currentFilters.opportunity !== false ? "active" : ""}`}
            onClick={() => {
              const qs = buildSearchParams({ ...currentFilters, opportunity: undefined, page: 1 });
              push(qs ? `/properties?${qs}` : "/properties");
            }}
          >
            Opp
          </button>
          <button
            type="button"
            className={`pipeline-chip price-drop-chip ${currentFilters.priceDrop ? "active" : ""}`}
            onClick={() => {
              const qs = buildSearchParams({
                ...currentFilters,
                priceDrop: currentFilters.priceDrop ? undefined : true,
                opportunity: currentFilters.priceDrop ? undefined : false,
                page: 1,
              });
              push(qs ? `/properties?${qs}` : "/properties");
            }}
          >
            Price Drop
            {stats && stats.priceDropCount > 0 && (
              <span className="pipeline-chip-count">{stats.priceDropCount}</span>
            )}
          </button>
          {LIFECYCLE_STATUSES.map((stage) => {
            const count = stats?.byCycle[stage] ?? 0;
            const overdue = stage === "Do follow up" ? (stats?.overdueFollowUps ?? 0) : 0;
            return (
              <button
                key={stage}
                type="button"
                className={`pipeline-chip ${lifecycle === stage ? "active" : ""}`}
                onClick={() => navigateLifecycle(lifecycle === stage ? undefined : stage)}
              >
                {stage} {stats && <span className="pipeline-chip-count">{count}</span>}
                {overdue > 0 && <span className="pipeline-chip-badge">{overdue}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <MobileFilterSheet
          currentFilters={currentFilters}
          uniqueZipcodes={uniqueZipcodes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
