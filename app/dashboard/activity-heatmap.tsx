"use client";

import { useState } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { buildHeatmap } from "@/lib/stats";
import { IconCalendar } from "./icons";

const PERIODS = [
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
] as const;

function formatDuration(ms: number): string {
  if (!ms) return "0m";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * GitHub-contributions-style heatmap: one cell per day for the last ~26
 * weeks, color intensity scaled to that day's ride distance relative to
 * the rider's own biggest day in the window (so it adapts to anyone's
 * typical ride length instead of a fixed km threshold).
 */
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ActivityHeatmap({ activities }: { activities: ZwiftActivity[] }) {
  const [periodIdx, setPeriodIdx] = useState(2); // default: 1 year
  const period = PERIODS[periodIdx];

  const days = buildHeatmap(activities, period.days);
  const maxDistance = Math.max(1, ...days.map((d) => d.distanceM));

  // Pad the front so column 1 / row 1 lines up with a real Sunday.
  const firstWeekday = new Date(days[0].date + "T00:00:00Z").getUTCDay();
  const padded: (typeof days)[number][] = [
    ...Array.from({ length: firstWeekday }, () => null as unknown as (typeof days)[number]),
    ...days,
  ];

  const activeDays = days.filter((d) => d.rides > 0).length;

  // Group into weeks (columns) so we can drop a month label above the first
  // week that contains the 1st-7th of a new month - without this, the grid
  // is just an unlabeled wall of colored squares with no sense of "when".
  const weeks: (typeof days)[number][][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  let lastMonth = -1;
  const monthLabelByWeek = new Map<number, string>();
  weeks.forEach((week, weekIdx) => {
    const firstReal = week.find((d) => d != null);
    if (!firstReal) return;
    const d = new Date(firstReal.date + "T00:00:00Z");
    const month = d.getUTCMonth();
    if (month !== lastMonth && d.getUTCDate() <= 7) {
      monthLabelByWeek.set(weekIdx, d.toLocaleDateString("en-GB", { month: "short" }));
      lastMonth = month;
    }
  });

  return (
    <div>
      <div className="section-title" style={{ justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconCalendar size={16} />
          Ride activity
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--muted)", textTransform: "none", letterSpacing: "normal" }}>
            {activeDays} active day{activeDays === 1 ? "" : "s"} in the last {period.label}
          </span>
          <div className="trend-tabs" style={{ marginBottom: 0 }}>
            {PERIODS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                className={`trend-tab ${i === periodIdx ? "active" : ""}`}
                onClick={() => setPeriodIdx(i)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-wrap">
        <div style={{ display: "flex" }}>
          {/* LEFT sticky day labels */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            paddingRight: 6, marginTop: 21,
            position: "sticky", left: 0, zIndex: 2,
            background: "var(--bg)",
          }}>
            {DAY_LABELS.map((label, i) => (
              <div key={label} style={{ width: 28, height: 17, fontSize: 10.5, color: "var(--muted)", lineHeight: "17px" }}>
                {i % 2 === 1 ? label : ""}
              </div>
            ))}
          </div>

          {/* Grid: month labels + cells */}
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              {weeks.map((_, weekIdx) => (
                <div
                  key={weekIdx}
                  style={{ width: 17, flex: "none", fontSize: 10.5, color: "var(--muted)" }}
                >
                  {monthLabelByWeek.get(weekIdx) ?? ""}
                </div>
              ))}
            </div>

            <div className="heatmap-grid">
              {padded.map((d, i) => {
                if (!d) return <div key={`pad-${i}`} className="heatmap-cell" style={{ opacity: 0 }} />;
                const level =
                  d.distanceM <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((d.distanceM / maxDistance) * 4)));
                const title =
                  d.rides > 0
                    ? `${d.date} • ${(d.distanceM / 1000).toFixed(1)} km • ${formatDuration(d.movingTimeMs)} • ${d.rides} ride${d.rides > 1 ? "s" : ""}`
                    : `${d.date} • rest day`;
                return <div key={d.date} className={`heatmap-cell lvl-${level}`} title={title} />;
              })}
            </div>
          </div>

          {/* RIGHT sticky day labels */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            paddingLeft: 6, marginTop: 21,
            position: "sticky", right: 0, zIndex: 2,
            background: "var(--bg)",
          }}>
            {DAY_LABELS.map((label, i) => (
              <div key={`r-${label}`} style={{ width: 28, height: 17, fontSize: 10.5, color: "var(--muted)", lineHeight: "17px" }}>
                {i % 2 === 1 ? label : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-legend">
        <span>Less</span>
        <div className="heatmap-cell lvl-0" style={{ width: 11, height: 11 }} />
        <div className="heatmap-cell lvl-1" style={{ width: 11, height: 11 }} />
        <div className="heatmap-cell lvl-2" style={{ width: 11, height: 11 }} />
        <div className="heatmap-cell lvl-3" style={{ width: 11, height: 11 }} />
        <div className="heatmap-cell lvl-4" style={{ width: 11, height: 11 }} />
        <span>More</span>
      </div>
    </div>
  );
}
