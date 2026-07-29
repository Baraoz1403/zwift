"use client";

/**
 * BonusRideCard — displays an actual bonus ride (or completed ride that differs from plan)
 * using the EXACT same card style as the Week page day cards.
 *
 * Collapsed: date bubble + ride name + Bonus badge + duration/HR chips + chevron
 * Expanded:  actual ride stats in detail cards (duration, HR)
 */

import { useState } from "react";

interface Props {
  activityName: string | null;
  durationMin: number | null;
  avgHr: number | null;
  /** ISO date string YYYY-MM-DD — used for the date bubble */
  date: string;
}

export default function BonusRideCard({ activityName, durationMin, avgHr, date }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Parse date for the bubble
  const d = new Date(date + "T12:00:00");
  const dayShort = d.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum   = d.toLocaleDateString("en-US", { day: "numeric" });

  const displayName = activityName ?? "Bonus ride";
  const AMBER = "#f59e0b";

  return (
    <div>
      {/* Main tappable row — matches Week page day card exactly */}
      <div
        role="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          background: "rgba(245,158,11,0.06)",
          borderRadius: expanded ? "4px 4px 0 0" : 4,
          border: "1px solid rgba(245,158,11,0.25)",
          borderBottom: expanded ? "none" : undefined,
          padding: "16px 14px",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Date bubble — same 52×52 as Week page */}
          <div style={{
            width: 52, height: 52, borderRadius: 4, flexShrink: 0,
            background: `${AMBER}18`,
            border: `1px solid ${AMBER}44`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 1,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: AMBER, letterSpacing: ".3px" }}>
              {dayShort.toUpperCase()}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: AMBER }}>
              {dayNum}
            </span>
          </div>

          {/* Ride info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title row + status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 20, fontWeight: 700, color: "var(--m-text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                flex: 1, minWidth: 0,
              }}>
                {displayName}
              </span>
              {/* "Bonus" badge — same as Week page statusMeta */}
              <span style={{
                fontSize: 13, fontWeight: 700, color: AMBER,
                background: "rgba(245,158,11,0.12)", padding: "3px 9px", borderRadius: 3, flexShrink: 0,
              }}>Bonus</span>
            </div>

            {/* Sub-row: RIDE badge + duration + HR + chevron */}
            <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: "#3b82f6",
                background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)",
                borderRadius: 3, padding: "2px 8px", flexShrink: 0,
              }}>RIDE</span>
              {durationMin && durationMin > 0 && (
                <span style={{ fontSize: 16, color: "#64748b" }}>{durationMin} min</span>
              )}
              {avgHr && avgHr > 0 && (
                <span style={{ fontSize: 15, fontWeight: 600, color: "#ef4444" }}>
                  {Math.round(avgHr)} bpm avg
                </span>
              )}
              {/* Expand chevron */}
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

      {/* Expanded detail panel — same style as Week page */}
      {expanded && (
        <div style={{
          background: "var(--m-card)",
          border: "1px solid rgba(245,158,11,0.25)",
          borderTop: "1px solid var(--m-border)",
          borderRadius: "0 0 4px 4px",
          padding: "12px 16px 16px",
        }}>
          {/* Actual ride stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {durationMin && (
              <div style={{
                background: "var(--m-card-inner)", borderRadius: 4, padding: "14px 16px",
                border: "1px solid var(--m-border)",
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: AMBER, lineHeight: 1 }}>
                  {durationMin >= 60
                    ? `${Math.floor(durationMin / 60)}h${durationMin % 60 > 0 ? ` ${durationMin % 60}m` : ""}`
                    : `${durationMin} min`}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 6 }}>Duration</div>
              </div>
            )}
            {avgHr && avgHr > 0 && (
              <div style={{
                background: "var(--m-card-inner)", borderRadius: 4, padding: "14px 16px",
                border: "1px solid var(--m-border)",
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#ef4444", lineHeight: 1 }}>
                  {Math.round(avgHr)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginTop: 6 }}>Avg HR (bpm)</div>
              </div>
            )}
          </div>

          {/* Bonus ride note */}
          <div style={{
            background: "var(--m-card-inner)", borderRadius: 4, padding: "10px 14px",
            border: "1px solid var(--m-border)",
            fontSize: 13, color: "var(--m-muted)", lineHeight: 1.55,
          }}>
            🎉 Bonus ride on a rest day — data saved to your coaching profile.
          </div>
        </div>
      )}
    </div>
  );
}
