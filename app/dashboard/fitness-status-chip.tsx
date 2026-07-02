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
 * A small inline chip showing the rider's current training status
 * (Fresh / Productive / Overreaching / Detraining) + TSB score.
 * Fetches /api/zwift/fitness-trends on mount and renders nothing
 * while loading or if the request fails.
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

  const { status, tsb } = data.current;
  const color = STATUS_COLORS[status] ?? "#848490";
  const label = STATUS_LABELS[status] ?? status;
  const tsbStr = (tsb > 0 ? "+" : "") + tsb;

  return (
    <div
      title={`Training Status · CTL ${data.current.ctl} · ATL ${data.current.atl} · TSB ${tsbStr}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 11px 4px 8px",
        borderRadius: 20,
        border: `1px solid ${color}45`,
        background: `${color}14`,
        fontSize: 12, fontWeight: 650,
        color: color,
        letterSpacing: "0.01em",
        cursor: "default",
        userSelect: "none",
        whiteSpace: "nowrap" as const,
      }}
    >
      {/* Status dot */}
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: color, flexShrink: 0,
        boxShadow: `0 0 5px ${color}80`,
      }} />
      {label}
      <span style={{
        fontSize: 11, fontWeight: 500,
        opacity: 0.75,
        borderLeft: `1px solid ${color}40`,
        paddingLeft: 6,
      }}>
        {tsbStr}
      </span>
    </div>
  );
}
