"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MultiLineChart from "../../multi-chart";
import RidesTable from "../../rides-table";
import DashboardFooter from "../../footer";
import LogoutButton from "../../logout-button";
import type { ZwiftActivity } from "@/lib/zwift";

interface FitPoint {
  timestampMs: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  speedMps?: number;
  altitudeM?: number;
}

interface RideOnGiver {
  fullName?: string;
  profileImageUrl?: string;
  createDate?: string;
  [key: string]: unknown;
}

interface DetailResponse {
  ok: boolean;
  error?: string;
  activity?: {
    id: string;
    name?: string;
    sport?: string;
    startDate?: string;
    distanceInMeters?: number;
    movingTimeInMs?: number;
    avgWatts?: number;
    totalElevation?: number;
    worldId?: number;
    calories?: number;
  };
  fit?: { ok: true; points: FitPoint[] } | { ok: false; error: string };
  rideOns?: { ok: true; givers: RideOnGiver[] } | { ok: false; error: string };
}

function formatDuration(ms?: number): string {
  if (!ms) return "n/a";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ZwiftActivity[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/zwift/activities/${encodeURIComponent(id)}/detail`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ ok: false, error: "Network error reaching the server." }))
      .finally(() => setLoading(false));
    // Fetch all rides for the list at the bottom
    fetch("/api/zwift/activities")
      .then((r) => r.json())
      .then((j) => { if (j.ok && Array.isArray(j.activities)) setActivities(j.activities); })
      .catch(() => {});
  }, [id]);

  const points = data?.fit && data.fit.ok ? data.fit.points : [];
  const startMs = points.length > 0 ? points[0].timestampMs : 0;
  const elapsedMs = points.map((p) => p.timestampMs - startMs);
  const heartRateSeries = points.map((p) =>
    p.heartRate != null && p.heartRate > 0 ? p.heartRate : null
  );
  const cadenceSeries = points.map((p) => (p.cadence != null ? p.cadence : null));
  const powerSeries = points.map((p) => (p.power != null ? p.power : null));
  const elevationSeries = points.map((p) => (p.altitudeM != null ? p.altitudeM : null));

  const rideName = data?.activity?.name ?? (loading ? "Loading…" : "Ride details");

  return (
    <div className="dashboard">

      {/* ── Header ── */}
      <div className="dashboard-header fade-in" style={{ flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Blue Zwift tile */}
          <div style={{
            width: 50, height: 50, borderRadius: 10, flexShrink: 0, marginTop: 3,
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(47,143,224,0.35)",
          }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/>
            </svg>
          </div>
          {/* Title */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 5 }}>
              AI Training Coach
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
              {rideName}
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400, marginTop: 5 }}>
              Ride smarter, live better — powered by AI.
            </div>
          </div>
        </div>
        {/* Right — back + sign out */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/dashboard" className="btn-secondary btn" style={{ width: "auto", padding: "8px 16px" }}>
            ← Dashboard
          </Link>
          <LogoutButton />
        </div>
      </div>

      {loading && <div className="notice">Loading ride…</div>}

      {!loading && data && !data.ok && (
        <div className="notice">{data.error ?? "Could not load this ride."}</div>
      )}

      {!loading && data?.ok && data.activity && (
        <>
          {/* ── Unified ride card: stats + telemetry ── */}
          <div className="stat-card fade-in" style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>

            {/* Stats strip */}
            <div className="ride-stats-strip">
              {[
                { label: "Date",      value: data.activity.startDate ? new Date(data.activity.startDate).toLocaleDateString("en-GB") : "n/a" },
                { label: "Distance",  value: data.activity.distanceInMeters ? `${(data.activity.distanceInMeters / 1000).toFixed(1)} km` : "n/a" },
                { label: "Duration",  value: formatDuration(data.activity.movingTimeInMs) },
                { label: "Avg power", value: data.activity.avgWatts ? `${Math.round(data.activity.avgWatts)} W` : "n/a" },
                { label: "Calories",  value: data.activity.calories ? `${Math.round(data.activity.calories)} kcal` : "n/a" },
              ].map((s, i, arr) => (
                <React.Fragment key={s.label}>
                  <div style={{ flex: 1, padding: "18px 20px" }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", marginBottom: 7 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                      {s.value}
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ width: 1, background: "var(--border)", margin: "14px 0", flexShrink: 0 }} />
                  )}
                </React.Fragment>
              ))}
            </div>
            {/* Inset horizontal divider */}
            <div style={{ height: 1, background: "var(--border)", margin: "0 20px" }} />

            {/* Section separator */}
            {data.fit?.ok && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "0 20px",
                  height: 42,
                  background: "rgba(20,23,26,0.025)",
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--muted)" }}>
                    In-ride telemetry
                  </span>
                </div>

                {/* Chart */}
                <div style={{ paddingBottom: 4 }}>
                  <MultiLineChart
                    elapsedMs={elapsedMs}
                    elevationM={elevationSeries}
                    series={[
                      { key: "hr",      label: "Heart rate", color: "#dc2626", unit: "bpm", values: heartRateSeries },
                      { key: "cadence", label: "Cadence",    color: "#1d4ed8", unit: "rpm", values: cadenceSeries },
                      { key: "power",   label: "Power",      color: "#111827", unit: "W",   values: powerSeries },
                    ]}
                  />
                </div>
              </>
            )}

            {/* Telemetry error (FIT file failed to load) */}
            {data.fit && !data.fit.ok && (
              <div className="notice" style={{ margin: "14px 18px" }}>
                Couldn&apos;t load second-by-second data: {data.fit.error}
              </div>
            )}
          </div>

          {/* ── Ride On givers — styled like the rubric cards ── */}
          <div className="stat-card fade-in" style={{ padding: 0, overflow: "hidden" }}>
            <div className="section-title" style={{ margin: "16px 18px 10px 20px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              Ride On givers
              {data.rideOns?.ok && data.rideOns.givers.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--muted)", opacity: 0.7 }}>
                  {data.rideOns.givers.length}
                </span>
              )}
            </div>

            {data.rideOns && !data.rideOns.ok ? (
              <div className="notice" style={{ margin: "0 18px 16px" }}>{data.rideOns.error}</div>
            ) : data.rideOns && data.rideOns.givers.length === 0 ? (
              <div style={{ padding: "12px 18px 16px", fontSize: 13, color: "var(--muted)", opacity: 0.6 }}>
                No Ride Ons on this activity yet.
              </div>
            ) : (
              data.rideOns?.givers.map((g, i) => (
                <div key={i}>
                  {i > 0 && <div style={{ height: 1, background: "var(--border)", margin: "0 18px" }} />}
                  <div style={{ display: "flex", alignItems: "center", padding: "13px 18px", gap: 12 }}>
                    {g.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.profileImageUrl as string}
                        alt=""
                        width={32}
                        height={32}
                        style={{ borderRadius: "50%", flexShrink: 0 }}
                      />
                    ) : (
                      <div className="stat-card-icon c-blue" style={{ flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                      </div>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", flex: 1 }}>
                      {g.fullName ?? "Unknown rider"}
                    </span>
                    <div className="stat-card-icon c-amber" style={{ flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                      </svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── All rides list ── */}
          {activities.length > 0 && (
            <div className="stat-card fade-in" style={{ padding: 0, overflow: "hidden", marginTop: 28 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "0 20px", height: 42,
                background: "rgba(20,23,26,0.025)",
                borderBottom: "1px solid var(--border)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--muted)" }}>
                  All rides
                </span>
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--muted)", opacity: 0.6 }}>
                  {activities.length}
                </span>
              </div>
              <div style={{ padding: "8px 0" }}>
                <RidesTable activities={activities} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Footer ── */}
      <DashboardFooter />
    </div>
  );
}
