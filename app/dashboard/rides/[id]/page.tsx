"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MultiLineChart from "../../multi-chart";
import { worldName } from "@/lib/zwift-worlds";

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
  // Aligned, same-length arrays (one entry per FIT sample) so the combined
  // chart can use a single shared x-axis (elapsed time). A heart rate of
  // exactly 0 is never a real reading - the strap briefly lost signal, not
  // that the rider's heart stopped - so it becomes a gap (null), not a dip
  // to zero. Zero is a legitimate cadence/power reading (coasting), so those
  // two keep it as-is.
  const startMs = points.length > 0 ? points[0].timestampMs : 0;
  const elapsedMs = points.map((p) => p.timestampMs - startMs);
  const heartRateSeries = points.map((p) =>
    p.heartRate != null && p.heartRate > 0 ? p.heartRate : null
  );
  const cadenceSeries = points.map((p) => (p.cadence != null ? p.cadence : null));
  const powerSeries = points.map((p) => (p.power != null ? p.power : null));
  const elevationSeries = points.map((p) => (p.altitudeM != null ? p.altitudeM : null));

  return (
    <div className="dashboard">
      <div className="dashboard-header fade-in">
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{data?.activity?.name ?? "Ride details"}</h1>
        <Link href="/dashboard" className="btn-secondary btn" style={{ width: "auto", padding: "8px 16px" }}>
          Back to dashboard
        </Link>
      </div>

      {loading && <div className="notice">Loading ride...</div>}

      {!loading && data && !data.ok && (
        <div className="notice">{data.error ?? "Could not load this ride."}</div>
      )}

      {!loading && data?.ok && data.activity && (
        <>
          <div className="stat-grid stat-grid-compact fade-in" style={{ marginBottom: 24 }}>
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
              <div className="label">World</div>
              <div className="value">{worldName(data.activity.worldId) ?? "n/a"}</div>
            </div>
            <div className="stat-card">
              <div className="label">Calories</div>
              <div className="value">
                {data.activity.calories ? `${Math.round(data.activity.calories)} kcal` : "n/a"}
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>In-ride telemetry</h2>
          {data.fit && !data.fit.ok ? (
            <div className="notice" style={{ marginBottom: 24 }}>
              Couldn&apos;t load second-by-second data for this ride: {data.fit.error}
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <MultiLineChart
                elapsedMs={elapsedMs}
                elevationM={elevationSeries}
                series={[
                  { key: "hr", label: "Heart rate", color: "#ff6600", unit: "bpm", values: heartRateSeries },
                  { key: "cadence", label: "Cadence", color: "#22c55e", unit: "rpm", values: cadenceSeries },
                  { key: "power", label: "Power", color: "#2f8fe0", unit: "W", values: powerSeries },
                ]}
              />
            </div>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Ride On givers</h2>
          {data.rideOns && !data.rideOns.ok ? (
            <div className="notice">Couldn&apos;t load Ride On givers for this ride: {data.rideOns.error}</div>
          ) : data.rideOns && data.rideOns.givers.length === 0 ? (
            <div className="notice">No Ride Ons on this activity yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.rideOns?.givers.map((g, i) => (
                <div
                  key={i}
                  className="stat-card"
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
    </div>
  );
}
