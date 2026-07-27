"use client";

import { useState } from "react";
import MobileWorkoutChart from "./workout-chart";
import type { WeeklyWorkout } from "@/lib/ai";
import { structureToBlocks, computeIfTss, isRunWorkout } from "@/lib/zwo";
import type { DayStatus } from "@/lib/activity-sync";

const ZONE_COLOR: Record<string, { accent: string; label: string }> = {
  sweetSpot:     { accent: "#10b981", label: "Sweet Spot" },
  threshold:     { accent: "#FF5A1F", label: "Threshold"  },
  vo2max:        { accent: "#ef4444", label: "VO2 Max"    },
  tempo:         { accent: "#00C2FF", label: "Tempo"      },
  endurance:     { accent: "#64748b", label: "Endurance"  },
  neuromuscular: { accent: "#a855f7", label: "Neuro"      },
  rest:          { accent: "#94a3b8", label: "Rest"       },
};

function detectZone(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "sweetSpot";
  if (t.includes("threshold") || t.includes("ftp")) return "threshold";
  if (t.includes("vo2") || t.includes("norwegian") || t.includes("60/60")) return "vo2max";
  if (t.includes("tempo")) return "tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "neuromuscular";
  if (t.includes("rest") || t.includes("recovery") || t.includes("off")) return "rest";
  return "endurance";
}

interface Props {
  workout: WeeklyWorkout;
  weekWorkouts: WeeklyWorkout[];
  today: string;
  todayStatus?: DayStatus;
  weekStatus?: Record<string, DayStatus>;
}

