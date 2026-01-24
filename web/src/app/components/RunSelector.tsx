"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function RunSelector({ runs, activeRunId }: { runs: Array<{ run_id: string; status: string; zip_codes: string[] }>; activeRunId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRunId = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (newRunId) {
      params.set("runId", newRunId);
    } else {
      params.delete("runId");
    }
    // Preserve propertyType param when changing runs
    // (it will be preserved automatically since we're copying all params)
    router.push(`?${params.toString()}`);
  };

  return (
    <select
      value={activeRunId || ""}
      onChange={handleChange}
      style={{
        padding: "4px 8px",
        border: "1px solid #ccc",
        borderRadius: 4,
        fontSize: 14,
        marginTop: 4,
      }}
    >
      {runs.map((run) => (
        <option key={run.run_id} value={run.run_id}>
          {run.run_id} ({run.status}) - {run.zip_codes.join(", ")}
        </option>
      ))}
    </select>
  );
}
