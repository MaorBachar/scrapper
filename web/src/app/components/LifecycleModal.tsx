"use client";

import { useEffect, useState } from "react";

const LIFECYCLE_OPTIONS = [
  "Sent SMS",
  "Waiting for POS",
  "Do follow up",
  "Other",
];

type HistoryEntry = {
  id: string;
  lifecycle: string;
  date: string;
  description?: string | null;
  source?: string | null;
  created_at: string;
};

function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return "-";
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  } catch {
    return "-";
  }
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  propertyKey: string;
  propertyKeyHash: string;
  address: string;
  initialStatus: string;
  onSaved: (propertyKeyHash: string, entry: { lifecycle: string; created_at: string }) => void;
};

export default function LifecycleModal({
  isOpen,
  onClose,
  propertyKey,
  propertyKeyHash,
  address,
  initialStatus,
  onSaved,
}: Props) {
  const [lifecycle, setLifecycle] = useState(
    LIFECYCLE_OPTIONS.includes(initialStatus) ? initialStatus : LIFECYCLE_OPTIONS[0]
  );
  const [description, setDescription] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && propertyKeyHash) {
      setLoadingHistory(true);
      fetch(`/api/lifecycle?propertyKeyHash=${encodeURIComponent(propertyKeyHash)}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setHistory(data || []))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, propertyKeyHash]);

  useEffect(() => {
    if (isOpen) {
      setLifecycle(LIFECYCLE_OPTIONS.includes(initialStatus) ? initialStatus : LIFECYCLE_OPTIONS[0]);
      setFollowUpDate("");
    }
  }, [isOpen, initialStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_key: propertyKey,
          lifecycle,
          description: description.trim() || undefined,
          follow_up_date: lifecycle === "Do follow up" && followUpDate ? followUpDate : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      const newEntry = await res.json();
      setDescription("");
      setFollowUpDate("");
      onSaved(propertyKeyHash, {
        lifecycle: newEntry.lifecycle,
        created_at: newEntry.created_at || new Date().toISOString(),
      });
      setHistory((prev) => [newEntry, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="modal-panel" role="dialog" aria-labelledby="lifecycle-modal-title">
        <div className="modal-header">
          <h2 id="lifecycle-modal-title">Update Lifecycle</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <p className="modal-address">{address}</p>

        <div className="modal-form">
          {loadingHistory ? (
            <p className="text-muted text-sm">Loading history...</p>
          ) : history.length > 0 ? (
            <div className="lifecycle-history">
              <div className="lifecycle-history-title">History</div>
              <ul className="lifecycle-history-list">
                {history.map((h) => (
                  <li key={h.id} className="lifecycle-history-item">
                    <span className="lifecycle-history-date">{fmtDate(h.created_at)}</span>
                    <span className="lifecycle-history-status">{h.lifecycle}</span>
                    {h.source === "auto" && (
                      <span className="lifecycle-history-auto">auto</span>
                    )}
                    {h.description && (
                      <span className="lifecycle-history-desc">{h.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="lifecycle-select">Status</label>
              <select
                id="lifecycle-select"
                className="form-input"
                value={lifecycle}
                onChange={(e) => setLifecycle(e.target.value)}
                required
                disabled={saving}
              >
                {LIFECYCLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            {lifecycle === "Do follow up" && (
              <div className="form-group">
                <label htmlFor="lifecycle-followup">Follow-up date</label>
                <input
                  id="lifecycle-followup"
                  type="date"
                  className="form-input"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  disabled={saving}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="lifecycle-desc">Description</label>
              <textarea
                id="lifecycle-desc"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes..."
                rows={4}
                disabled={saving}
                style={{ resize: "vertical", minHeight: 80 }}
              />
            </div>
            {error && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
