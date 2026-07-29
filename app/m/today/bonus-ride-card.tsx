"use client";

/**
 * BonusRideCard — expandable ride card for bonus rides on the Today page.
 * Collapsed: shows ride name + duration chip.
 * Expanded (on tap): shows full ride stats — duration, avg HR, and a link to ICU.
 */

import { useState } from "react";

interface Props {
  activityName: string | null;
  durationMin: number | null;
  avgHr: number | null;
  icuActivityId?: string | null;
}

export default function BonusRideCard({ activityName, durationMin, avgHr, icuActivityId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const displayName = activityName ?? "Bonus ride";

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 4, overflow: "hidden",
        background: "var(--m-card)", border: "1px solid var(--m-border)",
        borderTop: "3px solid #f59e0b",
        marginBottom: 10,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      {/* Header row — always visible */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>
            Bonus ride
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--m-text)", lineHeight: 1.2, letterSpacing: "-0.3px" }}>
            {displayName}
          </div>
        </div>
        {/* Chevron */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, marginLeft: 12,
          transition: "transform 0.2s",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="var(--m-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Quick stats row — always visible */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 14px", flexWrap: "wrap" }}>
        {durationMin && durationMin > 0 && (
          <StatChip value={String(durationMin)} unit="min" color="var(--m-text)" />
        )}
        {avgHr && avgHr > 0 && (
          <StatChip value={String(Math.round(avgHr))} unit="bpm avg" color="#ef4444" />
        )}
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div style={{
          borderTop: "1px solid var(--m-border)",
          padding: "16px 16px",
          background: "var(--m-card-inner)",
          animation: "fadeIn 0.15s ease",
        }}>
          {/* Ride stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {durationMin && (
              <DetailCard
                label="Duration"
                value={`${durationMin} min`}
                sub={durationMin >= 60
                  ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                  : undefined}
                color="#f59e0b"
              />
            )}
            {avgHr && (
              <DetailCard
                label="Avg heart rate"
                value={`${Math.round(avgHr)}`}
                sub="bpm"
                color="#ef4444"
              />
            )}
          </div>

          {/* Ride note */}
          <div style={{
            background: "var(--m-card)", border: "1px solid var(--m-border)",
            borderRadius: 10, padding: "12px 14px", marginBottom: 14,
            fontSize: 14, color: "var(--m-muted)", lineHeight: 1.55,
          }}>
            🎉 Great job on the bonus ride! This data is being saved to your coaching profile to help tailor future training plans.
          </div>

          {/* Open in ICU link */}
          {icuActivityId && (
            <a
              href={`https://intervals.icu/activities/${icuActivityId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "12px 16px", borderRadius: 10,
                background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
                color: "#22c55e", fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              View full ride in Intervals.icu
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({ value, unit, color }: { value: string; unit: string; color: string }) {
  return (
    <div style={{
      background: "var(--m-card-inner)", borderRadius: 3, padding: "8px 12px",
      textAlign: "center", border: "1px solid var(--m-border)",
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>{unit}</div>
    </div>
  );
}

function DetailCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: "var(--m-card)", border: "1px solid var(--m-border)",
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: "var(--m-muted)", marginBottom: 4 }}>{sub}</div>}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
    </div>
  );
}
