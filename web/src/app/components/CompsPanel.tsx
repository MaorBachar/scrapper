"use client";

import { useEffect, useMemo } from "react";

import type { CompRow, OppSettings } from "@/lib/types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  listingPrice: number | null;
  listingSqft: number | null;
  comps: CompRow[];
  avgPrice: number | null;
  oppSettings: OppSettings | null;
};

function currency(n: number | null | undefined): string {
  if (n == null) return "-";
  return "$" + Math.abs(n).toLocaleString("en-US");
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    const d = new Date(s + "T00:00:00");
    if (isNaN(d.getTime())) return "-";
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  } catch {
    return "-";
  }
}

function priceDelta(listingPrice: number | null, avgComp: number | null): string | null {
  if (listingPrice == null || avgComp == null || avgComp === 0) return null;
  const pct = ((listingPrice - avgComp) / avgComp) * 100;
  const sign = pct >= 0 ? "above" : "below";
  return `Listing is ${Math.abs(Math.round(pct))}% ${sign} avg comp`;
}

function isCompQualifying(
  comp: CompRow,
  listingPrice: number | null,
  listingSqft: number | null,
  settings: OppSettings
): boolean {
  if (listingPrice == null || comp.sold_price == null || comp.sold_price <= 0) return false;
  const priceThreshold = comp.sold_price * (1 - settings.pctBelow / 100);
  if (listingPrice > priceThreshold) return false;
  if (comp.distance_miles == null || comp.distance_miles > settings.maxDistance) return false;
  if (!listingSqft || listingSqft <= 0 || !comp.sqft || comp.sqft <= 0) return false;
  const lo = listingSqft * (1 - settings.sqftRange / 100);
  const hi = listingSqft * (1 + settings.sqftRange / 100);
  if (!(comp.sqft >= lo && comp.sqft <= hi)) return false;
  if (comp.sold_date) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - settings.maxCompMonths);
    if (new Date(comp.sold_date).getTime() < cutoff.getTime()) return false;
  }
  return true;
}

export default function CompsPanel({ isOpen, onClose, address, listingPrice, listingSqft, comps, avgPrice, oppSettings }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const { qualifying, other } = useMemo(() => {
    if (!oppSettings) return { qualifying: comps, other: [] as CompRow[] };
    const q: CompRow[] = [];
    const o: CompRow[] = [];
    for (const c of comps) {
      if (isCompQualifying(c, listingPrice, listingSqft, oppSettings)) {
        q.push(c);
      } else {
        o.push(c);
      }
    }
    return { qualifying: q, other: o };
  }, [comps, listingPrice, listingSqft, oppSettings]);

  if (!isOpen) return null;

  const delta = priceDelta(listingPrice, avgPrice);
  const hasGroups = qualifying.length > 0 && other.length > 0;

  function renderCompCard(c: CompRow, i: number, isQualified: boolean) {
    const pctBelow = listingPrice != null && c.sold_price != null && c.sold_price > 0
      ? Math.round(((c.sold_price - listingPrice) / c.sold_price) * 100)
      : null;

    return (
      <div key={i} className={`comp-card ${isQualified ? "qualifying" : "non-qualifying"}`}>
        <div className="comp-card-address">
          {c.url ? (
            <a href={c.url} target="_blank" rel="noreferrer" className="link">{c.address ?? "Unknown"}</a>
          ) : (
            c.address ?? "Unknown"
          )}
        </div>
        <div className="comp-card-row">
          <span className="comp-card-price">{currency(c.sold_price)}</span>
          {pctBelow != null && pctBelow !== 0 && (
            <span className={`comp-card-delta ${pctBelow > 0 ? "below" : "above"}`}>
              {pctBelow > 0 ? `${pctBelow}% below` : `${Math.abs(pctBelow)}% above`}
            </span>
          )}
          {c.distance_miles != null && (
            <span className="comp-card-detail">{c.distance_miles.toFixed(1)}mi</span>
          )}
          <span className="comp-card-detail">{fmtDate(c.sold_date)}</span>
        </div>
        <div className="comp-card-row comp-card-stats">
          {c.beds != null && <span>{c.beds}bd</span>}
          {c.baths != null && <span>{c.baths}ba</span>}
          {c.sqft != null && c.sqft > 0 && <span>{c.sqft.toLocaleString()}sf</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2>Sold Comps</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-address">{address}</div>

        <div className="comps-summary">
          {oppSettings && qualifying.length > 0 ? (
            <span className="comps-summary-count">{qualifying.length} of {comps.length} match criteria</span>
          ) : (
            <span className="comps-summary-count">{comps.length} comp{comps.length !== 1 ? "s" : ""}</span>
          )}
          {avgPrice != null && (
            <span className="comps-summary-avg">Avg {currency(avgPrice)}</span>
          )}
          {delta && <span className="comps-summary-delta">{delta}</span>}
        </div>

        <div className="modal-form" style={{ overflowY: "auto", padding: "0 20px 20px" }}>
          {comps.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>
              No sold comps found for this listing.
            </div>
          ) : (
            <div className="comps-list">
              {qualifying.map((c, i) => renderCompCard(c, i, true))}
              {hasGroups && (
                <div className="comps-divider">
                  <span>Other comps</span>
                </div>
              )}
              {other.map((c, i) => renderCompCard(c, qualifying.length + i, false))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
