"use client";

import { useEffect, useState } from "react";

type RunStatus = {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed";
  zip_codes: string[];
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export default function RunStatus({ runId }: { runId: string }) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/scrape/${runId}/status`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (err) {
        console.error("Failed to fetch status:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Poll every 3 seconds if status is pending or running
    const interval = setInterval(() => {
      if (status?.status === "pending" || status?.status === "running") {
        fetchStatus();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runId, status?.status]);

  if (loading || !status) {
    return null;
  }

  const statusColors: Record<string, string> = {
    pending: "#ffa500",
    running: "#0066cc",
    completed: "#060",
    failed: "#c00",
  };

  return (
    <div
      style={{
        padding: 12,
        marginBottom: 16,
        border: `1px solid ${statusColors[status.status] || "#ccc"}`,
        borderRadius: 8,
        background: status.status === "failed" ? "#fee" : status.status === "completed" ? "#efe" : "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: statusColors[status.status] || "#ccc",
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Run {status.run_id} - {status.status.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            ZIPs: {status.zip_codes.join(", ")} | Started: {new Date(status.created_at).toLocaleString()}
            {status.completed_at && ` | Completed: ${new Date(status.completed_at).toLocaleString()}`}
          </div>
          {status.error_message && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#c00" }}>Error: {status.error_message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
