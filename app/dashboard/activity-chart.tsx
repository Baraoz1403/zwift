"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { selectChartActivities, type ChartExtra } from "@/lib/stats";

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  /** One entry per ride, aligned with `labels` below. null = no data for that ride. */
  values: (number | null)[];
}

function shortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // Fixed locale, day+month only - see personal-records.tsx's formatDate
  // comment for why a fixed locale matters here (server/client hydration).
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" });
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
 * One combined, interactive chart for all of the per-ride trend metrics
 * (distance, power, heart rate, cadence) instead of four separate stacked
 * graphs. Each series is normalized to its own min/max so very different
 * units (km vs W vs bpm vs rpm) can share one chart - the legend pills under
 * the chart show each series' real numbers and can be clicked to show/hide
 * that line, same interaction as the per-ride detail chart elsewhere in the
 * app. Hovering anywhere shows the date and every visible value at that
 * point in one shared tooltip.
 */
function CombinedTrendChart({ series, labels }: { series: TrendSeries[]; labels: string[] }) {
  // All series default to visible (same as the per-ride detail page's
  // combined chart) - previously only the first two (distance/power) were
  // on by default, so heart rate and especially cadence looked "missing"
  // until the user noticed they had to click their legend pill.
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(series.map((s) => [s.key, true]))
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 700;
  const height = 240;
  const padding = 34;
  const n = labels.length;

  if (n === 0) {
    return <div className="notice">Not enough ride data yet to draw graphs.</div>;
  }

  const xFor = (i: number) => (n === 1 ? width / 2 : padding + (i / (n - 1)) * (width - padding * 2));
  const tickIdx = Array.from(new Set([0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1]));

  const stats = series.map((s) => ({ s, ...buildPath(s.values, xFor, height, padding) }));

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(Math.max(relX, padding), width - padding);
    const idx = n === 1 ? 0 : Math.round(((clamped - padding) / (width - padding * 2)) * (n - 1));
    setHoverIdx(Math.min(Math.max(idx, 0), n - 1));
  }

  const tooltipWidth = 158;
  const hoverX = hoverIdx != null ? xFor(hoverIdx) : 0;
  const tooltipX = Math.min(Math.max(hoverX + 8, padding), width - padding - tooltipWidth);
  const visibleStatsAtHover = hoverIdx != null ? stats.filter((st) => visible[st.s.key] && st.hasData) : [];

  return (
    <div>
      <div className="trend-legend">
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
                // Border now always matches the plain .select frame used by
                // the Rides filters below (same border-color/width for every
                // pill) - per explicit request to make the two consistent.
                // On/off state is still visible through opacity alone.
                opacity: hasData ? (on ? 1 : 0.45) : 0.35,
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
                {hasData ? `${s.label} · avg ${Math.round(avg)} / max ${Math.round(max)} ${s.unit}` : `${s.label}: n/a`}
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
        {/* Gridlines mark 0/25/50/75/100% of each visible series' own range
            (the series don't share one absolute scale) - just enough
            structure to read the shape of each line. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = height - padding - f * (height - padding * 2);
          return <line key={f} x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(20,23,26,0.08)" />;
        })}

        {stats.map(({ s, path }) => {
          if (!visible[s.key] || !path) return null;
          return <path key={s.key} d={path} fill="none" stroke={s.color} strokeWidth={1.6} />;
        })}

        {stats.map(({ s, hasData, min, max }) =>
          visible[s.key] && hasData && n <= 40
            ? s.values.map((v, i) =>
                v == null ? null : (
                  <circle
                    key={`${s.key}-${i}`}
                    cx={xFor(i)}
                    cy={yFor(v, min, max, height, padding)}
                    r={2}
                    fill={s.color}
                  />
                )
              )
            : null
        )}

        {tickIdx.map((i, idx) => (
          <text
            key={idx}
            x={Math.min(Math.max(xFor(i), padding + 16), width - padding - 16)}
            y={height - 10}
            fill="rgba(20,23,26,0.45)"
            fontSize="10.5"
            textAnchor={idx === 0 ? "start" : idx === tickIdx.length - 1 ? "end" : "middle"}
          >
            {labels[i]}
          </text>
        ))}

        {/* Hover crosshair: a vertical guide line, a dot on every visible
            series at that exact ride, and a small box with the real
            numbers for that ride. */}
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
                  r={3.5}
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
                {labels[hoverIdx]}
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
                        {v != null ? `${s.label}: ${Math.round(v)} ${s.unit}` : `${s.label}: —`}
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

export default function ActivityCharts({
  activities,
  extras,
}: {
  activities: ZwiftActivity[];
  /**
   * Average heart rate/cadence per ride, aligned 1:1 with
   * selectChartActivities(activities, 30) - the chart's *default* window.
   * Downloading + parsing a FIT file per ride is the most expensive thing
   * this app does, so the dashboard page only does this for the default
   * 30-ride window up front. If the user picks a bigger window (60/90/120)
   * below, this component fetches just that extra data lazily from
   * /api/zwift/chart-extras instead of forcing every dashboard load (and
   * every "back to dashboard" navigation) to pay for downloading 120 FIT
   * files. Optional because it requires a FIT download per ride; the
   * distance/power lines work fine without it.
   */
  extras?: ChartExtra[];
}) {
  // Oldest -> newest, last 120 rides - the largest option the ride-count
  // selector below offers. This is cheap (just sorting/slicing data already
  // sent to the client) - only the HR/cadence *extras* are expensive, and
  // those are handled separately below.
  const fullSorted = selectChartActivities(activities, 120);

  const RIDE_COUNT_OPTIONS = [30, 60, 90, 120];
  const [rideCount, setRideCount] = useState<number>(30);

  // Cache of FIT extras already fetched, keyed by ride count. Starts with
  // whatever the server pre-fetched for the default 30-ride window so
  // picking "30" never needs a network round trip.
  const [extrasByCount, setExtrasByCount] = useState<Record<number, ChartExtra[]>>(() =>
    (extras ? { 30: extras } : {}) as Record<number, ChartExtra[]>
  );
  const [loadingCount, setLoadingCount] = useState<number | null>(null);

  useEffect(() => {
    if (extrasByCount[rideCount] || loadingCount === rideCount) return;
    let cancelled = false;
    setLoadingCount(rideCount);
    fetch(`/api/zwift/chart-extras?count=${rideCount}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setExtrasByCount((prev) => ({ ...prev, [rideCount]: data.extras }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCount(null);
      });
    return () => {
      cancelled = true;
    };
    // extrasByCount intentionally excluded - it changes every time a fetch
    // resolves, which would otherwise needlessly re-run/cancel this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideCount]);

  // The actual window the chart draws from: just the last `rideCount` of
  // the fixed 120-ride universe above. The matching extras (if loaded) are
  // already computed for exactly this same window, so they line up 1:1.
  const sorted = useMemo(() => fullSorted.slice(-rideCount), [fullSorted, rideCount]);
  const activeExtras = extrasByCount[rideCount];
  const trimmedExtras = useMemo(
    () => (activeExtras ? activeExtras.slice(-rideCount) : undefined),
    [activeExtras, rideCount]
  );
  const extrasLoading = loadingCount === rideCount && !activeExtras;

  // Cycling and walking/running activities don't share the same metrics
  // (power/cadence is meaningless for a walk, pace and distance are on a
  // totally different scale) - mixing them into one chart makes the lines
  // unreadable. Offer a simple sport filter, but only when there's actually
  // more than one sport in the data, so it doesn't show up as clutter for
  // a cycling-only account.
  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const a of sorted) if (a.sport) set.add(a.sport);
    return Array.from(set);
  }, [sorted]);

  const [sportFilter, setSportFilter] = useState<string>("all");

  // The chart now draws every ride in the chosen window (30/60/90/120,
  // optionally narrowed by sport) directly - no more 5-at-a-time paging,
  // since the ride-count selector above already controls how much is shown.
  const keepIdx = useMemo(
    () => sorted.map((_, i) => i).filter((i) => sportFilter === "all" || sorted[i].sport === sportFilter),
    [sorted, sportFilter]
  );

  const filtered = keepIdx.map((i) => sorted[i]);
  const dateLabels = filtered.map((a) => shortDate(a.startDate));

  const distances: (number | null)[] = filtered.map((a) =>
    a.distanceInMeters != null ? a.distanceInMeters / 1000 : null
  );
  const power: (number | null)[] = filtered.map((a) => a.avgWatts ?? null);
  const avgHeartRate: (number | null)[] = keepIdx.map((i) => trimmedExtras?.[i]?.avgHeartRate ?? null);
  const avgCadence: (number | null)[] = keepIdx.map((i) => trimmedExtras?.[i]?.avgCadence ?? null);

  if (sorted.length === 0) {
    return <div className="notice">Not enough ride data yet to draw graphs.</div>;
  }

  const series: TrendSeries[] = [
    { key: "distance", label: "Distance", color: "#2f8fe0", unit: "km", values: distances },
    { key: "power", label: "Avg power", color: "#f07020", unit: "W", values: power },
    { key: "heartRate", label: "Avg heart rate", color: "#ff4d6d", unit: "bpm", values: avgHeartRate },
    { key: "cadence", label: "Avg cadence", color: "#1a9e52", unit: "rpm", values: avgCadence },
  ];

  return (
    <div>
      {/* Both selectors share one row - ride-count on the left, sport filter
          on the right - so the two controls read as one toolbar instead of
          two stacked, unrelated rows. Wraps gracefully on narrow screens. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", overflowX: "auto" }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, flexShrink: 0 }}>Last</span>
          <div className="trend-tabs" style={{ flexShrink: 0 }}>
            {RIDE_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`trend-tab ${rideCount === n ? "active" : ""}`}
                onClick={() => setRideCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0 }}>rides</span>
          {extrasLoading && (
            <span style={{ fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>
              loading heart rate/cadence…
            </span>
          )}
        </div>

        {sports.length > 1 && (
          <div className="trend-tabs">
            <button
              type="button"
              className={`trend-tab ${sportFilter === "all" ? "active" : ""}`}
              onClick={() => setSportFilter("all")}
            >
              All
            </button>
            {sports.map((s) => (
              <button
                key={s}
                type="button"
                className={`trend-tab ${sportFilter === s ? "active" : ""}`}
                onClick={() => setSportFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="notice">No rides for this sport yet.</div>
      ) : (
        <CombinedTrendChart series={series} labels={dateLabels} />
      )}
    </div>
  );
}
