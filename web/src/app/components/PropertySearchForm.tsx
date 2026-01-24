"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Run = {
  run_id: string;
  status: string;
  zip_codes: string[];
};

export default function PropertySearchForm({
  runs,
  propertyTypes,
  defaultRunId,
  defaultPropertyType,
  defaultSqftPercentage,
}: {
  runs: Run[];
  propertyTypes: string[];
  defaultRunId?: string;
  defaultPropertyType?: string;
  defaultSqftPercentage?: string;
}) {
  const router = useRouter();
  const [selectedRunId, setSelectedRunId] = useState(defaultRunId || "");
  const [selectedPropertyType, setSelectedPropertyType] = useState(
    defaultPropertyType || "Single Family"
  );
  const [sqftPercentage, setSqftPercentage] = useState(
    defaultSqftPercentage || "20"
  );
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId || !selectedPropertyType) {
      return;
    }

    setIsSearching(true);
    const params = new URLSearchParams();
    params.set("runId", selectedRunId);
    params.set("propertyType", selectedPropertyType);
    if (sqftPercentage && sqftPercentage !== "20") {
      params.set("sqftPercentage", sqftPercentage);
    }
    router.push(`?${params.toString()}`);
    // Note: setIsSearching(false) will be handled by page re-render
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 24,
        border: "1px solid #eee",
        borderRadius: 12,
        backgroundColor: "#fafafa",
        maxWidth: 600,
        margin: "0 auto",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 16 }}>Search Properties</h2>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Select a run and property type to view filtered listings and comps.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label
            htmlFor="run-select"
            style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
          >
            Run
          </label>
          <select
            id="run-select"
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            required
            disabled={isSearching}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            <option value="">-- Select a run --</option>
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.run_id} ({run.status}) - {run.zip_codes.join(", ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="property-type-select"
            style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
          >
            Property Type
          </label>
          <select
            id="property-type-select"
            value={selectedPropertyType}
            onChange={(e) => setSelectedPropertyType(e.target.value)}
            required
            disabled={isSearching}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            {propertyTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sqft-percentage-input"
            style={{ display: "block", marginBottom: 8, fontWeight: 500 }}
          >
            Sqft Tolerance (%)
          </label>
          <input
            id="sqft-percentage-input"
            type="number"
            min="0"
            max="100"
            value={sqftPercentage}
            onChange={(e) => setSqftPercentage(e.target.value)}
            required
            disabled={isSearching}
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Filter comps within ±{sqftPercentage || "20"}% of listing sqft
          </div>
        </div>

        <button
          type="submit"
          disabled={!selectedRunId || !selectedPropertyType || isSearching}
          style={{
            padding: "10px 24px",
            backgroundColor: isSearching ? "#ccc" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 500,
            cursor: isSearching ? "not-allowed" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>
    </form>
  );
}
