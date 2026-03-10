"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Run = {
  run_id: string;
  status: string;
  zip_codes: string[];
  created_at: string;
};

function formatRunLabel(run: Run): string {
  const zips = Array.isArray(run.zip_codes)
    ? run.zip_codes.join(", ")
    : String(run.zip_codes ?? "");
  try {
    const d = new Date(run.created_at);
    if (isNaN(d.getTime())) throw new Error("bad date");
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const yr = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${mo}/${day}/${yr} ${h}:${m} UTC  —  ${zips}  (${run.status})`;
  } catch {
    return `${run.run_id}  —  ${zips}  (${run.status})`;
  }
}

export default function PropertySearchForm({
  runs,
  propertyTypes,
  defaultRunId,
  defaultPropertyType,
  defaultSqftPercentage,
  defaultMaxDays,
}: {
  runs: Run[];
  propertyTypes: string[];
  defaultRunId?: string;
  defaultPropertyType?: string;
  defaultSqftPercentage?: string;
  defaultMaxDays?: string;
}) {
  const router = useRouter();
  const [selectedRunId, setSelectedRunId] = useState(defaultRunId || "");
  const [selectedPropertyType, setSelectedPropertyType] = useState(
    defaultPropertyType || "Single Family"
  );
  const [sqftPercentage, setSqftPercentage] = useState(
    defaultSqftPercentage || "20"
  );
  const [maxDays, setMaxDays] = useState(defaultMaxDays || "");
  const [searching, setSearching] = useState(false);

  const completedRuns = runs.filter((r) => r.status === "completed");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId || !selectedPropertyType) return;
    setSearching(true);
    const params = new URLSearchParams();
    params.set("runId", selectedRunId);
    params.set("propertyType", selectedPropertyType);
    if (sqftPercentage && sqftPercentage !== "20") {
      params.set("sqftPercentage", sqftPercentage);
    }
    if (maxDays) {
      params.set("maxDays", maxDays);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="section-title" style={{ marginBottom: 14 }}>
          View Results
        </div>

        {completedRuns.length === 0 ? (
          <p className="text-muted text-sm">
            No completed runs yet. Start a scrape above.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ flex: "1 1 280px" }}>
                <label htmlFor="run-select">Run</label>
                <select
                  id="run-select"
                  className="form-input"
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  required
                  disabled={searching}
                >
                  <option value="">Select a run...</option>
                  {completedRuns.map((run) => (
                    <option key={run.run_id} value={run.run_id}>
                      {formatRunLabel(run)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: "0 0 170px" }}>
                <label htmlFor="prop-type">Property Type</label>
                <select
                  id="prop-type"
                  className="form-input"
                  value={selectedPropertyType}
                  onChange={(e) => setSelectedPropertyType(e.target.value)}
                  disabled={searching}
                >
                  <option value="All">All</option>
                  {propertyTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: "0 0 120px" }}>
                <label htmlFor="sqft-pct">Sqft Tolerance</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span className="text-muted text-sm">&plusmn;</span>
                  <input
                    id="sqft-pct"
                    className="form-input"
                    type="number"
                    min="0"
                    max="100"
                    value={sqftPercentage}
                    onChange={(e) => setSqftPercentage(e.target.value)}
                    disabled={searching}
                    style={{ flex: 1 }}
                  />
                  <span className="text-muted text-sm">%</span>
                </div>
              </div>

              <div className="form-group" style={{ flex: "0 0 140px" }}>
                <label htmlFor="max-days">Listed Within</label>
                <select
                  id="max-days"
                  className="form-input"
                  value={maxDays}
                  onChange={(e) => setMaxDays(e.target.value)}
                  disabled={searching}
                >
                  <option value="">Any time</option>
                  <option value="7">Last 7 days</option>
                  <option value="14">Last 14 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="60">Last 60 days</option>
                  <option value="90">Last 90 days</option>
                </select>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!selectedRunId || searching}
              >
                {searching ? "Loading..." : "Search"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
