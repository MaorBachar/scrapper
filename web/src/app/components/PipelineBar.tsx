"use client";

import { useEffect, useState } from "react";
import { buildSearchParams, LIFECYCLE_STATUSES, type PropertyFilters } from "@/lib/propertyFilters";
import { useNavigation } from "./NavigationContext";
import type { LifecycleStats } from "@/lib/types";
import OpportunitySettingsPopover from "./OpportunitySettingsPopover";

type Props = {
  stats: LifecycleStats;
  currentLifecycle?: string;
  currentFilters: PropertyFilters;
};

export default function PipelineBar({ stats, currentLifecycle, currentFilters }: Props) {
  const { push } = useNavigation();
  const [oppSettings, setOppSettings] = useState({ pctBelow: 30, minComps: 2, sqftRange: 20, maxDistance: 0.5, maxCompMonths: 3 });

  useEffect(() => {
    fetch("/api/opportunity-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOppSettings(d))
      .catch(() => {});
  }, []);

  function navigate(lifecycle: string | undefined) {
    const filters: PropertyFilters = { ...currentFilters, lifecycle, page: 1 };
    const qs = buildSearchParams(filters);
    push(qs ? `/properties?${qs}` : "/properties");
  }

  return (
    <div className="pipeline-bar">
      {/* All -- shows everything, opportunity=false */}
      <button
        type="button"
        className={`pipeline-chip ${currentFilters.opportunity === false ? "active" : ""}`}
        onClick={() => {
          const filters: PropertyFilters = { ...currentFilters, opportunity: false, page: 1 };
          const qs = buildSearchParams(filters);
          push(qs ? `/properties?${qs}` : "/properties");
        }}
      >
        All
        <span className="pipeline-chip-count">{stats.total}</span>
      </button>

      {/* Opp -- default, opportunity=true */}
      <button
        type="button"
        className={`pipeline-chip opp-chip ${currentFilters.opportunity !== false ? "active" : ""}`}
        onClick={() => {
          const filters: PropertyFilters = { ...currentFilters, opportunity: undefined, page: 1 };
          const qs = buildSearchParams(filters);
          push(qs ? `/properties?${qs}` : "/properties");
        }}
      >
        Opp
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

      {/* Price Drop chip */}
      <button
        type="button"
        className={`pipeline-chip price-drop-chip ${currentFilters.priceDrop ? "active" : ""}`}
        onClick={() => {
          const filters: PropertyFilters = {
            ...currentFilters,
            priceDrop: currentFilters.priceDrop ? undefined : true,
            opportunity: currentFilters.priceDrop ? undefined : false,
            page: 1,
          };
          const qs = buildSearchParams(filters);
          push(qs ? `/properties?${qs}` : "/properties");
        }}
      >
        Price Drop
        {stats.priceDropCount > 0 && (
          <span className="pipeline-chip-count">{stats.priceDropCount}</span>
        )}
      </button>

      {/* Per stage */}
      {LIFECYCLE_STATUSES.map((stage) => {
        const count = stats.byCycle[stage] ?? 0;
        const isActive = currentLifecycle === stage;
        const isFollowUp = stage === "Do follow up";
        const overdue = isFollowUp ? stats.overdueFollowUps : 0;

        return (
          <button
            key={stage}
            type="button"
            className={`pipeline-chip ${isActive ? "active" : ""}`}
            onClick={() => navigate(stage)}
          >
            {stage}
            <span className="pipeline-chip-count">{count}</span>
            {overdue > 0 && (
              <span className="pipeline-chip-badge" title={`${overdue} overdue`}>
                {overdue}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
