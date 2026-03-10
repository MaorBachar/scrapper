"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  pctBelow: number;
  minComps: number;
  sqftRange: number;
  maxDistance: number;
  maxCompMonths: number;
  onSave: (pctBelow: number, minComps: number, sqftRange: number, maxDistance: number, maxCompMonths: number) => void;
};

export default function OpportunitySettingsPopover({ pctBelow, minComps, sqftRange, maxDistance, maxCompMonths, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(String(pctBelow));
  const [min, setMin] = useState(String(minComps));
  const [sqft, setSqft] = useState(String(sqftRange));
  const [dist, setDist] = useState(String(maxDistance));
  const [months, setMonths] = useState(String(maxCompMonths));
  const [saving, setSaving] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    setPct(String(pctBelow));
    setMin(String(minComps));
    setSqft(String(sqftRange));
    setDist(String(maxDistance));
    setMonths(String(maxCompMonths));
  }, [pctBelow, minComps, sqftRange, maxDistance, maxCompMonths]);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const popWidth = 200;
    let left = rect.right - popWidth;
    if (left < 8) left = 8;
    setPos({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = Math.max(1, Math.min(99, parseInt(pct, 10) || 30));
    const m = Math.max(1, Math.min(50, parseInt(min, 10) || 2));
    const s = Math.max(1, Math.min(100, parseInt(sqft, 10) || 20));
    const d = Math.max(0.1, Math.min(10, parseFloat(dist) || 0.5));
    const mo = Math.max(1, Math.min(24, parseInt(months, 10) || 3));
    setSaving(true);
    try {
      const res = await fetch("/api/opportunity-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pctBelow: p, minComps: m, sqftRange: s, maxDistance: d, maxCompMonths: mo }),
      });
      if (res.ok) {
        onSave(p, m, s, d, mo);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="opp-settings-wrap">
      <button
        ref={btnRef}
        type="button"
        className="opp-settings-btn"
        onClick={() => setOpen((o) => !o)}
        title="Opportunity settings"
        aria-label="Opportunity settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div
          ref={popRef}
          className="opp-settings-popover"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="opp-settings-title">Opportunity Detection</div>
          <div className="opp-settings-subtitle">Flag listings priced below sold comps</div>
          <form onSubmit={handleSubmit}>
            <label className="opp-settings-label">
              <span className="opp-settings-label-text">
                <svg className="opp-settings-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                Price below
              </span>
              <span className="opp-settings-input-wrap">
                <input
                  type="number"
                  className="form-input opp-settings-input"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  min={1}
                  max={99}
                  disabled={saving}
                />
                <span className="opp-settings-unit">%</span>
              </span>
            </label>
            <label className="opp-settings-label">
              <span className="opp-settings-label-text">
                <svg className="opp-settings-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Min comps
              </span>
              <input
                type="number"
                className="form-input opp-settings-input"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                min={1}
                max={50}
                disabled={saving}
              />
            </label>
            <label className="opp-settings-label">
              <span className="opp-settings-label-text">
                <svg className="opp-settings-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Sqft range
              </span>
              <span className="opp-settings-input-wrap">
                <span className="opp-settings-unit">&#xb1;</span>
                <input
                  type="number"
                  className="form-input opp-settings-input"
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                  min={1}
                  max={100}
                  disabled={saving}
                />
                <span className="opp-settings-unit">%</span>
              </span>
            </label>
            <label className="opp-settings-label">
              <span className="opp-settings-label-text">
                <svg className="opp-settings-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Max distance
              </span>
              <span className="opp-settings-input-wrap">
                <input
                  type="number"
                  className="form-input opp-settings-input"
                  value={dist}
                  onChange={(e) => setDist(e.target.value)}
                  min={0.1}
                  max={10}
                  step={0.1}
                  disabled={saving}
                />
                <span className="opp-settings-unit">mi</span>
              </span>
            </label>
            <label className="opp-settings-label">
              <span className="opp-settings-label-text">
                <svg className="opp-settings-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Max comp age
              </span>
              <span className="opp-settings-input-wrap">
                <input
                  type="number"
                  className="form-input opp-settings-input"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  min={1}
                  max={24}
                  disabled={saving}
                />
                <span className="opp-settings-unit">mo</span>
              </span>
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ width: "100%", marginTop: 10 }}>
              {saving ? "Saving..." : "Apply"}
            </button>
          </form>
        </div>
      )}
    </span>
  );
}
