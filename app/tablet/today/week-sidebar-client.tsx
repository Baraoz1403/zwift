"use client";

import { useState } from "react";
import { RideDetailPanel, type RideSummary } from "./ride-detail-panel";

export type { RideSummary };

export type DayRowData = {
  dayName: string;
  date?: string;
  dateNum?: number;
  isToday: boolean;
  isRest: boolean;
  workoutTitle?: string;
  zoneLabel?: string;
  zoneColor?: string;
  durationMin?: number;
  status?: "completed" | "missed" | "planned" | "bonus";
  ride?: RideSummary;
};

export type WeekNavData = {
  prevWeekUrl: string;
  nextWeekUrl: string;
  currentWeekUrl: string;
  weekLabel: string;     // e.g. "Aug 4 – 10"
  isCurrentWeek: boolean;
  hasPlan: boolean;
};

export function WeekDayListClient({ days, weekNav }: { days: DayRowData[]; weekNav?: WeekNavData }) {
  const [selectedRide, setSelectedRide] = useState<RideSummary | null>(null);

  return (
    <>
      {/* Week navigation header */}
      {weekNav && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          {/* Prev week */}
          <a
            href={weekNav.prevWeekUrl}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--m-muted)", fontSize: 14, fontWeight: 700,
              textDecoration: "none", flexShrink: 0,
            }}
          >‹</a>

          {/* Week label + "Today" shortcut */}
          <div style={{ textAlign: "center", flex: 1, padding: "0 6px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: weekNav.isCurrentWeek ? "var(--m-text)" : "var(--m-muted)", letterSpacing: ".02em", lineHeight: 1 }}>
              {weekNav.isCurrentWeek ? "This week" : weekNav.weekLabel}
            </div>
            {!weekNav.isCurrentWeek && (
              <a
                href={weekNav.currentWeekUrl}
                style={{
                  fontSize: 10, fontWeight: 700, color: "#FF5A1F",
                  textDecoration: "none", letterSpacing: ".04em",
                  display: "block", marginTop: 3,
                }}
              >← Back to today</a>
            )}
          </div>

          {/* Next week */}
          <a
            href={weekNav.nextWeekUrl}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--m-muted)", fontSize: 14, fontWeight: 700,
              textDecoration: "none", flexShrink: 0,
            }}
          >›</a>
        </div>
      )}

      {/* No plan banner for future weeks */}
      {weekNav && !weekNav.isCurrentWeek && !weekNav.hasPlan && (
        <div style={{
          background: "rgba(255,90,31,0.06)", border: "1px solid rgba(255,90,31,0.15)",
          borderRadius: 8, padding: "12px 14px", marginBottom: 10, textAlign: "center",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#FF5A1F", marginBottom: 4 }}>No plan yet</div>
          <div style={{ fontSize: 11, color: "var(--m-muted)", lineHeight: 1.5 }}>
            Plan generates Sunday night or ask Marco to build it now
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {days.map(day => {
          const { dayName, date, dateNum, isToday, isRest, workoutTitle, zoneLabel, zoneColor, durationMin, status, ride } = day;
          const rowColor = isRest ? "var(--m-border)" : (zoneColor ?? "#FF5A1F");
          const isCompleted = status === "completed";
          const isClickable = isCompleted && !!ride;

          return (
            <div
              key={dayName}
              onClick={isClickable ? () => setSelectedRide(ride!) : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 4,
                background: isToday ? "var(--m-card-inner)" : "transparent",
                border: `1px solid ${isToday ? "var(--m-border)" : "transparent"}`,
                borderLeft: `3px solid ${isToday ? (isRest ? "var(--m-border)" : rowColor) : "transparent"}`,
                cursor: isClickable ? "pointer" : "default",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = "var(--m-card-inner)"; }}
              onMouseLeave={e => { if (isClickable && !isToday) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {/* Day bubble */}
              <div style={{
                width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                background: isToday ? (isRest ? "rgba(100,116,139,0.08)" : `${rowColor}14`) : "var(--m-card-inner)",
                border: `1px solid ${isToday ? (isRest ? "rgba(100,116,139,0.15)" : `${rowColor}25`) : "var(--m-border)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isToday ? (isRest ? "var(--m-muted)" : rowColor) : "var(--m-muted)",
                  textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1,
                }}>
                  {dayName.slice(0, 3)}
                </div>
                {dateNum != null && (
                  <div style={{
                    fontSize: 16, fontWeight: 900, lineHeight: 1, marginTop: 1,
                    color: isToday ? (isRest ? "var(--m-muted)" : rowColor) : "var(--m-muted)",
                  }}>
                    {dateNum}
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: isToday ? 700 : 500,
                  color: isRest ? "var(--m-muted)" : "var(--m-text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isRest ? "Rest" : workoutTitle}
                </div>
                {!isRest && zoneLabel && (
                  <div style={{ fontSize: 13, color: rowColor, marginTop: 2, fontWeight: 600 }}>
                    {zoneLabel}{durationMin && durationMin > 0 ? ` · ${durationMin}m` : ""}
                  </div>
                )}
              </div>

              {/* Status / tap hint */}
              {status === "completed" && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
                  {isClickable && (
                    <span style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 500 }}>›</span>
                  )}
                </div>
              )}
              {status === "missed" && (
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>

      <RideDetailPanel ride={selectedRide} onClose={() => setSelectedRide(null)} />
    </>
  );
}
