"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ZwiftActivity } from "@/lib/zwift";
import { computeRecords } from "@/lib/stats";
import { IconBolt, IconClock, IconDistance, IconFlame, IconHeart, IconMountain, IconTrophy } from "./icons";

const WINDOW_OPTIONS = ["W", "M", "Y", "ALL"] as const;
type WindowOption = typeof WINDOW_OPTIONS[number];
const WINDOW_MS: Record<WindowOption, number | null> = {
  W: 7 * 86400 * 1000,
  M: 30 * 86400 * 1000,
  Y: 365 * 86400 * 1000,
  ALL: null,
};

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
  const [window, setWindow] = useState<WindowOption>("M");
  const windowed = useMemo(() => {
    const ms = WINDOW_MS[window];
    if (!ms) return activities;
    const cutoff = Date.now() - ms;
    return activities.filter((a) => {
      const d = a.startDate ? new Date(a.startDate as string).getTime() : 0;
      return d >= cutoff;
    });
  }, [activities, window]);

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

  const longestSession = windowed.reduce<{ ms: number; activity: ZwiftActivity } | null>((best, a) => {
    const ms = (a.movingTimeInMs as number) ?? 0; // already in ms
    if (!best || ms > best.ms) return { ms, activity: a };
    return best;
  }, null);


  function StatRow({ icon, iconClass = "c-neutral", label, sub, value, unit }: {
    icon: ReactNode; iconClass?: string; label: string; sub?: string; value: ReactNode; unit?: string;
  }) {
    return (
      <div style={{ display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
        <div className={`stat-card-icon ${iconClass}`} style={{ flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.65, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
          {unit && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{unit}</span>}
          <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right" }}>
            {value}
          </span>
        </div>
      </div>
    );
  }

  const Divider = () => <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />;

  return (
    <div>
      {/* Title + window selector */}
      <div className="section-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconTrophy size={16} />
          Personal statistics
        </span>
        <div className="trend-tabs">
          {WINDOW_OPTIONS.map((w) => (
            <button key={w} type="button" className={`trend-tab ${window === w ? "active" : ""}`} onClick={() => setWindow(w)}>{w}</button>
          ))}
        </div>
      </div>

      {/* Two-panel layout — same as the Power & Cadence / Fitness header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Left panel — Activity totals: distance → time → elevation → calories → consistency */}
        <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="section-title" style={{ margin: "14px 18px 10px 20px" }}>Activity totals</div>

          <StatRow icon={<IconDistance size={13} />} iconClass="c-blue" label="Total distance" sub={`${r.totalRides} rides logged`}
            unit="km" value={<CountUp value={r.totalDistanceM / 1000} format={(n) => n.toFixed(0)} />} />
          <Divider />
          <StatRow icon={<IconClock size={13} />} iconClass="c-neutral" label="Total time" sub="all rides combined"
            unit="h" value={<CountUp value={r.totalTimeMs / 3600000} format={(n) => n.toFixed(0)} />} />
          <Divider />
          <StatRow icon={<IconMountain size={13} />} iconClass="c-teal" label="Total elevation" sub={`${(r.totalElevationM / 8849).toFixed(1)}x Everest`}
            unit="m" value={<CountUp value={r.totalElevationM} format={(n) => n.toFixed(0)} />} />
          <Divider />
          <StatRow icon={<IconFlame size={13} />} iconClass="c-orange"
            label="Total calories"
            sub={sportBreakdown.length > 1 ? sportBreakdown.map(([s, k]) => `${s}: ${Math.round(k)}`).join(" • ") : "all rides combined"}
            unit="kcal" value={<CountUp value={totalCalories} format={(n) => n.toFixed(0)} />} />
          <Divider />
          <StatRow icon={<IconTrophy size={13} />} iconClass="c-amber" label="Longest streak"
            sub={r.currentStreakDays > 0 ? `current streak: ${r.currentStreakDays} days` : "no active streak"}
            unit="days" value={<CountUp value={r.longestStreakDays} format={(n) => n.toFixed(0)} />} />
        </div>

        {/* Right panel — Personal bests: distance → time → elevation → power → HR */}
        <div className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="section-title" style={{ margin: "14px 18px 10px 20px" }}>Personal bests</div>

          {r.longestDistance && (
            <>
              <StatRow icon={<IconTrophy size={13} />} iconClass="c-blue" label="Longest ride"
                sub={`${truncateName(r.longestDistance.activity.name)} • ${formatDate(r.longestDistance.activity.startDate)}`}
                unit="km" value={<CountUp value={r.longestDistance.meters / 1000} format={(n) => n.toFixed(1)} />} />
              <Divider />
            </>
          )}

          {longestSession && longestSession.ms > 0 && (
            <>
              <StatRow icon={<IconClock size={13} />} iconClass="c-neutral" label="Longest session"
                sub={`${truncateName(longestSession.activity.name)} • ${formatDate(longestSession.activity.startDate)}`}
                unit={longestSession.ms >= 3600000 ? "h" : "min"}
                value={<CountUp
                  value={longestSession.ms >= 3600000 ? longestSession.ms / 3600000 : longestSession.ms / 60000}
                  format={(n) => longestSession.ms >= 3600000 ? n.toFixed(1) : n.toFixed(0)}
                />} />
              <Divider />
            </>
          )}

          {r.biggestClimb && (
            <>
              <StatRow icon={<IconMountain size={13} />} iconClass="c-teal" label="Biggest climbing day"
                sub={`${truncateName(r.biggestClimb.activity.name)} • ${formatDate(r.biggestClimb.activity.startDate)}`}
                unit="m" value={<CountUp value={r.biggestClimb.meters} format={(n) => n.toFixed(0)} />} />
              <Divider />
            </>
          )}

          {r.highestAvgPower && (
            <>
              <StatRow icon={<IconBolt size={13} />} iconClass="c-amber" label="Highest avg power"
                sub={`${truncateName(r.highestAvgPower.activity.name)} • ${formatDate(r.highestAvgPower.activity.startDate)}`}
                unit="W" value={<CountUp value={r.highestAvgPower.watts} format={(n) => n.toFixed(0)} />} />
              <Divider />
            </>
          )}

          <StatRow icon={<IconHeart size={13} />} iconClass="c-red" label="Highest avg heart rate"
            sub={bestHeartRate ? `${truncateName(bestHeartRate.rideName)} • ${formatDate(bestHeartRate.rideDate)}` : "no HR data in recent rides"}
            unit={bestHeartRate ? "bpm" : undefined}
            value={bestHeartRate
              ? <CountUp value={bestHeartRate.bpm} format={(n) => n.toFixed(0)} />
              : <span style={{ fontSize: 16, color: "var(--muted)" }}>n/a</span>} />
        </div>

      </div>
    </div>
  );
}
