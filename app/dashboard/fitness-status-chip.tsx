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
  const statusColor = STATUS_COLORS[status] ?? "#848490";
  const label = STATUS_LABELS[status] ?? status;
  const score = Math.round(ctl);
  const tsbStr = (tsb >= 0 ? "+" : "") + tsb;

  return (
    <div
      title={`Training Score (CTL) ${score} · TSB ${tsbStr} · ATL ${atl}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "9px 15px", borderRadius: 6,
        border: "1px solid rgba(47,143,224,0.22)",
        background: "rgba(47,143,224,0.06)",
        fontSize: 12.5, fontWeight: 500,
        color: "var(--accent)",
        whiteSpace: "nowrap" as const,
        fontFamily: "var(--font-sans)",
        cursor: "default",
        userSelect: "none" as const,
      }}
    >
      {/* Status dot — colored per Fresh/Productive/etc. */}
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: statusColor, flexShrink: 0,
        boxShadow: `0 0 4px ${statusColor}80`,
      }} />
      Training Score {score}
      <span style={{ opacity: 0.5, margin: "0 1px" }}>·</span>
      <span style={{ color: statusColor, fontWeight: 600 }}>{label}</span>
    </div>
  );
}
