"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { computeRecords, selectChartActivities } from "@/lib/stats";
import { IconBolt, IconClock, IconDistance, IconFlame, IconHeart, IconMountain, IconTrophy } from "./icons";

const RECORD_WINDOW_OPTIONS = [30, 60, 90] as const;

/** Animates from 0 up to `value` once, on mount - a bit of polish so the
 * record cards feel alive instead of just appearing with static numbers. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf: number;
    const duration = 800;
    const step = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{format(display)}</>;
}

// Long ride names ("Climb Portal: Pas de Peyrol/Puy Mary at 100% Elevation
// in France") were wrapping the "sub" line to 2-3 lines, which made that
// card taller than its neighbours and broke the grid's row height
// uniformity. Truncating here, paired with the nowrap+ellipsis CSS safety
// net on .record-card .sub, keeps every card's sub line to exactly one line
// so every row (and the whole grid) lines up at the same height.
function truncateName(name: string | undefined, max = 26): string {
  const n = name ?? "Ride";
  return n.length > max ? `${n.slice(0, max - 1).trimEnd()}…` : n;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  // A fixed locale, not the runtime's default - the server (Node) and the
  // browser don't always agree on a default locale, and toLocaleDateString()
  // without one renders differently on each, which Next.js then flags as a
  // hydration mismatch (server "27.5.2026" vs client "5/27/2026").
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB");
}

export default function PersonalRecords({
  activities,
  bestHeartRate,
}: {
  activities: ZwiftActivity[];
  /** Highest average heart rate among the recent rides we have FIT data for. */
  bestHeartRate?: { bpm: number; rideName?: string; rideDate?: string } | null;
}) {
  // "Max" uses the full ride history; the numbered options reuse the same
  // most-recent-N slice the Performance trends chart uses (lib/stats.ts),
  // applied here without any FIT-file fetching since none of these records
  // need second-by-second data.
  const [windowSize, setWindowSize] = useState<number | "max">(30);
  const windowed = useMemo(
    () => (windowSize === "max" ? activities : selectChartActivities(activities, windowSize)),
    [activities, windowSize]
  );

  const r = computeRecords(windowed);

  if (activities.length === 0) {
    return null;
  }

  // Calories aren't part of computeRecords (lib/stats.ts) yet, so totalled
  // here directly from the windowed activities instead. Broken down by sport
  // only when more than one sport actually appears in the data - with a
  // single sport the breakdown would just repeat the total.
  const totalCalories = windowed.reduce((s, a) => s + (a.calories ?? 0), 0);
  const caloriesBySport = windowed.reduce<Record<string, number>>((acc, a) => {
    const sport = a.sport ?? "other";
    acc[sport] = (acc[sport] ?? 0) + (a.calories ?? 0);
    return acc;
  }, {});
  const sportBreakdown = Object.entries(caloriesBySport).filter(([, kcal]) => kcal > 0);

  return (
    <div>
      <div
        className="section-title"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconTrophy size={16} />
          Personal statistics
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Last</span>
          <div className="trend-tabs">
            {RECORD_WINDOW_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`trend-tab ${windowSize === n ? "active" : ""}`}
                onClick={() => setWindowSize(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className={`trend-tab ${windowSize === "max" ? "active" : ""}`}
              onClick={() => setWindowSize("max")}
            >
              Max
            </button>
          </div>
        </div>
      </div>

      <div className="record-grid">
        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconClock size={20} />
          </div>
          <div>
            <div className="label">Total time on the bike</div>
            <div className="value">
              <CountUp value={r.totalTimeMs / 3600000} format={(n) => `${n.toFixed(0)} h`} />
            </div>
            <div className="sub">all rides combined</div>
          </div>
        </div>

        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconDistance size={20} />
          </div>
          <div>
            <div className="label">Total distance</div>
            <div className="value">
              <CountUp value={r.totalDistanceM / 1000} format={(n) => `${n.toFixed(0)} km`} />
            </div>
            <div className="sub">{r.totalRides} rides logged</div>
          </div>
        </div>

        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconMountain size={20} />
          </div>
          <div>
            <div className="label">Total elevation</div>
            <div className="value">
              <CountUp value={r.totalElevationM} format={(n) => `${n.toFixed(0)} m`} />
            </div>
            <div className="sub">{(r.totalElevationM / 8849).toFixed(1)}x Everest</div>
          </div>
        </div>

        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconFlame size={20} />
          </div>
          <div>
            <div className="label">Total calories</div>
            <div className="value">
              <CountUp value={totalCalories} format={(n) => `${n.toFixed(0)} kcal`} />
            </div>
            <div className="sub">
              {sportBreakdown.length > 1
                ? sportBreakdown.map(([sport, kcal]) => `${sport}: ${Math.round(kcal)}`).join(" • ")
                : "all rides combined"}
            </div>
          </div>
        </div>

        {r.longestDistance && (
          <div className="record-card">
            <div className="record-icon c-pink">
              <IconTrophy size={20} />
            </div>
            <div>
              <div className="label">Longest ride</div>
              <div className="value">
                <CountUp value={r.longestDistance.meters / 1000} format={(n) => `${n.toFixed(1)} km`} />
              </div>
              <div className="sub">
                {truncateName(r.longestDistance.activity.name)} • {formatDate(r.longestDistance.activity.startDate)}
              </div>
            </div>
          </div>
        )}

        {r.biggestClimb && (
          <div className="record-card">
            <div className="record-icon c-neutral">
              <IconMountain size={20} />
            </div>
            <div>
              <div className="label">Biggest climbing day</div>
              <div className="value">
                <CountUp value={r.biggestClimb.meters} format={(n) => `${n.toFixed(0)} m`} />
              </div>
              <div className="sub">
                {truncateName(r.biggestClimb.activity.name)} • {formatDate(r.biggestClimb.activity.startDate)}
              </div>
            </div>
          </div>
        )}

        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconHeart size={20} />
          </div>
          <div>
            <div className="label">Highest avg heart rate</div>
            <div className="value">
              {bestHeartRate ? (
                <CountUp value={bestHeartRate.bpm} format={(n) => `${n.toFixed(0)} bpm`} />
              ) : (
                "n/a"
              )}
            </div>
            <div className="sub">
              {bestHeartRate
                ? `${truncateName(bestHeartRate.rideName)} • ${formatDate(bestHeartRate.rideDate)}`
                : "no HR data found in recent rides"}
            </div>
          </div>
        </div>

        <div className="record-card">
          <div className="record-icon c-neutral">
            <IconFlame size={20} />
          </div>
          <div>
            <div className="label">Longest streak</div>
            <div className="value">
              <CountUp value={r.longestStreakDays} format={(n) => `${n.toFixed(0)} days`} />
            </div>
            <div className="sub">
              {r.currentStreakDays > 0 ? `current streak: ${r.currentStreakDays} days` : "no active streak right now"}
            </div>
          </div>
        </div>

        {r.highestAvgPower && (
          <div className="record-card">
            <div className="record-icon c-neutral">
              <IconBolt size={20} />
            </div>
            <div>
              <div className="label">Highest avg power</div>
              <div className="value">
                <CountUp value={r.highestAvgPower.watts} format={(n) => `${n.toFixed(0)} W`} />
              </div>
              <div className="sub">
                {truncateName(r.highestAvgPower.activity.name)} • {formatDate(r.highestAvgPower.activity.startDate)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
