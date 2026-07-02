"use client";

import { useEffect, useState } from "react";

/**
 * Fetches average heart rate from FIT files (last 10 rides with HR data)
 * lazily after the page loads. The Zwift activity-list API doesn't reliably
 * include avgHeartRate per ride, so we derive it from each ride's FIT file
 * via the chart-extras route (same source the Performance trends chart uses).
 *
 * mode="row"  → horizontal layout for use inside a rubric card.
 * mode="chip" → compact pill for use in the dashboard header.
 */
export default function AvgHRCard({ mode }: { mode: "row" | "chip" }) {
  const [hr, setHr] = useState<number | null>(null);
  const [rideCount, setRideCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zwift/chart-extras?count=30")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !Array.isArray(data.extras)) return;
        const vals = (data.extras as { avgHeartRate: number | null }[])
          .map((e) => e.avgHeartRate)
          .filter((v): v is number => v != null && v > 0)
          .slice(0, 10);
        if (vals.length > 0) {
          setHr(Math.round(vals.reduce((s, v) => s + v, 0) / vals.length));
          setRideCount(vals.length);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (mode === "chip") {
    if (loading || hr == null) return null;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 20,
        background: "rgba(196,41,26,0.09)",
        fontSize: 13, fontWeight: 600, color: "#c4291a",
        letterSpacing: "-0.2px",
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {hr} bpm
      </span>
    );
  }

  // mode === "row"
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "16px 18px", gap: 12 }}>
      <div className="stat-card-icon c-red" style={{ flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Avg heart rate</div>
        <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.65, marginTop: 2 }}>
          {loading ? "" : rideCount > 0 ? `last ${rideCount} rides` : "from FIT data"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
        {loading ? (
          <span style={{ fontSize: 14, opacity: 0.35, minWidth: 48, textAlign: "right" }}>…</span>
        ) : hr != null ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>bpm</span>
            <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>
              {hr}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 19, fontWeight: 700, color: "var(--muted)", minWidth: 48, textAlign: "right" }}>—</span>
        )}
      </div>
    </div>
  );
}
