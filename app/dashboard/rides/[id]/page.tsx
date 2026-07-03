"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MultiLineChart from "../../multi-chart";
import DashboardFooter from "../../footer";
import LogoutButton from "../../logout-button";

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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/zwift/activities/${encodeURIComponent(id)}/detail`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ ok: false, error: "Network error reaching the server." }))
      .finally(() => setLoading(false));
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
      <div className="dashboard-header fade-in">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Blue Zwift tile */}
          <div style={{
            width: 50, height: 50, borderRadius: 14, flexShrink: 0, marginTop: 3,
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
          {/* ── Stat cards (5 — without World, it's already in the title) ── */}
          <div className="stat-grid stat-grid-compact fade-in" style={{ marginBottom: 28 }}>
            <div className="stat-card">
              <div className="label">Date</div>
              <div className="value">
                {data.activity.startDate ? new Date(data.activity.startDate).toLocaleDateString("en-GB") : "n/a"}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Distance</div>
              <div className="value">
                {data.activity.distanceInMeters ? `${(data.activity.distanceInMeters / 1000).toFixed(1)} km` : "n/a"}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Duration</div>
              <div className="value">{formatDuration(data.activity.movingTimeInMs)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Avg power</div>
              <div className="value">{data.activity.avgWatts ? `${Math.round(data.activity.avgWatts)} W` : "n/a"}</div>
            </div>
            <div className="stat-card">
              <div className="label">Calories</div>
              <div className="value">
                {data.activity.calories ? `${Math.round(data.activity.calories)} kcal` : "n/a"}
              </div>
            </div>
          </div>

          {/* ── Telemetry chart ── */}
          {data.fit && !data.fit.ok ? (
            <div className="notice" style={{ marginBottom: 24 }}>
              Couldn&apos;t load second-by-second data for this ride: {data.fit.error}
            </div>
          ) : (
            <div className="stat-card fade-in" style={{ padding: 0, overflow: "hidden", marginBottom: 32 }}>
              <div className="section-title" style={{ margin: "16px 18px 12px 20px" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
                In-ride telemetry
              </div>
              <div style={{ padding: "0 0 12px" }}>
                <MultiLineChart
                  elapsedMs={elapsedMs}
                  elevationM={elevationSeries}
                  series={[
                    { key: "hr",      label: "Heart rate", color: "#e53e3e", unit: "bpm", values: heartRateSeries },
                    { key: "cadence", label: "Cadence",    color: "#22c55e", unit: "rpm", values: cadenceSeries },
                    { key: "power",   label: "Power",      color: "#f97316", unit: "W",   values: powerSeries },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ── Ride On givers ── */}
          <div className="section-title fade-in" style={{ margin: "0 0 12px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
            Ride On givers
          </div>
          {data.rideOns && !data.rideOns.ok ? (
            <div className="notice">{data.rideOns.error}</div>
          ) : data.rideOns && data.rideOns.givers.length === 0 ? (
            <div className="notice">No Ride Ons on this activity yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.rideOns?.givers.map((g, i) => (
                <div
                  key={i}
                  className="stat-card fade-in"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}
                >
                  {g.profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={g.profileImageUrl as string}
                      alt=""
                      width={32}
                      height={32}
                      style={{ borderRadius: "50%" }}
                    />
                  ) : null}
                  <span>{g.fullName ?? "Unknown rider"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Footer ── */}
      <DashboardFooter />
    </div>
  );
}
