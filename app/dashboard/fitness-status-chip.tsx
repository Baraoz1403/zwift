"use client";

import { useEffect, useState } from "react";
import type { FitnessTrendsResponse } from "@/app/api/zwift/fitness-trends/route";

const STATUS_COLORS: Record<string, string> = {
  overreaching: "#e65a14",
  productive:   "#1ea046",
  fresh:        "#2f8fe0",
  detraining:   "#848490",
};

const STATUS_LABELS: Record<string, string> = {
  overreaching: "Overreaching",
  productive:   "Productive",
  fresh:        "Fresh",
  detraining:   "Detraining",
};

/**
 * Header chip: Training Score (CTL) + current status label.
 * Matches the Zwift Companion "Training Score · Status" concept.
 * Tooltip shows full CTL / ATL / TSB breakdown.
 */
export default function FitnessStatusChip() {
  const [data, setData] = useState<FitnessTrendsResponse | null>(null);

  useEffect(() => {
    fetch("/api/zwift/fitness-trends")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, []);

  if (!data?.ok || !data.current) return null;

  const { status, ctl, atl, tsb } = data.current;
  const color  = STATUS_COLORS[status] ?? "#848490";
  const label  = STATUS_LABELS[status] ?? status;
  const score  = Math.round(ctl);
  const tsbStr = (tsb >= 0 ? "+" : "") + tsb;

  return (
    <div
      title={`Training Score (CTL) ${score} · TSB ${tsbStr} · ATL ${atl}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 0,
        borderRadius: 20,
        border: `1px solid ${color}40`,
        background: `${color}12`,
        overflow: "hidden",
        cursor: "default",
        userSelect: "none" as const,
        whiteSpace: "nowrap" as const,
        fontSize: 12,
      }}
    >
      {/* Left: dot + number */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 9px 4px 8px",
        borderRight: `1px solid ${color}30`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: color, flexShrink: 0,
          boxShadow: `0 0 5px ${color}80`,
        }} />
        <span style={{ fontWeight: 800, color, letterSpacing: "-0.3px", fontSize: 13 }}>
          {score}
        </span>
      </div>

      {/* Right: label stack — "Training Score" above status */}
      <div style={{
        display: "flex", flexDirection: "column",
        padding: "3px 10px",
        lineHeight: 1.2,
      }}>
        <span style={{ fontSize: 9.5, fontWeight: 600, color, opacity: 0.6, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
          Training Score
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color }}>
          {label}
        </span>
      </div>
    </div>
  );
}
