"use client";

import { useEffect, useState } from "react";

/**
 * Fetches average cadence from FIT files (last 10 rides) lazily after the
 * page loads. Cadence is not included in Zwift's activity list API summary —
 * it only exists inside each ride's FIT file — so this card loads async
 * rather than blocking the initial page render.
 */
export default function AvgCadenceCard() {
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
