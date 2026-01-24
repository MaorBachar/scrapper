"use client";

import { useState } from "react";

export default function ScrapeForm() {
  const [zipCodes, setZipCodes] = useState("");
  const [maxListings, setMaxListings] = useState("");
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRunId(null);

    try {
      const zipArray = zipCodes
        .split(",")
        .map((z) => z.trim())
        .filter((z) => z.length > 0);

      if (zipArray.length === 0) {
        setError("Please enter at least one ZIP code");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          zip_codes: zipArray,
          max_listings_per_zip: maxListings ? parseInt(maxListings, 10) : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start scraper");
      }

      const data = await response.json();
      setRunId(data.run_id);
      // Reload the page after a short delay to show the new run
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 8,
        marginBottom: 24,
        background: "#fafafa",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 16 }}>Start New Scrape</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", minWidth: 200 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
            ZIP Codes (comma-separated)
          </label>
          <input
            type="text"
            value={zipCodes}
            onChange={(e) => setZipCodes(e.target.value)}
            placeholder="44125, 44101"
            required
            disabled={loading}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
            Max per ZIP
          </label>
          <input
            type="number"
            value={maxListings}
            onChange={(e) => setMaxListings(e.target.value)}
            placeholder="30"
            min="1"
            disabled={loading}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "8px 24px",
            background: loading ? "#ccc" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Starting..." : "Start Scrape"}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 12, padding: 8, background: "#fee", color: "#c00", borderRadius: 4, fontSize: 14 }}>
          Error: {error}
        </div>
      )}
      {runId && (
        <div style={{ marginTop: 12, padding: 8, background: "#efe", color: "#060", borderRadius: 4, fontSize: 14 }}>
          Scrape started! Run ID: {runId}. Page will refresh shortly...
        </div>
      )}
    </form>
  );
}
