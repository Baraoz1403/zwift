"use client";

import { useRef, useState, type MouseEvent } from "react";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  // One entry per sample, aligned by index with every other series and with
  // `elapsedMs` - null means "no reading at this instant" (e.g. a dropped
  // heart-rate-strap signal), not zero, and leaves a gap in the line instead
  // of a misleading dip to the bottom of the chart.
  values: (number | null)[];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function buildPath(
  values: (number | null)[],
  xFor: (i: number) => number,
  height: number,
  padding: number
): { path: string; min: number; max: number; avg: number; hasData: boolean } {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return { path: "", min: 0, max: 0, avg: 0, hasData: false };
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums);
  const avg = nums.reduce((s, v) => s + v, 0) / nums.length;
  const range = max - min || 1;

  let path = "";
  let drawing = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      drawing = false;
      continue;
    }
    const x = xFor(i);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    path += `${drawing ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    drawing = true;
  }
  return { path: path.trim(), min, max, avg, hasData: true };
}

function yFor(v: number, min: number, max: number, height: number, padding: number): number {
  const range = max - min || 1;
  return height - padding - ((v - min) / range) * (height - padding * 2);
}

/**
 * A filled silhouette path for the ride's elevation profile, anchored to the
 * chart's bottom edge - the same "course profile in the background" look
 * Zwift's own ride screen shows. Uses its own min/max (elevation is on a
 * totally different scale than bpm/W/rpm) and is purely decorative context,
 * not one of the toggleable data series.
 */
function buildAreaPath(
  values: (number | null)[],
  xFor: (i: number) => number,
  height: number,
  padding: number
): string {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;

  let top = "";
  let first = true;
  let lastI = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const x = xFor(i);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    top += `${first ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)} `;
    first = false;
    lastI = i;
  }
  if (first || lastI < 0) return "";
  const baseline = (height - padding).toFixed(1);
  return `${top.trim()} L ${xFor(lastI).toFixed(1)} ${baseline} L ${xFor(0).toFixed(1)} ${baseline} Z`;
}

/** Index of the elapsedMs entry closest to `target` (binary search - elapsedMs is non-decreasing). */
function nearestIndex(elapsedMs: number[], target: number): number {
  let lo = 0;
  let hi = elapsedMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (elapsedMs[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(elapsedMs[lo - 1] - target) <= Math.abs(elapsedMs[lo] - target)) return lo - 1;
  return lo;
}

/**
 * One combined chart for several in-ride telemetry series (heart rate,
 * cadence, power, ...) that share the same x-axis (elapsed ride time) but
 * have very different units and ranges (bpm vs rpm vs W). Each series is
 * normalized to its own min/max for its y position - the only way to
 * overlay them usefully on one shared chart without a separate axis per
 * series - while the legend underneath shows each series' real min/max
 * numbers. Click a legend pill to show/hide that series, same idea as the
 * Zwift Companion app's ride-detail graph.
 */
export default function MultiLineChart({
  series,
  elapsedMs,
  elevationM,
}: {
  series: ChartSeries[];
  elapsedMs: number[];
  /** Optional course-elevation silhouette drawn behind the data lines, same index alignment as elapsedMs. */
  elevationM?: (number | null)[];
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(series.map((s) => [s.key, true]))
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 700;
  const height = 220;
  const padding = 32;
  const n = elapsedMs.length;

  if (n === 0) {
    return <div className="notice">Not enough ride data to draw this chart.</div>;
  }

  const totalMs = elapsedMs[n - 1] || 1;
  const xFor = (i: number) =>
    n === 1 ? width / 2 : padding + (elapsedMs[i] / totalMs) * (width - padding * 2);

  const tickIdx = Array.from(new Set([0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1]));

  const stats = series.map((s) => ({ s, ...buildPath(s.values, xFor, height, padding) }));
  const elevationArea = elevationM ? buildAreaPath(elevationM, xFor, height, padding) : "";

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map the mouse's pixel position back into the SVG's own 0..width
    // coordinate space (the element is scaled to 100% width on screen, so
    // pixel position and viewBox units aren't the same).
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(Math.max(relX, padding), width - padding);
    const targetMs = ((clamped - padding) / (width - padding * 2)) * totalMs;
    setHoverIdx(nearestIndex(elapsedMs, targetMs));
  }

  // Tooltip box position: follows the hovered x, but clamped so it never
  // runs off either edge of the chart.
  const tooltipWidth = 142;
  const hoverX = hoverIdx != null ? xFor(hoverIdx) : 0;
  const tooltipX = Math.min(Math.max(hoverX + 8, padding), width - padding - tooltipWidth);
  const visibleStatsAtHover = hoverIdx != null ? stats.filter((st) => visible[st.s.key]) : [];

  return (
    <div>
      <div className="trend-legend" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)`, margin: "0 14px 12px" }}>
        {stats.map(({ s, avg, max, hasData }) => {
          const on = visible[s.key];
          return (
            <button
              key={s.key}
              type="button"
              disabled={!hasData}
              onClick={() => setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))}
              className="select trend-legend-btn"
              style={{
                cursor: hasData ? "pointer" : "default",
                opacity: hasData ? (on ? 1 : 0.45) : 0.35,
                borderColor: on && hasData ? "var(--accent-2)" : "var(--border)",
                borderWidth: on && hasData ? 1.5 : 1,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: s.color,
                  display: "inline-block",
                  flex: "none",
                }}
              />
              <span className="trend-legend-text">
                {hasData
                  ? `${s.label}: avg ${Math.round(avg)} · max ${Math.round(max)} ${s.unit}`
                  : `${s.label}: n/a`}
              </span>
            </button>
          );
        })}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", cursor: "crosshair" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* White SVG background */}
        <rect width={width} height={height} fill="#ffffff" />

        {/* Course elevation profile, drawn first so it sits behind
            everything else - same "faint hill silhouette" look Zwift's own
            ride screen shows. Purely decorative context, not a data line. */}
        {elevationArea && <path d={elevationArea} fill="rgba(20,23,26,0.07)" stroke="none" />}

        {/* Gridlines mark 0/25/50/75/100% of each visible series' own
            range (not one shared absolute number - the series don't share
            a scale), just enough structure to read the shape of the line. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = height - padding - f * (height - padding * 2);
          return (
            <line
              key={f}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="rgba(20,23,26,0.08)"
            />
          );
        })}

        {stats.map(({ s, path }) => {
          if (!visible[s.key] || !path) return null;
          return <path key={s.key} d={path} fill="none" stroke={s.color} strokeWidth={0.5} />;
        })}

        {tickIdx.map((i, idx) => (
          <text
            key={idx}
            x={Math.min(Math.max(xFor(i), padding + 14), width - padding - 14)}
            y={height - 8}
            fill="rgba(20,23,26,0.45)"
            fontSize="10.5"
            textAnchor={idx === 0 ? "start" : idx === tickIdx.length - 1 ? "end" : "middle"}
          >
            {formatElapsed(elapsedMs[i])}
          </text>
        ))}

        {/* Hover crosshair: a vertical guide line, a dot on every visible
            series at that exact instant, and a small box with the real
            numbers at that point in the ride. */}
        {hoverIdx != null && (
          <>
            <line
              x1={xFor(hoverIdx)}
              y1={padding - 4}
              x2={xFor(hoverIdx)}
              y2={height - padding}
              stroke="rgba(20,23,26,0.3)"
              strokeWidth={1}
            />
            {visibleStatsAtHover.map(({ s, min, max }) => {
              const v = s.values[hoverIdx];
              if (v == null) return null;
              return (
                <circle
                  key={s.key}
                  cx={xFor(hoverIdx)}
                  cy={yFor(v, min, max, height, padding)}
                  r={3}
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              );
            })}

            <g transform={`translate(${tooltipX}, ${padding - 4})`}>
              <rect
                width={tooltipWidth}
                height={16 + Math.max(visibleStatsAtHover.length, 1) * 15}
                rx={6}
                fill="rgba(13,17,23,0.92)"
                stroke="rgba(255,255,255,0.12)"
              />
              <text x={8} y={13} fill="rgba(255,255,255,0.7)" fontSize="10.5">
                {formatElapsed(elapsedMs[hoverIdx])}
              </text>
              {visibleStatsAtHover.length === 0 ? (
                <text x={8} y={28} fill="rgba(255,255,255,0.5)" fontSize="10.5">
                  no series selected
                </text>
              ) : (
                visibleStatsAtHover.map(({ s }, idx) => {
                  const v = s.values[hoverIdx];
                  const y = 29 + idx * 15;
                  return (
                    <g key={s.key}>
                      <circle cx={12} cy={y - 4} r={3} fill={s.color} />
                      <text x={20} y={y} fill="#ffffff" fontSize="10.5" fontWeight={400}>
                        {s.label}: {v != null ? `${Math.round(v)} ${s.unit}` : "—"}
                      </text>
                    </g>
                  );
                })
              )}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
