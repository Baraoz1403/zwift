"use client";

/**
 * BonusRideCard — displays a completed bonus ride (rode on a rest day, or
 * activity differs from plan) in the Week-page day-card style.
 *
 * Collapsed: date bubble + ride name + Bonus badge + duration/HR chips + chevron
 * Expanded:  full stat grid (duration, HR, power, distance, TSS) +
 *            effort intensity bar (NP or avg power vs FTP)
 */

import { useState } from "react";

interface Props {
  activityName: string | null;
  durationMin: number | null;
  avgHr: number | null;
  /** Average power (watts), null if unavailable */
  avgPower?: number | null;
  /** Normalized power (watts), null if unavailable */
  normalizedPower?: number | null;
  /** Distance in km */
  distanceKm?: number | null;
  /** Training Stress Score */
  tss?: number | null;
  /** Athlete FTP (watts) — used for effort bar */
  ftp?: number | null;
  /** ISO date string YYYY-MM-DD — used for the date bubble */
  date: string;
}

export default function BonusRideCard({
  activityName, durationMin, avgHr, avgPower, normalizedPower,
  distanceKm, tss, ftp, date,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const d = new Date(date + "T12:00:00");
  const dayShort = d.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum   = d.toLocaleDateString("en-US", { day: "numeric" });

  const displayName = activityName ?? "Bonus ride";
  const ZO = "#FF5A1F"; // VOLT orange — single accent color

  // Effort bar: use NP over avg power (more meaningful), cap at 130% FTP
  const effortWatts = normalizedPower ?? avgPower;
  const effortPct = (ftp && ftp > 0 && effortWatts)
    ? Math.min(Math.round((effortWatts / ftp) * 100), 130)
    : null;

  // Monochromatic effort color — VOLT orange gradient, red only at all-out
  const effortColor =
    effortPct == null ? "var(--m-muted)" :
    effortPct >= 120  ? "#ef4444" :
    effortPct >= 76   ? ZO :        // any meaningful intensity = VOLT orange
                        "var(--m-muted)"; // Z1/Z2 = neutral

  const effortLabel =
    effortPct == null ? null :
    effortPct < 56    ? "Recovery" :
    effortPct < 76    ? "Endurance" :
    effortPct < 88    ? "Tempo" :
    effortPct < 95    ? "Sweet Spot" :
    effortPct < 106   ? "Threshold" :
    effortPct < 120   ? "VO2max" : "Sprint";

  return (
    <div>
      {/* ── Collapsed header row ── */}
      <div
        role="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          background: "rgba(255,90,31,0.06)",
          borderRadius: expanded ? "4px 4px 0 0" : 4,
          border: "1px solid rgba(255,90,31,0.25)",
          borderBottom: expanded ? "none" : undefined,
          padding: "16px 14px",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Date bubble */}
          <div style={{
            width: 52, height: 52, borderRadius: 4, flexShrink: 0,
            background: `${ZO}18`, border: `1px solid ${ZO}44`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 1,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: ZO, letterSpacing: ".3px" }}>
              {dayShort.toUpperCase()}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: ZO }}>{dayNum}</span>
          </div>

          {/* Ride info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title + Bonus badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 20, fontWeight: 700, color: "var(--m-text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1, minWidth: 0,
              }}>
                {displayName}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, color: ZO,
                background: "rgba(255,90,31,0.12)", padding: "3px 9px", borderRadius: 3, flexShrink: 0,
              }}>Bonus</span>
            </div>

            {/* Sub-row: RIDE badge + quick stats + chevron */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: "#3b82f6",
                background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
                borderRadius: 3, padding: "2px 8px", flexShrink: 0,
              }}>RIDE</span>
              {durationMin && durationMin > 0 && (
                <span style={{ fontSize: 15, color: "var(--m-muted)" }}>{durationMin} min</span>
              )}
              {distanceKm && distanceKm > 0 && (
                <span style={{ fontSize: 15, color: "var(--m-muted)" }}>{distanceKm} km</span>
              )}
              {avgHr && avgHr > 0 && (
                <span style={{ fontSize: 15, fontWeight: 600, color: "#ef4444" }}>
                  {Math.round(avgHr)} bpm
                </span>
              )}
              {effortPct != null && (
                <span style={{ fontSize: 13, fontWeight: 700, color: effortColor }}>
                  {effortPct}% FTP
                </span>
              )}
              {/* Chevron */}
              <span style={{
                marginLeft: "auto", fontSize: 14, color: "var(--m-muted)",
                display: "inline-block",
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform .2s",
                flexShrink: 0,
              }}>⌄</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div style={{
          background: "var(--m-card)",
          border: "1px solid rgba(255,90,31,0.25)",
          borderTop: "1px solid var(--m-border)",
          borderRadius: "0 0 4px 4px",
          padding: "14px 16px 18px",
        }}>

          {/* Effort intensity bar */}
          {effortPct != null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                  Effort
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: effortColor }}>
                  {effortPct}% FTP — {effortLabel}
                </span>
              </div>
              {/* Bar track */}
              <div style={{ height: 10, borderRadius: 5, background: "var(--m-card-inner)", border: "1px solid var(--m-border)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(effortPct, 100)}%`,
                  background: `linear-gradient(90deg, ${effortColor}88, ${effortColor})`,
                  borderRadius: 5,
                  transition: "width .4s ease",
                }}/>
              </div>
              {(normalizedPower || avgPower) && (
                <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 4 }}>
                  {normalizedPower ? `NP ${normalizedPower}W` : ""}{normalizedPower && avgPower ? " · " : ""}{avgPower ? `Avg ${avgPower}W` : ""}
                  {ftp ? ` · FTP ${ftp}W` : ""}
                </div>
              )}
            </div>
          )}

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {durationMin != null && (
              <StatTile
                value={durationMin >= 60
                  ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ""}`
                  : `${durationMin} min`}
                label="Duration"
                color={ZO}
              />
            )}
            {distanceKm != null && distanceKm > 0 && (
              <StatTile value={`${distanceKm} km`} label="Distance" color="#3b82f6" />
            )}
            {avgHr != null && avgHr > 0 && (
              <StatTile value={`${Math.round(avgHr)}`} label="Avg HR (bpm)" color="#ef4444" />
            )}
            {tss != null && tss > 0 && (
              <StatTile value={String(tss)} label="TSS (Load)" color="#818cf8" />
            )}
            {normalizedPower != null && (
              <StatTile value={`${normalizedPower}W`} label="NP" color="#f97316" />
            )}
            {avgPower != null && (
              <StatTile value={`${avgPower}W`} label="Avg Power" color="#f97316" />
            )}
          </div>

          {/* Footer note */}
          <div style={{
            background: "var(--m-card-inner)", borderRadius: 4, padding: "10px 14px",
            border: "1px solid var(--m-border)",
            fontSize: 13, color: "var(--m-muted)", lineHeight: 1.55,
          }}>
            🎉 Bonus ride — stats saved to your coaching profile.
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{
      background: "var(--m-card-inner)", borderRadius: 4, padding: "14px 16px",
      border: "1px solid var(--m-border)",
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 6 }}>{label}</div>
    </div>
  );
}
