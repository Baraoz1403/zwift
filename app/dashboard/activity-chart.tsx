"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { selectChartActivities, type ChartExtra } from "@/lib/stats";
import { IconTrend } from "./icons";

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit: string;
  values: (number | null)[];
}

function shortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
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
    if (v == null) { drawing = false; continue; }
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

function BikeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 17.5H9l-1.5-3 3.5-6.5h4.5l1.5 3-4.5 1.5 1 5"/>
      <circle cx="14.5" cy="6" r="1.5"/>
    </svg>
  );
}

function RunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="1.5"/>
      <path d="M8.5 21.5l2-6.5 2.5 3 2.5-7"/>
      <path d="M6.5 12.5l3.5-4 3 2.5 4-1.5"/>
    </svg>
  );
}

const TIME_WINDOWS = ["W", "M", "Y", "ALL"] as const;
type TimeWindow = (typeof TIME_WINDOWS)[number];

const WINDOW_MS: Record<TimeWindow, number | null> = {
  W: 7 * 86400 * 1000,
  M: 30 * 86400 * 1000,
  Y: 365 * 86400 * 1000,
  ALL: null,
};

const WINDOW_EXTRAS_COUNT: Record<TimeWindow, number> = {
  W: 30,
  M: 30,
  Y: 90,
  ALL: 120,
};

function getWindowStart(w: TimeWindow): Date | null {
  const ms = WINDOW_MS[w];
  return ms ? new Date(Date.now() - ms) : null;
}

