"use client";

import { useState } from "react";
import WorkoutThumbnail from "@/app/dashboard/workout-thumbnail";
import type { WeeklyWorkout } from "@/lib/ai";
import { structureToBlocks, computeIfTss } from "@/lib/zwo";

/* ── Zone colors ──────────────────────────────────────────────────────────── */
const ZONE_COLOR: Record<string, { accent: string; bg: string; label: string }> = {
  sweetSpot:     { accent: "#3b82f6", bg: "#0f172a", label: "Sweet Spot" },
  threshold:     { accent: "#ef4444", bg: "#0f172a", label: "Threshold" },
  vo2max:        { accent: "#22c55e", bg: "#0f172a", label: "VO2 Max" },
  tempo:         { accent: "#f59e0b", bg: "#0f172a", label: "Tempo" },
  endurance:     { accent: "#818cf8", bg: "#0f172a", label: "Endurance" },
  neuromuscular: { accent: "#a855f7", bg: "#0f172a", label: "Neuromuscular" },
  rest:          { accent: "#475569", bg: "#0f172a", label: "Rest" },
};

function detectZone(workout: WeeklyWorkout): string {
  const t = (workout.title + " " + (workout.type ?? "")).toLowerCase();
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
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface Props {
  workout: WeeklyWorkout;
  weekWorkouts: WeeklyWorkout[];
  today: string;
}

export default function WorkoutCard({ workout, weekWorkouts, today }: Props) {
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
        body: JSON.stringify({ note }),
      });
      setNoteState("done");
    } catch {
      setNoteState("idle");
    }
  }

  const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];
  const PLAN_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div style={{
      minHeight: "100svh",
      background: "#0a0f1a",
      display: "flex",
      flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 20px 0",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500, letterSpacing: ".3px" }}>
            {formatDay(today)}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", letterSpacing: "-.3px" }}>
            Today&apos;s Workout
          </div>
        </div>
        <a
          href="/dashboard"
          style={{
            fontSize: 13, fontWeight: 600,
            color: "#64748b",
            background: "#1e293b",
            padding: "8px 14px",
            borderRadius: 20,
            textDecoration: "none",
            border: "1px solid #334155",
          }}
        >
          Week view
        </a>
      </div>

      {/* ── Main card ────────────────────────────────────────────────────── */}
      <div style={{
        margin: "16px 16px 12px",
        borderRadius: 24,
        overflow: "hidden",
        background: "#111827",
        border: `1px solid ${colors.accent}33`,
        boxShadow: `0 0 40px ${colors.accent}18`,
        flex: "none",
      }}>
        {/* Power profile thumbnail */}
        {!isRest && (
          <div style={{ height: 160, position: "relative", overflow: "hidden" }}>
            <WorkoutThumbnail workout={workout} flush height={160} hideFooter />
            {/* Zone badge overlay */}
            <div style={{
              position: "absolute", top: 12, left: 14,
              background: `${colors.accent}22`,
              border: `1px solid ${colors.accent}55`,
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 11, fontWeight: 700,
              color: colors.accent,
              letterSpacing: ".5px",
              textTransform: "uppercase",
              backdropFilter: "blur(8px)",
            }}>
              {colors.label}
            </div>
          </div>
        )}

        {isRest && (
          <div style={{
            height: 120,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 56,
          }}>
            🛌
          </div>
        )}

        {/* Title + stats */}
        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{
            fontSize: 24, fontWeight: 800,
            color: "#f8fafc",
            lineHeight: 1.15,
            letterSpacing: "-.4px",
            marginBottom: isRest ? 0 : 14,
          }}>
            {workout.title}
          </div>

          {!isRest && (
            <div style={{ display: "flex", gap: 10 }}>
              {workout.durationMin > 0 && (
                <StatPill value={`${workout.durationMin}`} unit="min" />
              )}
              {ifTss && (
                <StatPill value={`${Math.round(ifTss.tss)}`} unit="TSS" />
              )}
              {workout.targetPowerPctFtp && (
                <StatPill value={workout.targetPowerPctFtp} unit="FTP" accent={colors.accent} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Interval breakdown ───────────────────────────────────────────── */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ margin: "0 16px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8 }}>
            Structure
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {workout.structure.map((block, i) => {
              const pct = Math.round((block.powerFtp ?? 0) * 100);
              const barColor =
                pct >= 106 ? "#22c55e" :
                pct >= 97  ? "#ef4444" :
                pct >= 88  ? "#3b82f6" :
                pct >= 76  ? "#f59e0b" :
                              "#6b7280";
              const dur = block.durationMin ?? 0;
              const label = block.label ?? block.type ?? "";
              const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: "#111827",
                  borderRadius: 12,
                  padding: "10px 14px",
                  border: "1px solid #1e293b",
                }}>
                  <div style={{
                    width: 4, height: 28, borderRadius: 2,
                    background: barColor, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.2 }}>
                      {reps}{label}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      {dur} min{pct > 0 ? ` · ${pct}% FTP` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Spacer ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 16px", marginBottom: 12 }}>
        {!isRest && (
          <button
            onClick={pushToZwift}
            disabled={pushState !== "idle"}
            style={{
              width: "100%",
              padding: "17px",
              borderRadius: 16,
              border: "none",
              fontSize: 17,
              fontWeight: 700,
              cursor: pushState === "idle" ? "pointer" : "default",
              marginBottom: 10,
              transition: "all .2s",
              background:
                pushState === "done"  ? "#166534" :
                pushState === "error" ? "#7f1d1d" :
                pushState === "sending" ? "#1d4ed8" :
                colors.accent,
              color: "#fff",
              letterSpacing: "-.1px",
            }}
          >
            {pushState === "idle"    ? "Send to Zwift" :
             pushState === "sending" ? "Sending…" :
             pushState === "done"    ? "✓ On your Zwift calendar" :
                                      "Try again"}
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={() => sendNote("Feeling tired today, please adjust intensity")}
            style={{
              padding: "14px",
              background: "#111827",
              border: "1px solid #1e293b",
              borderRadius: 14,
              color: noteState === "done" ? "#4ade80" : "#94a3b8",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {noteState === "done" ? "Noted 👍" : "😓  Tired"}
          </button>
          <button
            onClick={() => sendNote("Skipping today's workout")}
            style={{
              padding: "14px",
              background: "#111827",
              border: "1px solid #1e293b",
              borderRadius: 14,
              color: "#94a3b8",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ⏭  Skip today
          </button>
        </div>
      </div>

      {/* ── Week strip ───────────────────────────────────────────────────── */}
      <div style={{
        padding: "14px 20px 20px",
        borderTop: "1px solid #1e293b",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 6,
        }}>
          {PLAN_DAYS.map((dayName, i) => {
            const w = weekWorkouts.find(x => x.day === dayName);
            const z = w ? detectZone(w) : "rest";
            const col = ZONE_COLOR[z] ?? ZONE_COLOR.rest;
            const isToday = w?.date === today;
            const abbr = DAY_ABBR[(i + 1) % 7]; // Mon=M, Tue=T, etc.
            const isRestDay = z === "rest" || !w;

            return (
              <div key={dayName} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 36, height: 36,
                  borderRadius: "50%",
                  background: isToday ? col.accent : isRestDay ? "#1e293b" : `${col.accent}22`,
                  border: isToday ? `2px solid ${col.accent}` : `1px solid ${isRestDay ? "#334155" : col.accent + "44"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 500,
                    color: isToday ? "#0a0f1a" : isRestDay ? "#475569" : col.accent,
                  }}>
                    {abbr}
                  </span>
                </div>
                <div style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isToday ? col.accent : "#334155",
                  textTransform: "uppercase",
                  letterSpacing: ".3px",
                }}>
                  {isRestDay ? "·" : z === "sweetSpot" ? "SS" : z === "threshold" ? "THR" : z === "vo2max" ? "VO2" : z === "tempo" ? "TMP" : z === "neuromuscular" ? "NM" : "Z2"}
                </div>
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
      background: "#1e293b",
      borderRadius: 12,
      padding: "8px 14px",
      textAlign: "center",
      border: "1px solid #334155",
    }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ?? "#f1f5f9", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 500 }}>
        {unit}
      </div>
    </div>
  );
}
