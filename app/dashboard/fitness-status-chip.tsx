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
  const color = STATUS_COLORS[status] ?? "#848490";
  const label = STATUS_LABELS[status] ?? status;
  const score = Math.round(ctl);
  const tsbStr = (tsb >= 0 ? "+" : "") + tsb;

  return (
    <div
      title={`Training Score (CTL) ${score} · TSB ${tsbStr} · ATL ${atl}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "9px 15px", borderRadius: 6,
        border: `1px solid ${color}38`,
        background: `${color}07`,
        fontSize: 12.5, fontWeight: 500,
        color: color,
        whiteSpace: "nowrap" as const,
        fontFamily: "var(--font-sans)",
        cursor: "default",
        userSelect: "none" as const,
      }}
    >
      {/* Colored dot */}
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: color, flexShrink: 0,
        boxShadow: `0 0 4px ${color}70`,
      }} />
      Training Score {score} · {label}
    </div>
  );
}
