"use client";

import { useState } from "react";
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
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB");
}

const PAGE_SIZE = 5;

/**
 * Training Stress Score — the same formula the Zwift Companion app uses.
 * TSS = 100 × (duration in hours) × IF²  where IF = avgWatts / FTP.
 * Returns null when power or FTP data are unavailable.
 */
function computeTSS(avgWatts: number | null | undefined, movingTimeInMs: number | null | undefined, ftp: number): number | null {
  if (!avgWatts || !movingTimeInMs || ftp <= 0) return null;
  const durationH = movingTimeInMs / 3600000;
  const IF = avgWatts / ftp;
  return Math.round(100 * durationH * IF * IF);
}

export default function RidesTable({ activities, ftp }: { activities: ZwiftActivity[]; ftp?: number }) {
  const [page, setPage] = useState<number>(0);

  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageRides = activities.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div>
      {activities.length === 0 ? (
        <div className="notice">No rides found.</div>
      ) : (
        <div className="rides-list">
          {pageRides.map((a) => {
            const rideId = a.id_str ?? String(a.id);
            const world = worldName(a.worldId);
            const tss = ftp ? computeTSS(a.avgWatts, a.movingTimeInMs, ftp) : null;
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
                  {tss !== null && (
                    <span className="ride-stat" title="Training Score (TSS)">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                      {tss} TSS
                    </span>
                  )}
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
            Rides {pageStart + 1}–{pageStart + pageRides.length} of {activities.length}
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