/** SVG chart only — legend and controls live in the parent. */
function TrendChartSVG({
  series,
  labels,
  visible,
}: {
  series: TrendSeries[];
  labels: string[];
  visible: Record<string, boolean>;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 700;
  const height = 210;
  const padding = 26;
  const leftPad = 46;
  const n = labels.length;

  if (n === 0) return <div className="notice">Not enough ride data yet.</div>;

  const xFor = (i: number) =>
    n === 1 ? width / 2 : leftPad + (i / (n - 1)) * (width - leftPad - padding);
  const tickIdx = Array.from(
    new Set([0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1])
  );
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
  const tooltipX = Math.min(Math.max(hoverX + 8, leftPad), width - padding - tooltipWidth);
  const visibleStats = hoverIdx != null ? stats.filter((st) => visible[st.s.key] && st.hasData) : [];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", cursor: "crosshair" }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = height - padding - f * (height - padding * 2);
        return (
          <g key={f}>
            <line x1={leftPad} y1={y} x2={width - padding} y2={y} stroke="rgba(20,23,26,0.08)" />
            <text x={leftPad - 5} y={y + 3.5} fill="rgba(20,23,26,0.35)" fontSize="9" textAnchor="end">
              {f === 0 ? "min" : f === 1 ? "max" : `${Math.round(f * 100)}%`}
            </text>
          </g>
        );
      })}

      {stats.map(({ s, path }) =>
        visible[s.key] && path ? (
          <path key={s.key} d={path} fill="none" stroke={s.color} strokeWidth={1.5} />
        ) : null
      )}

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

      {hoverIdx != null && (
        <>
          <line
            x1={xFor(hoverIdx)} y1={padding - 4}
            x2={xFor(hoverIdx)} y2={height - padding}
            stroke="rgba(20,23,26,0.3)" strokeWidth={1}
          />
          {visibleStats.map(({ s, min, max }) => {
            const v = s.values[hoverIdx];
            if (v == null) return null;
            return (
              <circle
                key={s.key}
                cx={xFor(hoverIdx)} cy={yFor(v, min, max, height, padding)}
                r={3.5} fill={s.color} stroke="#ffffff" strokeWidth={1.5}
              />
            );
          })}
          <g transform={`translate(${tooltipX}, ${padding - 4})`}>
            <rect
              width={tooltipWidth}
              height={16 + Math.max(visibleStats.length, 1) * 15}
              rx={6}
              fill="rgba(13,17,23,0.92)"
              stroke="rgba(255,255,255,0.12)"
            />
            <text x={8} y={13} fill="rgba(255,255,255,0.7)" fontSize="10.5">
              {labels[hoverIdx]}
            </text>
            {visibleStats.length === 0 ? (
              <text x={8} y={28} fill="rgba(255,255,255,0.5)" fontSize="10.5">no series selected</text>
            ) : (
              visibleStats.map(({ s }, idx) => {
                const v = s.values[hoverIdx];
                return (
                  <g key={s.key}>
                    <circle cx={12} cy={29 + idx * 15 - 4} r={3} fill={s.color} />
                    <text x={20} y={29 + idx * 15} fill="#ffffff" fontSize="10.5">
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
  );
}

export default function ActivityCharts({
  activities,
  extras,
}: {
  activities: ZwiftActivity[];
  extras?: ChartExtra[];
}) {
  // All activities sorted oldest→newest (no count cap — date filter applied below)
  const allSorted = useMemo(() => selectChartActivities(activities, 10000), [activities]);

  // Map each activity object → its index in allSorted (for extras alignment by position)
  const allSortedIdxMap = useMemo(() => {
    const m = new Map<ZwiftActivity, number>();
    allSorted.forEach((a, i) => m.set(a, i));
    return m;
  }, [allSorted]);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>("M");

  // Date-filtered slice (before sport filter)
  const sortedByDate = useMemo(() => {
    const start = getWindowStart(timeWindow);
    if (!start) return allSorted;
    return allSorted.filter((a) => a.startDate && new Date(a.startDate) >= start);
  }, [allSorted, timeWindow]);

  // Extras cache keyed by count, seeded with SSR-provided 30-ride data
  const [extrasByCount, setExtrasByCount] = useState<Record<number, ChartExtra[]>>(
    () => (extras ? { 30: extras } : {}) as Record<number, ChartExtra[]>
  );
  const [loadingCount, setLoadingCount] = useState<number | null>(null);

  const extrasCount = WINDOW_EXTRAS_COUNT[timeWindow];

  useEffect(() => {
    if (extrasByCount[extrasCount] || loadingCount === extrasCount) return;
    let cancelled = false;
    setLoadingCount(extrasCount);
    fetch(`/api/zwift/chart-extras?count=${extrasCount}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.ok) return;
        setExtrasByCount((prev) => ({ ...prev, [extrasCount]: data.extras }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCount(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasCount]);

  const activeExtras = extrasByCount[extrasCount];
  const extrasLoading = loadingCount === extrasCount && !activeExtras;

  // Sport filter — derived from ALL activities so buttons always show.
  // Activities with a null/undefined sport are treated as CYCLING (Zwift's
  // default — the game client sometimes omits the field on older rides).
  const normSport = (a: ZwiftActivity) => (a.sport as string) || "CYCLING";

  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const a of allSorted) set.add(normSport(a));
    return Array.from(set);
  }, [allSorted]);

  const [sportFilter, setSportFilter] = useState<string>("all");

  const filtered = useMemo(
    () => sortedByDate.filter((a) => sportFilter === "all" || normSport(a) === sportFilter),
    [sortedByDate, sportFilter]
  );

  // Align extras to filtered activities by index position in allSorted
  const extrasBase = allSorted.length - extrasCount;
  const getExtras = (a: ZwiftActivity): ChartExtra | null => {
    if (!activeExtras) return null;
    const allIdx = allSortedIdxMap.get(a);
    if (allIdx == null) return null;
    const extIdx = allIdx - extrasBase;
    if (extIdx < 0 || extIdx >= activeExtras.length) return null;
    return activeExtras[extIdx] ?? null;
  };

  const dateLabels = filtered.map((a) => shortDate(a.startDate));
  const distances = filtered.map((a) => (a.distanceInMeters != null ? a.distanceInMeters / 1000 : null));
  const power = filtered.map((a) => a.avgWatts ?? null);
  const avgHeartRate = filtered.map((a) => getExtras(a)?.avgHeartRate ?? null);
  const avgCadence = filtered.map((a) => getExtras(a)?.avgCadence ?? null);

  const series: TrendSeries[] = [
    { key: "distance",  label: "Distance", color: "#2f8fe0", unit: "km",  values: distances },
    { key: "power",     label: "Power",    color: "#f07020", unit: "W",   values: power },
    { key: "heartRate", label: "HR",       color: "#ff4d6d", unit: "bpm", values: avgHeartRate },
    { key: "cadence",   label: "Cadence",  color: "#1a9e52", unit: "rpm", values: avgCadence },
  ];

  // Per-series stats for the legend cards
  const seriesStats = series.map((s) => {
    const nums = s.values.filter((v): v is number => v != null);
    return {
      avg: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
      max: nums.length ? Math.max(...nums) : 0,
      hasData: nums.length > 0,
    };
  });

  // Visibility state (lifted here so legend cards can toggle it)
  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(series.map((s) => [s.key, true]))
  );

  if (allSorted.length === 0) {
    return <div className="notice">Not enough ride data yet to draw graphs.</div>;
  }

  return (
    <div>
      {/* Title */}
      <div className="section-title" style={{ margin: "0 0 14px 0" }}>
        <IconTrend size={14} />
        Performance trends
      </div>

      <div className="stat-card" style={{ padding: "16px 20px" }}>

      {/* Controls row — sport filter + series toggles + time window, all in one line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8, marginBottom: 12 }}>

        {/* Left: sport filter */}
        <div>
          {sports.length > 1 && (
            <div className="trend-tabs">
              <button type="button" className={`trend-tab ${sportFilter === "all" ? "active" : ""}`} onClick={() => setSportFilter("all")}>All</button>
              {sports.map((s) => (
                <button key={s} type="button" className={`trend-tab ${sportFilter === s ? "active" : ""}`} onClick={() => setSportFilter(s)} style={{ display: "flex", alignItems: "center", gap: 4 }} title={s}>
                  {s === "CYCLING" ? <BikeIcon size={14} /> : <RunIcon size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Centre: series toggles as compact pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {series.map((s, i) => {
            const { avg, hasData } = seriesStats[i];
            const on = visible[s.key];
            return (
              <button
                key={s.key}
                type="button"
                disabled={!hasData}
                onClick={() => setVisible((v) => ({ ...v, [s.key]: !v[s.key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 9px",
                  borderRadius: 6,
                  border: `1px solid var(--border)`,
                  background: on ? "var(--panel)" : "transparent",
                  cursor: hasData ? "pointer" : "default",
                  opacity: hasData ? (on ? 1 : 0.38) : 0.22,
                  transition: "opacity 0.15s, background 0.15s",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap" as const,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>
                  {s.label}
                  {hasData && (
                    <span style={{ fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>
                      · {Math.round(avg)} {s.unit}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: time window */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {extrasLoading && <span style={{ fontSize: 11, color: "var(--muted)" }}>loading…</span>}
          <div className="trend-tabs">
            {TIME_WINDOWS.map((w) => (
              <button key={w} type="button" className={`trend-tab ${timeWindow === w ? "active" : ""}`} onClick={() => setTimeWindow(w)}>{w}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      {filtered.length === 0 ? (
        <div className="notice">No rides for this filter yet.</div>
      ) : (
        <TrendChartSVG series={series} labels={dateLabels} visible={visible} />
      )}

      </div>{/* end stat-card */}
    </div>
  );
}
