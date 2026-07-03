"use client";

import { useEffect, useState } from "react";

/**
 * Fetches average cadence from FIT files (last 10 rides) lazily after the
 * page loads. Cadence is not in Zwift's activity list API — it only exists
 * inside each ride's FIT file — so this card loads async.
 *
 * asRow=true  → horizontal row layout (icon + label left, value right) for
 *               use inside redesigned rubric cards.
 * asItem=true → legacy padding-div layout for older rubric style.
 * default     → standalone stat-card.
 */
export default function AvgCadenceCard({
  asItem = false,
  asRow = false,
}: {
  asItem?: boolean;
  asRow?: boolean;
}) {
  const [cadence, setCadence] = useState<number | null>(null);
  const [rideCount, setRideCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zwift/chart-extras?count=30")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !Array.isArray(data.extras)) return;
        const vals = (data.extras as { avgCadence: number | null }[])
          .map((e) => e.avgCadence)
          .filter((v): v is number => v != null && v > 0)
          .slice(0, 10);
        if (vals.length > 0) {
          setCadence(Math.round(vals.reduce((s, v) => s + v, 0) / vals.length));
          setRideCount(vals.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Horizontal row layout for redesigned rubric cards
  if (asRow) {
    return (
      <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
        <div className="stat-card-icon c-teal" style={{ flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg cadence</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
          {loading ? (
            <span style={{ fontSize: 14, opacity: 0.35, minWidth: 48, textAlign: "right" }}>…</span>
          ) : cadence != null ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>rpm</span>
              <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>
                {cadence}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>
          )}
        </div>
      </div>
    );
  }

  // Legacy: item inside older-style rubric
  if (asItem) {
    return (
      <div style={{ padding: "14px 16px" }}>
        <div className="stat-card-head">
          <div className="stat-card-icon c-teal">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <div className="label" style={{ margin: 0 }}>Avg cadence</div>
        </div>
        <div className="value" style={{ fontSize: 19 }}>
          {loading
            ? <span style={{ opacity: 0.35, fontSize: 14 }}>loading…</span>
            : cadence != null ? `${cadence} rpm` : "n/a"}
        </div>
        <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
          {loading ? "" : rideCount > 0 ? `last ${rideCount} rides` : "from FIT data"}
        </div>
      </div>
    );
  }

  // Standalone stat-card
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        <div className="stat-card-icon c-teal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div className="label" style={{ margin: 0 }}>Avg cadence</div>
      </div>
      <div className="value">
        {loading
          ? <span style={{ opacity: 0.35, fontSize: 14 }}>loading…</span>
          : cadence != null ? `${cadence} rpm` : "n/a"}
      </div>
      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
        {loading ? "" : rideCount > 0 ? `last ${rideCount} rides` : "from FIT data"}
      </div>
    </div>
  );
}
