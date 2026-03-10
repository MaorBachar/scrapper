"use client";

import { useEffect, useState } from "react";

type FavZip = { zipcode: string; lastScrapedAt: string | null };

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ScrapeForm() {
  const [favorites, setFavorites] = useState<FavZip[]>([]);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/favorites/zipcodes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => (Array.isArray(data) ? setFavorites(data) : setFavorites([])))
      .catch(() => setFavorites([]));
  }, []);

  async function addZips(e: React.FormEvent) {
    e.preventDefault();
    const zips = input
      .split(",")
      .map((z) => z.trim())
      .filter((z) => z.length > 0 && !favorites.some((f) => f.zipcode === z));
    if (zips.length === 0) return;

    setAdding(true);
    try {
      await Promise.all(
        zips.map((z) =>
          fetch("/api/favorites/zipcodes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ zipcode: z }),
          })
        )
      );
      setFavorites((prev) =>
        [...prev, ...zips.map((z) => ({ zipcode: z, lastScrapedAt: null }))].sort(
          (a, b) => a.zipcode.localeCompare(b.zipcode)
        )
      );
      setInput("");
    } finally {
      setAdding(false);
    }
  }

  async function removeZip(zip: string) {
    await fetch(`/api/favorites/zipcodes/${encodeURIComponent(zip)}`, {
      method: "DELETE",
    });
    setFavorites((prev) => prev.filter((f) => f.zipcode !== zip));
  }

  return (
    <div className="card section">
      <div className="card-body">
        <div className="section-title" style={{ marginBottom: 4 }}>
          Auto Scan Zipcodes
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            margin: "0 0 12px",
          }}
        >
          Add ZIP codes to scan automatically every 2 hours for new for-sale
          listings.
        </p>

        <form onSubmit={addZips} className="form-row">
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <input
              className="form-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="44125, 44101, 44102"
              disabled={adding}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={adding || !input.trim()}>
            {adding ? "Adding..." : "Add"}
          </button>
        </form>

        <div className="fav-row" style={{ marginTop: 12 }}>
          {favorites.length === 0 && (
            <span className="fav-hint">No ZIP codes yet. Add some above.</span>
          )}

          {favorites.map((f) => (
            <span key={f.zipcode} className="fav-chip selected">
              <span>{f.zipcode}</span>
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.75,
                  fontWeight: 400,
                  marginLeft: 2,
                }}
                title={f.lastScrapedAt ? new Date(f.lastScrapedAt).toLocaleString() : "Not yet scanned"}
              >
                {timeAgo(f.lastScrapedAt)}
              </span>
              <button
                type="button"
                className="fav-chip-remove"
                title="Remove from auto scan"
                onClick={() => removeZip(f.zipcode)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
