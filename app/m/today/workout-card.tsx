"use client";

import { useState } from "react";
import WorkoutThumbnail from "@/app/dashboard/workout-thumbnail";
import MobileWorkoutChart from "./workout-chart";
import type { WeeklyWorkout } from "@/lib/ai";
import { structureToBlocks, computeIfTss } from "@/lib/zwo";

const ZONE_COLOR: Record<string, { accent: string; label: string }> = {
  sweetSpot:     { accent: "#3b82f6", label: "Sweet Spot" },
  threshold:     { accent: "#ef4444", label: "Threshold"  },
  vo2max:        { accent: "#22c55e", label: "VO2 Max"    },
  tempo:         { accent: "#f59e0b", label: "Tempo"      },
  endurance:     { accent: "#818cf8", label: "Endurance"  },
  neuromuscular: { accent: "#a855f7", label: "Neuro"      },
  rest:          { accent: "#475569", label: "Rest"       },
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

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

interface Props {
  workout: WeeklyWorkout;
  weekWorkouts: WeeklyWorkout[];
  today: string;
}

export default function MobileWorkoutCard({ workout, weekWorkouts, today }: Props) {
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
    <div style={{ padding: "16px 16px 0" }}>

      {/* ── Date header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, letterSpacing: ".4px", textTransform: "uppercase" }}>
          {formatDay(today)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          Today&apos;s Workout
        </div>
      </div>

      {/* ── Main workout card ────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 24,
        overflow: "hidden",
        background: "#050c18",
        border: `1px solid ${colors.accent}33`,
        boxShadow: `0 4px 40px ${colors.accent}18, 0 0 0 1px ${colors.accent}15`,
        marginBottom: 12,
      }}>
        {/* Zone badge */}
        {!isRest && (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", zIndex: 10,
              top: 12, left: 14,
              background: "rgba(5,12,24,0.75)",
              border: `1px solid ${colors.accent}55`,
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 11, fontWeight: 700,
              color: colors.accent,
              letterSpacing: ".5px",
              textTransform: "uppercase",
              backdropFilter: "blur(10px)",
            }}>
              {colors.label}
            </div>

            {/* Rich power chart if structure available, else thumbnail fallback */}
            {workout.structure && workout.structure.length > 0 ? (
              <MobileWorkoutChart
                blocks={workout.structure}
                durationMin={workout.durationMin}
              />
            ) : (
              <div style={{ height: 160, position: "relative", overflow: "hidden" }}>
                <WorkoutThumbnail workout={workout} flush height={160} hideFooter />
              </div>
            )}
          </div>
        )}

        {isRest && (
          <div style={{
            height: 100, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 52, background: "#0a0f1a",
          }}>
            🛌
          </div>
        )}

        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{
            fontSize: 22, fontWeight: 800, color: "#f8fafc",
            lineHeight: 1.15, letterSpacing: "-.3px",
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

      {/* ── Structure blocks (compact) ──────────────────────────────────── */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: "#475569",
            letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8,
          }}>
            Blocks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {workout.structure.map((block, i) => {
              const pct = Math.round((block.powerFtp ?? 0) * 100);
              // Pick color from power level
              const barColor =
                pct >= 120 ? "#ef4444" :
                pct >= 106 ? "#f97316" :
                pct >= 95  ? "#f59e0b" :
                pct >= 88  ? "#10b981" :
                pct >= 76  ? "#22d3ee" :
                pct >= 56  ? "#3b82f6" : "#64748b";
              const dur = block.durationMin ?? 0;
              const label = block.label || block.type;
              const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
              const repDetail = block.type === "intervals" && block.onSec
                ? ` (${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)}min)`
                : "";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#0f172a", borderRadius: 12, padding: "9px 14px",
                  border: "1px solid #1e293b",
                }}>
                  <div style={{ width: 3, height: 24, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.2 }}>
                      {reps}{label}{repDetail}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                      {dur} min{pct > 0 ? ` · ${pct}% FTP` : ""}
                      {block.recoveryPowerFtp ? ` / ${Math.round(block.recoveryPowerFtp * 100)}% rec` : ""}
                    </div>
                  </div>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                    background: `${barColor}18`,
                    border: `1px solid ${barColor}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: barColor,
                  }}>
                    {pct}%
                  </div>
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
              width: "100%", padding: "16px", borderRadius: 16, border: "none",
              fontSize: 16, fontWeight: 700, cursor: pushState === "idle" ? "pointer" : "default",
              marginBottom: 10, transition: "all .2s",
              background:
                pushState === "done"    ? "#166534" :
                pushState === "error"   ? "#7f1d1d" :
                pushState === "sending" ? "#1d4ed8" : colors.accent,
              color: "#fff", letterSpacing: "-.1px",
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
              padding: "14px", background: "#111827", border: "1px solid #1e293b",
              borderRadius: 14, color: noteState === "done" ? "#4ade80" : "#94a3b8",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            {noteState === "done" ? "Noted 👍" : "😓  Tired"}
          </button>
          <button
            onClick={() => sendNote("Skipping today's workout")}
            style={{
              padding: "14px", background: "#111827", border: "1px solid #1e293b",
              borderRadius: 14, color: "#94a3b8",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            ⏭  Skip today
          </button>
        </div>
      </div>

      {/* ── Week strip ──────────────────────────────────────────────────── */}
      <div style={{
        background: "#111827", borderRadius: 16, padding: "14px 16px",
        border: "1px solid #1e293b", marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: "#475569",
          letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 10,
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
                  width: 34, height: 34, borderRadius: "50%",
                  background: isToday ? col.accent : isRestDay ? "#1e293b" : `${col.accent}22`,
                  border: isToday
                    ? `2px solid ${col.accent}`
                    : `1px solid ${isRestDay ? "#334155" : col.accent + "44"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: isToday ? 800 : 500,
                    color: isToday ? "#0a0f1a" : isRestDay ? "#475569" : col.accent,
                  }}>
                    {abbr}
                  </span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 600,
                  color: isToday ? col.accent : "#334155",
                  textTransform: "uppercase", letterSpacing: ".3px",
                }}>
                  {isRestDay ? "·" : z === "sweetSpot" ? "SS" : z === "threshold" ? "TH" : z === "vo2max" ? "VO2" : z === "tempo" ? "TM" : z === "neuromuscular" ? "NM" : "Z2"}
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
      background: "#1e293b", borderRadius: 12, padding: "8px 14px",
      textAlign: "center", border: "1px solid #334155",
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? "#f1f5f9", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
        {unit}
      </div>
    </div>
  );
}
