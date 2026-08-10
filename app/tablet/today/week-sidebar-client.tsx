"use client";

import { useState } from "react";
import { RideDetailPanel, type RideSummary } from "./ride-detail-panel";

export type { RideSummary };

export type PlannedWorkout = {
  title: string;
  description?: string;
  durationMin?: number;
  targetPowerPctFtp?: string;
  structure?: Array<{
    type: string;
    label?: string;
    durationMin?: number;
    powerFtp?: number;
    repeats?: number;
    onSec?: number;
    offSec?: number;
  }>;
};

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
  plannedWorkout?: PlannedWorkout;
};

export type WeekNavData = {
  prevWeekUrl: string;
  nextWeekUrl: string;
  currentWeekUrl: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  hasPlan: boolean;
};

function PlannedWorkoutPanel({ workout, onClose }: { workout: PlannedWorkout | null; onClose: () => void }) {
  if (!workout) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 340, maxHeight: "85vh", overflowY: "auto",
          background: "var(--m-card)", borderLeft: "1px solid var(--m-border)",
          borderTop: "1px solid var(--m-border)",
          padding: "20px 18px 32px",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-text)", lineHeight: 1.2 }}>
              {workout.title}
            </div>
            {workout.durationMin && workout.durationMin > 0 && (
              <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 4, fontWeight: 500 }}>
                {workout.durationMin} min
                {workout.targetPowerPctFtp ? ` · ${workout.targetPowerPctFtp} FTP` : ""}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
              color: "var(--m-muted)", borderRadius: 6, padding: "4px 10px",
              fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Structure blocks */}
        {workout.structure && workout.structure.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>
              Structure
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workout.structure.map((block, i) => {
                const isInterval = block.type === "intervals";
                const pct = block.powerFtp != null ? Math.round(block.powerFtp * 100) : null;
                const durationLabel = isInterval && block.onSec
                  ? `${block.repeats ?? 1}×${block.onSec}s`
                  : block.durationMin ? `${block.durationMin} min` : null;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 10px", borderRadius: 6,
                    background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                  }}>
                    <div style={{
                      width: 6, borderRadius: 3, alignSelf: "stretch", flexShrink: 0,
                      background: block.type === "warmup" ? "#f59e0b"
                        : block.type === "cooldown" ? "#6366f1"
                        : block.type === "intervals" ? "#FF5A1F"
                        : "#22c55e",
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--m-text)" }}>
                        {block.label ?? block.type}
                      </div>
                      {(durationLabel || pct) && (
                        <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>
                          {[durationLabel, pct ? `${pct}% FTP` : null].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {workout.description && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8 }}>
              Coach notes
            </div>
            <div style={{ fontSize: 13, color: "var(--m-muted)", lineHeight: 1.6 }}>
              {workout.description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WeekDayListClient({ days, weekNav }: { days: DayRowData[]; weekNav?: WeekNavData }) {
  const [selectedRide, setSelectedRide] = useState<RideSummary | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);

  return (
    <>
      {/* Week navigation header */}
      {weekNav && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
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

      {/* No plan banner */}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {days.map(day => {
          const { dayName, dateNum, isToday, isRest, workoutTitle, zoneLabel, durationMin, status, ride, plannedWorkout } = day;
          const isCompleted = status === "completed";
          const hasPlannedDetail = !isRest && !!plannedWorkout;
          const isClickable = (isCompleted && !!ride) || hasPlannedDetail;

          return (
            <div
              key={dayName}
              onClick={isClickable
                ? () => {
                    if (isCompleted && ride) setSelectedRide(ride);
                    else if (plannedWorkout) setSelectedWorkout(plannedWorkout);
                  }
                : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 6,
                background: isToday ? "var(--m-card-inner)" : "transparent",
                border: `1px solid ${isToday ? "rgba(255,90,31,0.50)" : "transparent"}`,
                cursor: isClickable ? "pointer" : "default",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { if (isClickable) (e.currentTarget as HTMLElement).style.background = "var(--m-card-inner)"; }}
              onMouseLeave={e => { if (isClickable && !isToday) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                background: "var(--m-card-inner)",
                border: `1px solid ${isToday ? "rgba(255,255,255,0.12)" : "var(--m-border)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: isToday ? "var(--m-text)" : "var(--m-muted)",
                  textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1,
                }}>
                  {dayName.slice(0, 3)}
                </div>
                {dateNum != null && (
                  <div style={{
                    fontSize: 16, fontWeight: 900, lineHeight: 1, marginTop: 1,
                    color: isToday ? "var(--m-text)" : "var(--m-muted)",
                  }}>
                    {dateNum}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: isToday ? 700 : 500,
                  color: isRest ? "var(--m-muted)" : "var(--m-text)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isRest ? "Rest" : workoutTitle}
                </div>
                {!isRest && zoneLabel && (
                  <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 3, fontWeight: 500 }}>
                    {zoneLabel}{durationMin && durationMin > 0 ? ` · ${durationMin}m` : ""}
                  </div>
                )}
              </div>

              {/* Status indicator + tap hint */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {status === "completed" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />}
                {status === "missed"    && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />}
                {isClickable && <span style={{ fontSize: 14, color: "var(--m-muted)", fontWeight: 500 }}>›</span>}
              </div>
            </div>
          );
        })}
      </div>

      <RideDetailPanel ride={selectedRide} onClose={() => setSelectedRide(null)} />
      <PlannedWorkoutPanel workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </>
  );
}
