"use client";

import { useCallback, useEffect, useState } from "react";

type RunStatusData = {
  run_id: string;
  status: "pending" | "running" | "listings_completed" | "completed" | "failed";
  zip_codes: string[];
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export default function RunStatus({
  runId,
  onCompleted,
}: {
  runId: string;
  onCompleted?: () => void;
}) {
  const [data, setData] = useState<RunStatusData | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/scrape/${runId}/status`);
      if (res.ok) {
        const json: RunStatusData = await res.json();
        setData(json);
        if (json.status === "completed" || json.status === "failed") {
          onCompleted?.();
        }
        return json.status;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [runId, onCompleted]);

  useEffect(() => {
    fetchStatus();

    const id = setInterval(async () => {
      const s = await fetchStatus();
      if (s === "completed" || s === "failed") clearInterval(id);
    }, 4000);

    return () => clearInterval(id);
  }, [fetchStatus]);

  if (!data) return null;

  const isActive =
    data.status === "pending" ||
    data.status === "running" ||
    data.status === "listings_completed";

  const bannerClass = !isActive
    ? `alert alert-${data.status === "completed" ? "success" : "error"}`
    : data.status === "listings_completed"
      ? "alert alert-success"
      : "";

  const bannerText =
    data.status === "listings_completed"
      ? `Listings ready — comps scraping in background — ${data.run_id}`
      : isActive
        ? `Scraping in progress — ${data.run_id}`
        : data.status === "completed"
          ? `Scrape ${data.run_id} completed`
          : `Scrape ${data.run_id} failed`;

  return (
    <div className={`run-banner ${bannerClass}`}
      style={!isActive || data.status === "listings_completed" ? { marginBottom: 20 } : undefined}
    >
      {isActive && <div className="spinner" />}
      <div className="run-banner-text" style={!isActive || data.status === "listings_completed" ? { color: "inherit" } : undefined}>
        {bannerText}
      </div>
      <div className="run-banner-meta">
        ZIPs: {data.zip_codes.join(", ")}
        {data.error_message && (
          <span style={{ color: "var(--danger)", marginLeft: 8 }}>
            {data.error_message.slice(0, 120)}
          </span>
        )}
      </div>
    </div>
  );
}
