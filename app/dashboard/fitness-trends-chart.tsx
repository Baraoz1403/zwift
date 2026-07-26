"use client";

import { useEffect, useState } from "react";
import type { FitnessPoint, FitnessTrendsResponse } from "@/app/api/zwift/fitness-trends/route";

// TSB axis range — values outside are clamped to the chart edges
const TSB_TOP = -28;    // most overreaching (top of chart)
const TSB_BOTTOM = 18;  // most detraining (bottom of chart)
const TSB_SPAN = TSB_BOTTOM - TSB_TOP; // 46

// Zone bands — each covers from `tsb` down to the next zone's `tsb`
// Listed top-to-bottom (most negative TSB first)
const ZONES = [
  { label: "OVERREACHING", color: "rgba(230,90,20,0.85)",  tsb: TSB_TOP },
  { label: "PRODUCTIVE",   color: "rgba(30,160,70,0.85)",  tsb: -20 },
  { label: "FRESH",        color: "rgba(47,143,224,0.82)", tsb: -5 },
  { label: "DETRAINING",   color: "rgba(120,120,130,0.75)",tsb: 10 },
] as const;

const STATUS_COLORS: Record<string, string> = {
  overreaching: "#e65a14",
  productive:   "#1ea046",
  fresh:        "#2f8fe0",
  detraining:   "#787882",
};

const STATUS_LABELS: Record<string, string> = {
  overreaching: "Overreaching",
  productive:   "Productive",
  fresh:        "Fresh",
  detraining:   "Detraining",
};

/** Map a TSB value to a Y pixel position in the chart (clamped) */
function tsbToY(tsb: number, chartH: number): number {
  const clamped = Math.max(TSB_TOP, Math.min(TSB_BOTTOM, tsb));
  return ((clamped - TSB_TOP) / TSB_SPAN) * chartH;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function FitnessTrendsChart() {
  const [data, setData] = useState<FitnessTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zwift/fitness-trends")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
        Computing fitness trends…
      </div>
    );
  }

  if (!data?.ok || !data.points?.length) return null;

  const points = data.points;
  const current = data.current;

  const W = 700;
  const H = 200;
  const PAD_LEFT = 96;  // space for zone labels
  const PAD_RIGHT = 12;
  const PAD_TOP = 8;
  const PAD_BOTTOM = 28; // space for date labels

  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  // Build SVG path for the TSB trend line
  const xFor = (i: number) => PAD_LEFT + (i / (points.length - 1)) * chartW;
  const yFor = (tsb: number) => PAD_TOP + tsbToY(tsb, chartH);

  let linePath = "";
  for (let i = 0; i < points.length; i++) {
    const x = xFor(i).toFixed(1);
    const y = yFor(points[i].tsb).toFixed(1);
    linePath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  // Build a filled area path (line + back to bottom)
  const areaPath = linePath
    + ` L ${xFor(points.length - 1).toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)}`
    + ` L ${PAD_LEFT.toFixed(1)} ${(PAD_TOP + chartH).toFixed(1)} Z`;

  // X-axis date ticks: ~4 evenly spaced
  const tickCount = 4;
  const tickIndices = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / (tickCount - 1)) * (points.length - 1))
  );

  // Zone band rects
  const zoneBands = ZONES.map((z, idx) => {
    const yTop = PAD_TOP + tsbToY(z.tsb, chartH);
    const nextTsb = idx < ZONES.length - 1 ? ZONES[idx + 1].tsb : TSB_BOTTOM;
    const yBottom = PAD_TOP + tsbToY(nextTsb, chartH);
    return { ...z, yTop, yHeight: yBottom - yTop };
  });

  const statusKey = current?.status ?? "fresh";
  const statusColor = STATUS_COLORS[statusKey];
  const statusLabel = STATUS_LABELS[statusKey];

  return (
    <div>
      {/* Current status header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <span style={{
          fontSize: 28, fontWeight: 900, letterSpacing: "-0.5px",
          color: statusColor, lineHeight: 1,
        }}>
          {statusLabel}
        </span>
        {current && (
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            CTL {current.ctl} · ATL {current.atl} · TSB {current.tsb > 0 ? "+" : ""}{current.tsb}
          </span>
        )}
      </div>

      {/* SVG chart */}
      <div style={{ borderRadius: 10, overflow: "hidden" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block" }}
          aria-label="Fitness trends chart showing training status zones over 90 days"
        >
          {/* Zone bands */}
          {zoneBands.map(z => (
            <g key={z.label}>
              <rect
                x={PAD_LEFT}
                y={z.yTop}
                width={chartW}
                height={z.yHeight}
                fill={z.color}
              />
              {/* Zone label on left */}
              <text
                x={PAD_LEFT - 6}
                y={z.yTop + z.yHeight / 2 + 4}
                textAnchor="end"
                fontSize="9"
                fontWeight="700"
                letterSpacing="0.04em"
                fill="var(--text)"
                opacity="0.7"
              >
                {z.label}
              </text>
            </g>
          ))}

          {/* Subtle grid line at TSB = 0 */}
          <line
            x1={PAD_LEFT} y1={PAD_TOP + tsbToY(0, chartH)}
            x2={PAD_LEFT + chartW} y2={PAD_TOP + tsbToY(0, chartH)}
            stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 4"
          />

          {/* Area fill under the line */}
          <path
            d={areaPath}
            fill="rgba(255,255,255,0.08)"
          />

          {/* Trend line */}
          <path
            d={linePath}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Current day dot */}
          <circle
            cx={xFor(points.length - 1)}
            cy={yFor(points[points.length - 1].tsb)}
            r={4}
            fill="#ffffff"
            stroke={statusColor}
            strokeWidth="2"
          />

          {/* X-axis date labels */}
          {tickIndices.map((idx, ti) => (
            <text
              key={ti}
              x={xFor(idx)}
              y={H - 6}
              textAnchor={ti === 0 ? "start" : ti === tickIndices.length - 1 ? "end" : "middle"}
              fontSize="10"
              fill="var(--muted)"
              opacity="0.75"
            >
              {shortDate(points[idx].date)}
            </text>
          ))}
        </svg>
      </div>

      {/* Footer: explanation */}
      <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.6, marginTop: 6 }}>
        CTL = fitness (42-day load) · ATL = fatigue (7-day load) · TSB = CTL − ATL
      </div>
    </div>
  );
}
