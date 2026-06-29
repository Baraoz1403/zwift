"use client";

import { useState } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { computeTrend } from "@/lib/stats";
import type { TrendDelta, TrendPeriod } from "@/lib/stats";
import { IconArrowDown, IconArrowUp } from "./icons";

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function DeltaBadge({ delta, goodIsUp = true }: { delta: TrendDelta; goodIsUp?: boolean }) {
  if (delta.value === 0) {
    return <span className="trend-delta neutral">no change</span>;
  }
  const isUp = delta.value > 0;
  const isGood = isUp === goodIsUp;
  const pctLabel = delta.pct != null ? `${Math.abs(delta.pct).toFixed(0)}%` : "new";
  return (
    <span className={`trend-delta ${isGood ? "positive" : "negative"}`} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {isUp ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
      {pctLabel}
    </span>
  );
}

export default function TrendComparison({ activities }: { activities: ZwiftActivity[] }) {
  const [period, setPeriod] = useState<TrendPeriod>("week");
  const trend = computeTrend(activities, period);

  const periodLabel = period === "week" ? "this week" : "this month";
  const prevLabel = period === "week" ? "last week" : "last month";

  return (
    <div>
      <div className="section-title">Trend comparison</div>

      <div className="trend-tabs">
        <button className={`trend-tab ${period === "week" ? "active" : ""}`} onClick={() => setPeriod("week")}>
          Week vs week
        </button>
        <button className={`trend-tab ${period === "month" ? "active" : ""}`} onClick={() => setPeriod("month")}>
          Month vs month
        </button>
      </div>

      <div className="trend-card">
        <div className="trend-row">
          <div className="trend-metric">Rides</div>
          <div className="trend-values">
            <span className="current">{trend.current.rides}</span>
            <span className="previous">vs {trend.previous.rides} ({prevLabel})</span>
          </div>
          <DeltaBadge delta={trend.deltas.rides} />
        </div>

        <div className="trend-row">
          <div className="trend-metric">Distance</div>
          <div className="trend-values">
            <span className="current">{(trend.current.distanceM / 1000).toFixed(1)} km</span>
            <span className="previous">vs {(trend.previous.distanceM / 1000).toFixed(1)} km</span>
          </div>
          <DeltaBadge delta={trend.deltas.distanceM} />
        </div>

        <div className="trend-row">
          <div className="trend-metric">Time on the bike</div>
          <div className="trend-values">
            <span className="current">{formatDuration(trend.current.movingTimeMs)}</span>
            <span className="previous">vs {formatDuration(trend.previous.movingTimeMs)}</span>
          </div>
          <DeltaBadge delta={trend.deltas.movingTimeMs} />
        </div>

        <div className="trend-row">
          <div className="trend-metric">Elevation</div>
          <div className="trend-values">
            <span className="current">{Math.round(trend.current.elevationM)} m</span>
            <span className="previous">vs {Math.round(trend.previous.elevationM)} m</span>
          </div>
          <DeltaBadge delta={trend.deltas.elevationM} />
        </div>

        <div className="trend-row">
          <div className="trend-metric">Avg power</div>
          <div className="trend-values">
            <span className="current">{trend.current.avgWatts ? `${Math.round(trend.current.avgWatts)} W` : "n/a"}</span>
            <span className="previous">vs {trend.previous.avgWatts ? `${Math.round(trend.previous.avgWatts)} W` : "n/a"}</span>
          </div>
          <DeltaBadge delta={trend.deltas.avgWatts} />
        </div>
      </div>

      <div className="notice" style={{ marginTop: 12, fontSize: 12.5 }}>
        Comparing the last {period === "week" ? "7" : "30"} days against the {period === "week" ? "7" : "30"} days before that ({periodLabel} vs {prevLabel}).
      </div>
    </div>
  );
}
