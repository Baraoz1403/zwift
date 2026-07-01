"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ZwiftActivity } from "@/lib/zwift";
import { worldName } from "@/lib/zwift-worlds";
import { IconBolt, IconClock, IconDistance, IconFlame, IconMountain } from "./icons";

function formatDuration(ms?: number): string {
  if (!ms) return "n/a";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(meters?: number): string {
  if (!meters) return "n/a";
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDate(iso?: string): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  // Fixed locale - see the comment in personal-records.tsx formatDate for why.
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB");
}

const RANGE_OPTIONS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 },
  { label: "All time", days: 0 },
] as const;

const PAGE_SIZE = 5;

export default function RidesTable({ activities }: { activities: ZwiftActivity[] }) {
  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) if (a.sport) set.add(a.sport);
    return Array.from(set);
  }, [activities]);

  const [sport, setSport] = useState<string>("all");
  const [rangeDays, setRangeDays] = useState<number>(0);
  // Custom "from"/"to" dates (yyyy-mm-dd, straight from <input type="date">),
  // on top of the quick presets above - picking a custom date clears the
  // preset so the two don't silently fight each other.
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  // Fixed window of PAGE_SIZE rides at a time, with arrows to step through
  // the filtered list, instead of an ever-growing "show more" list.
  const [page, setPage] = useState<number>(0);

  const filtered = useMemo(() => {
    const cutoff = rangeDays > 0 ? Date.now() - rangeDays * 24 * 60 * 60 * 1000 : null;
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    // "to" is inclusive of the whole day, so add one day minus 1ms.
    const toMs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null;

    return activities.filter((a) => {
      if (sport !== "all" && a.sport !== sport) return false;
      const t = a.startDate ? new Date(a.startDate).getTime() : NaN;
      if (cutoff && !isNaN(t) && t < cutoff) return false;
      if (fromMs != null && !isNaN(t) && t < fromMs) return false;
      if (toMs != null && !isNaN(t) && t > toMs) return false;
      return true;
    });
  }, [activities, sport, rangeDays, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalDistance = filtered.reduce((s, a) => s + (a.distanceInMeters ?? 0), 0);
    const totalTimeMs = filtered.reduce((s, a) => s + (a.movingTimeInMs ?? 0), 0);
    const totalElevation = filtered.reduce((s, a) => s + (a.totalElevation ?? 0), 0);
    const totalCalories = filtered.reduce((s, a) => s + (a.calories ?? 0), 0);
    const withPower = filtered.filter((a) => a.avgWatts);
    const avgPower =
      withPower.length > 0
        ? withPower.reduce((s, a) => s + (a.avgWatts ?? 0), 0) / withPower.length
        : null;
    return { totalDistance, totalTimeMs, totalElevation, totalCalories, avgPower, count: filtered.length };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRides = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <select
          value={sport}
          onChange={(e) => {
            setSport(e.target.value);
            setPage(0);
          }}
          className="select"
          style={{ width: "auto" }}
        >
          <option value="all">All sports</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={rangeDays}
          onChange={(e) => {
            setRangeDays(Number(e.target.value));
            setPage(0);
          }}
          className="select"
          style={{ width: "auto" }}
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.label} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setRangeDays(0);
              setPage(0);
            }}
            className="select"
            style={{ width: "auto" }}
          />
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setRangeDays(0);
              setPage(0);
            }}
            className="select"
            style={{ width: "auto" }}
          />
          {(fromDate || toDate) && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "auto", padding: "8px 12px", fontSize: 12.5 }}
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid stat-grid-6" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="label">Rides</div>
          <div className="value">{summary.count}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total distance</div>
          <div className="value">{formatDistance(summary.totalDistance)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total time</div>
          <div className="value">{formatDuration(summary.totalTimeMs)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total elevation</div>
          <div className="value">{Math.round(summary.totalElevation)} m</div>
        </div>
        <div className="stat-card">
          <div className="label">Avg power</div>
          <div className="value">
            {summary.avgPower ? `${Math.round(summary.avgPower)} W` : "n/a"}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Calories</div>
          <div className="value">
            {summary.totalCalories ? `${Math.round(summary.totalCalories)} kcal` : "n/a"}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="notice">No rides match this filter.</div>
      ) : (
        <div className="rides-list">
          {pageRides.map((a) => {
            // Activity ids are 64-bit; id_str is the precision-safe form
            // (see lib/zwift.ts) and must be used for the detail link.
            const rideId = a.id_str ?? String(a.id);
            const world = worldName(a.worldId);
            return (
              <Link key={rideId} href={`/dashboard/rides/${rideId}`} className="ride-row">
                <div className="ride-row-icon">
                  <IconDistance size={15} />
                </div>

                <div className="ride-row-main">
                  <div className="ride-row-name">{a.name ?? "Ride"}</div>
                  <div className="ride-row-meta">
                    {formatDate(a.startDate)}
                    {world ? ` • ${world}` : ""}
                    {a.sport ? ` • ${a.sport}` : ""}
                  </div>
                </div>

                <div className="ride-row-stats">
                  <span className="ride-stat">
                    <IconDistance size={13} />
                    {formatDistance(a.distanceInMeters)}
                  </span>
                  <span className="ride-stat">
                    <IconClock size={13} />
                    {formatDuration(a.movingTimeInMs)}
                  </span>
                  <span className="ride-stat">
                    <IconBolt size={13} />
                    {a.avgWatts ? `${Math.round(a.avgWatts)} W` : "n/a"}
                  </span>
                  <span className="ride-stat">
                    <IconMountain size={13} />
                    {a.totalElevation ? `${Math.round(a.totalElevation)} m` : "n/a"}
                  </span>
                  <span className="ride-stat">
                    <IconFlame size={13} />
                    {a.calories ? `${Math.round(a.calories)} kcal` : "n/a"}
                  </span>
                </div>

                <div className="ride-row-arrow">→</div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 14,
          }}
        >
          <button
            type="button"
            className="btn-secondary btn"
            style={{ width: "auto", padding: "6px 14px" }}
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Previous 5
          </button>
          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
            Rides {pageStart + 1}–{pageStart + pageRides.length} of {filtered.length}
          </span>
          <button
            type="button"
            className="btn-secondary btn"
            style={{ width: "auto", padding: "6px 14px" }}
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next 5 →
          </button>
        </div>
      )}
    </div>
  );
}