export default function MobileWorkoutCard({ workout, weekWorkouts, today, todayStatus = "planned", weekStatus = {} }: Props) {
  const [pushState, setPushState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [noteState, setNoteState] = useState<"idle" | "sending" | "done">("idle");

  const zone = detectZone(workout);
  const colors = ZONE_COLOR[zone] ?? ZONE_COLOR.endurance;
  const isRest = zone === "rest";

  const ifTss = workout.structure && workout.structure.length > 0
    ? computeIfTss(structureToBlocks(workout.structure))
    : null;

  async function pushToZwift() {
    if (pushState !== "idle") return;
    setPushState("sending");
    try {
      const res = await fetch("/api/intervals/push-workout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutDay: today,
          title: workout.title,
          description: workout.description ?? "",
          durationMin: workout.durationMin ?? 60,
          type: workout.type ?? "Bike",
          targetPower: workout.targetPowerPctFtp,
          structure: workout.structure,
        }),
      });
      const data = await res.json();
      setPushState(data.ok ? "done" : "error");
    } catch {
      setPushState("error");
    }
  }

  async function sendNote(note: string) {
    if (noteState !== "idle") return;
    setNoteState("sending");
    try {
      await fetch("/api/ai/coaching-note", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, date: today }),
      });
      setNoteState("done");
    } catch {
      setNoteState("idle");
    }
  }

  const PLAN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY_ABBR  = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div style={{ padding: "14px 16px 0" }}>

      {/* ── Section label ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
          color: "#94a3b8", textTransform: "uppercase",
        }}>
          Today&apos;s Workout
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: isRunWorkout(workout.type) ? "#ea580c" : "#FF5A1F",
          background: isRunWorkout(workout.type) ? "#fff3ee" : "#fff3ee",
          border: "1px solid #ffd5c2",
          borderRadius: 20, padding: "2px 9px",
        }}>
          {isRunWorkout(workout.type) ? "🏃 Run" : "🚴 Ride"}
        </span>
        {todayStatus === "completed" && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#16a34a",
            background: "#dcfce7", border: "1px solid #bbf7d0",
            borderRadius: 20, padding: "2px 9px",
          }}>Done ✓</span>
        )}
        {todayStatus === "missed" && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#dc2626",
            background: "#fee2e2", border: "1px solid #fca5a5",
            borderRadius: 20, padding: "2px 9px",
          }}>Missed</span>
        )}
      </div>

      {/* ── Main workout card ────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 20,
        overflow: "hidden",
        background: "#fff",
        border: "1px solid #e4e9f0",
        borderTop: `3px solid ${colors.accent}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        marginBottom: 12,
      }}>
        {/* Zone badge + chart */}
        {!isRest && (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", zIndex: 10,
              top: 10, left: 12,
              background: "rgba(255,255,255,0.92)",
              border: `1px solid ${colors.accent}40`,
              borderRadius: 7,
              padding: "4px 10px",
              fontSize: 12, fontWeight: 700,
              color: colors.accent,
              letterSpacing: ".4px",
              textTransform: "uppercase",
            }}>
              {colors.label}
            </div>
            {workout.structure && workout.structure.length > 0 ? (
              <MobileWorkoutChart
                blocks={workout.structure}
                durationMin={workout.durationMin}
              />
            ) : (
              <div style={{ height: 120, background: `${colors.accent}08`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 40 }}>🚴</span>
              </div>
            )}
          </div>
        )}

        {isRest && (
          <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontSize: 40 }}>
            🛌
          </div>
        )}

        <div style={{ padding: "14px 18px 18px" }}>
          <div style={{
            fontSize: 22, fontWeight: 800, color: "#0f172a",
            lineHeight: 1.2, letterSpacing: "-0.3px",
            marginBottom: isRest ? 0 : 12,
          }}>
            {workout.title}
          </div>

          {!isRest && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {workout.durationMin > 0 && <StatPill value={`${workout.durationMin}`} unit="min" />}
              {ifTss && <StatPill value={`${Math.round(ifTss.tss)}`} unit="TSS" />}
              {ifTss && <StatPill value={ifTss.intensityFactor.toFixed(2)} unit="IF" accent={colors.accent} />}
              {workout.targetPowerPctFtp && (
                <StatPill value={workout.targetPowerPctFtp} unit="FTP" accent={colors.accent} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Description ─────────────────────────────────────────────────── */}
      {!isRest && workout.description && (
        <div style={{
          background: "#f8fafc", border: "1px solid #e4e9f0",
          borderRadius: 14, padding: "13px 16px", marginBottom: 12,
          fontSize: 15, color: "#475569", lineHeight: 1.65,
        }}>
          {workout.description}
        </div>
      )}

      {/* ── Structure blocks ─────────────────────────────────────────────── */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: "#94a3b8",
            letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 8,
          }}>
            Session structure
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {workout.structure.map((block, i) => {
              const pct = Math.round((block.powerFtp ?? 0) * 100);
              const barColor =
                pct >= 120 ? "#ef4444" :
                pct >= 106 ? "#f97316" :
                pct >= 95  ? "#f59e0b" :
                pct >= 88  ? "#10b981" :
                pct >= 76  ? "#22d3ee" :
                pct >= 56  ? "#3b82f6" : "#94a3b8";
              const dur = block.durationMin ?? 0;
              const label = block.label || block.type;
              const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
              const repDetail = block.type === "intervals" && block.onSec
                ? ` (${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)}min)`
                : "";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#fff", borderRadius: 12, padding: "11px 14px",
                  border: "1px solid #e4e9f0",
                  borderLeft: `3px solid ${barColor}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", lineHeight: 1.2 }}>
                      {reps && <span style={{ color: barColor, marginRight: 3 }}>{reps}</span>}
                      {label}{repDetail}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {dur} min{pct > 0 ? ` · ${pct}% FTP` : ""}
                      {block.recoveryPowerFtp ? ` / ${Math.round(block.recoveryPowerFtp * 100)}% rec` : ""}
                    </div>
                  </div>
                  {pct > 0 && (
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: barColor,
                      background: `${barColor}14`, border: `1px solid ${barColor}30`,
                      borderRadius: 7, padding: "3px 8px", flexShrink: 0,
                    }}>
                      {pct}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        {!isRest && (
          <button
            onClick={pushToZwift}
            disabled={pushState !== "idle"}
            style={{
              width: "100%", padding: "16px", borderRadius: 14, border: "none",
              fontSize: 16, fontWeight: 700, cursor: pushState === "idle" ? "pointer" : "default",
              marginBottom: 10, transition: "all .2s",
              background:
                pushState === "done"    ? "#16a34a" :
                pushState === "error"   ? "#dc2626" :
                pushState === "sending" ? "#94a3b8" : "#FF5A1F",
              color: "#fff",
            }}
          >
            {pushState === "idle"    ? "Send to Zwift" :
             pushState === "sending" ? "Sending…" :
             pushState === "done"    ? "✓ On your Zwift calendar" : "Try again"}
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={() => sendNote("Feeling tired today, please adjust intensity")}
            style={{
              padding: "13px", background: "#f1f5f9", border: "1px solid #e4e9f0",
              borderRadius: 12, color: noteState === "done" ? "#16a34a" : "#475569",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            {noteState === "done" ? "Noted 👍" : "😓  Tired today"}
          </button>
          <button
            onClick={() => sendNote("Skipping today's workout")}
            style={{
              padding: "13px", background: "#f1f5f9", border: "1px solid #e4e9f0",
              borderRadius: 12, color: "#475569",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            ⏭  Skip today
          </button>
        </div>
      </div>

      {/* ── Week strip ──────────────────────────────────────────────────── */}
      <div style={{
        background: "#f8fafc", borderRadius: 16, padding: "14px 14px",
        border: "1px solid #e4e9f0", marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: "#94a3b8",
          letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10,
        }}>
          This week
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {PLAN_DAYS.map((dayName, i) => {
            const w = weekWorkouts.find(x => x.day === dayName);
            const z = w ? detectZone(w) : "rest";
            const col = ZONE_COLOR[z] ?? ZONE_COLOR.rest;
            const isToday = w?.date === today;
            const isRestDay = z === "rest" || !w;
            const abbr = DAY_ABBR[i];

            return (
              <div key={dayName} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isToday ? col.accent : isRestDay ? "#e4e9f0" : `${col.accent}18`,
                  border: isToday ? `2px solid ${col.accent}` : `1px solid ${isRestDay ? "#cbd5e1" : col.accent + "40"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: isToday ? 800 : 500,
                    color: isToday ? "#fff" : isRestDay ? "#94a3b8" : col.accent,
                  }}>
                    {abbr}
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: isToday ? col.accent : "#94a3b8",
                  textTransform: "uppercase", letterSpacing: ".2px",
                }}>
                  {isRestDay ? "·" : z === "sweetSpot" ? "SS" : z === "threshold" ? "TH" : z === "vo2max" ? "V2" : z === "tempo" ? "TM" : z === "neuromuscular" ? "NM" : "Z2"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function StatPill({ value, unit, accent }: { value: string; unit: string; accent?: string }) {
  return (
    <div style={{
      background: "#f1f5f9", borderRadius: 10, padding: "8px 14px",
      textAlign: "center", border: "1px solid #e4e9f0",
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ?? "#0f172a", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, fontWeight: 500 }}>
        {unit}
      </div>
    </div>
  );
}
