"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RideDetailPanel, type RideSummary } from "./ride-detail-panel";
import type { WorkoutStructureBlock } from "@/lib/zwo";

// MobileWorkoutChart is a heavy SVG component — load lazily so sidebar stays fast
const MobileWorkoutChart = dynamic(() => import("@/app/m/today/workout-chart"), { ssr: false });

export type { RideSummary };

export type PlannedWorkout = {
  title: string;
  description?: string;
  durationMin?: number;
  targetPowerPctFtp?: string;
  isRunning?: boolean;
  structure?: WorkoutStructureBlock[];
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

// ── Centered workout chart modal ─────────────────────────────────────────────
function WorkoutChartModal({ workout, onClose }: { workout: PlannedWorkout | null; onClose: () => void }) {
  if (!workout) return null;

  const hasChart = workout.structure && workout.structure.length > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.80)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 32px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(720px, 90vw)",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--m-card)",
          borderRadius: 16,
          border: "1px solid var(--m-border)",
          padding: "28px 28px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--m-text)", lineHeight: 1.15 }}>
              {workout.title}
            </div>
            <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 5, fontWeight: 500 }}>
              {[
                workout.durationMin && workout.durationMin > 0 ? `${workout.durationMin} min` : null,
                workout.targetPowerPctFtp ? `Target: ${workout.targetPowerPctFtp} FTP` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--m-card-inner)",
              border: "1px solid var(--m-border)",
              color: "var(--m-muted)",
              borderRadius: 8,
              width: 36, height: 36,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, cursor: "pointer", flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Workout chart — the main reason this modal exists */}
        {hasChart && (
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--m-border)" }}>
            <MobileWorkoutChart
              blocks={workout.structure!}
              durationMin={workout.durationMin ?? 60}
              isRunning={workout.isRunning ?? false}
            />
          </div>
        )}

        {/* Description */}
        {workout.description && (
          <div style={{
            background: "var(--m-card-inner)",
            borderRadius: 10,
            padding: "14px 16px",
            border: "1px solid var(--m-border)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "var(--m-muted)",
              textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 8,
            }}>
              Coach notes
            </div>
            <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.65 }}>
              {workout.description}
            </div>
          </div>
        )}

        {/* Interval structure list (only when no chart) */}
        {!hasChart && workout.structure && workout.structure.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workout.structure.map((block, i) => {
              const pct = block.powerFtp != null ? Math.round(block.powerFtp * 100) : null;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 8,
                  background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                }}>
                  <div style={{
                    width: 6, borderRadius: 3, alignSelf: "stretch", flexShrink: 0,
                    background: block.type === "warmup" ? "#f59e0b"
                      : block.type === "cooldown" ? "#6366f1"
                      : block.type === "intervals" ? "#ef4444"
                      : "#22c55e",
                  }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)" }}>
                      {block.label ?? block.type}
                      {block.type === "intervals" && block.repeats ? ` × ${block.repeats}` : ""}
                    </div>
                    {(block.durationMin || pct) && (
                      <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>
                        {[block.durationMin ? `${block.durationMin} min` : null, pct ? `${pct}% FTP` : null].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main sidebar list component ───────────────────────────────────────────────
export function WeekDayListClient({ days, weekNav }: { days: DayRowData[]; weekNav?: WeekNavData }) {
  const [selectedRide, setSelectedRide] = useState<RideSummary | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<PlannedWorkout | null>(null);

  return (
    <>
      {/* Week navigation */}
      {weekNav && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <a href={weekNav.prevWeekUrl} style={navBtnStyle}>‹</a>
          <div style={{ textAlign: "center", flex: 1, padding: "0 6px" }}>
            <div style={{
              fontSize: 12, fontWeight: 800,
              color: weekNav.isCurrentWeek ? "var(--m-text)" : "var(--m-muted)",
              letterSpacing: ".02em", lineHeight: 1,
            }}>
              {weekNav.isCurrentWeek ? "This week" : weekNav.weekLabel}
            </div>
            {!weekNav.isCurrentWeek && (
              <a href={weekNav.currentWeekUrl} style={{
                fontSize: 10, fontWeight: 700, color: "#FF5A1F",
                textDecoration: "none", letterSpacing: ".04em",
                display: "block", marginTop: 3,
              }}>← Back to today</a>
            )}
          </div>
          <a href={weekNav.nextWeekUrl} style={navBtnStyle}>›</a>
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
            Plan generates Sunday night or tap Generate in settings
          </div>
        </div>
      )}

      {/* Day rows */}
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
                    if (isCompleted && ride) { setSelectedRide(ride); }
                    else if (plannedWorkout) { setSelectedWorkout(plannedWorkout); }
                  }
                : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 6,
                background: isToday ? "var(--m-card-inner)" : "transparent",
                border: `1px solid ${isToday ? "rgba(255,90,31,0.50)" : "transparent"}`,
                cursor: isClickable ? "pointer" : "default",
              }}
            >
              {/* Date badge */}
              <div style={{
                width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                background: "var(--m-card-inner)",
                border: `1px solid ${isToday ? "rgba(255,255,255,0.12)" : "var(--m-border)"}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1,
                  color: isToday ? "var(--m-text)" : "var(--m-muted)",
                }}>{dayName.slice(0, 3)}</div>
                {dateNum != null && (
                  <div style={{
                    fontSize: 16, fontWeight: 900, lineHeight: 1, marginTop: 1,
                    color: isToday ? "var(--m-text)" : "var(--m-muted)",
                  }}>{dateNum}</div>
                )}
              </div>

              {/* Workout info */}
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

              {/* Status dot + tap arrow */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {status === "completed" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />}
                {status === "missed"    && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />}
                {isClickable && <span style={{ fontSize: 14, color: "var(--m-muted)" }}>›</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <RideDetailPanel ride={selectedRide} onClose={() => setSelectedRide(null)} />
      <WorkoutChartModal workout={selectedWorkout} onClose={() => setSelectedWorkout(null)} />
    </>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--m-muted)", fontSize: 14, fontWeight: 700,
  textDecoration: "none", flexShrink: 0,
};
