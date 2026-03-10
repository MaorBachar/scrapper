"use client";

import { useEffect, useRef } from "react";

type Listing = {
  id?: string | null;
  url: string;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  state?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  home_type?: string | null;
  architectural_style?: string | null;
  days_on_zillow?: number | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  created_at?: string | null;
};

type Props = {
  listing: Listing;
  lifecycleStatus: string;
  onClose: () => void;
  onLifecycleClick: () => void;
  onSmsClick: () => void;
};

function currency(n: number | null | undefined) {
  if (n == null) return "-";
  return "$" + Math.abs(n).toLocaleString("en-US");
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "-";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return "-";
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  } catch { return "-"; }
}

function listedDate(l: Listing) {
  if (l.days_on_zillow == null || !l.created_at) return "-";
  try {
    const scraped = new Date(l.created_at);
    const listed = new Date(scraped.getTime() - l.days_on_zillow * 86400000);
    return `${listed.getUTCMonth() + 1}/${listed.getUTCDate()}/${listed.getUTCFullYear()}`;
  } catch { return "-"; }
}

export default function PropertyDetailSheet({ listing: l, lifecycleStatus, onClose, onLifecycleClick, onSmsClick }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const address = l.address ?? [l.city, l.state].filter(Boolean).join(", ") ?? "Unknown";
  const location = [l.city, l.state, l.zipcode].filter(Boolean).join(", ");

  return (
    <div className="sheet-backdrop" onClick={handleBackdropClick}>
      <div className="sheet-panel" ref={panelRef}>
        <div className="sheet-handle" />

        {/* Header */}
        <div className="sheet-header">
          <div>
            <div className="sheet-address">{address}</div>
            {location && <div className="sheet-zip">{location}</div>}
          </div>
          <button className="sheet-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="sheet-body">
          {/* Price */}
          <div className="sheet-price">{currency(l.price)}</div>

          {/* Key stats grid */}
          <div className="sheet-stats-grid">
            <div className="sheet-stat">
              <div className="sheet-stat-label">Beds</div>
              <div className="sheet-stat-value">{l.beds ?? "-"}</div>
            </div>
            <div className="sheet-stat">
              <div className="sheet-stat-label">Baths</div>
              <div className="sheet-stat-value">{l.baths ?? "-"}</div>
            </div>
            <div className="sheet-stat">
              <div className="sheet-stat-label">Sqft</div>
              <div className="sheet-stat-value">
                {l.sqft && l.sqft > 0 ? l.sqft.toLocaleString("en-US") : "-"}
              </div>
            </div>
            <div className="sheet-stat">
              <div className="sheet-stat-label">Days on market</div>
              <div className="sheet-stat-value">{l.days_on_zillow ?? "-"}</div>
            </div>
          </div>

          {/* Secondary info pills */}
          <div className="sheet-row">
            {l.architectural_style && (
              <div className="sheet-pill">
                <span className="sheet-pill-label">Style</span>
                <span className="sheet-pill-value">{l.architectural_style}</span>
              </div>
            )}
            {l.home_type && (
              <div className="sheet-pill">
                <span className="sheet-pill-label">Type</span>
                <span className="sheet-pill-value">{l.home_type}</span>
              </div>
            )}
            <div className="sheet-pill">
              <span className="sheet-pill-label">Listed</span>
              <span className="sheet-pill-value">{listedDate(l)}</span>
            </div>
            <div className="sheet-pill">
              <span className="sheet-pill-label">Added</span>
              <span className="sheet-pill-value">{fmtDate(l.created_at)}</span>
            </div>
          </div>

          {/* Agent */}
          {(l.agent_name || l.agent_phone) && (
            <div className="sheet-agent">
              <span className="sheet-pill-label">Agent</span>
              {l.agent_name && <strong>{l.agent_name}</strong>}
              {l.agent_phone && (
                <a href={`tel:${l.agent_phone}`} className="link">{l.agent_phone}</a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="sheet-actions">
            <button className="btn btn-secondary" onClick={onLifecycleClick}>
              {lifecycleStatus}
            </button>
            <button className="btn btn-secondary" onClick={onSmsClick}>
              SMS
            </button>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
            >
              Link ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
