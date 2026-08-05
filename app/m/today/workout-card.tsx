"use client";

import { useState } from "react";
import MobileWorkoutChart from "./workout-chart";
import type { WeeklyWorkout } from "@/lib/ai";
import { structureToBlocks, computeIfTss, isRunWorkout } from "@/lib/zwo";
import type { DayStatus } from "@/lib/activity-sync";

const ZONE_LABEL: Record<string, string> = {
  sweetSpot:     "Sweet Spot",
  threshold:     "Threshold",
  vo2max:        "VO2 Max",
  tempo:         "Tempo",
  endurance:     "Endurance",
  neuromuscular: "Neuromuscular",
  easyRun:       "Easy Run",
  tempoRun:      "Tempo Run",
  intervalRun:   "Intervals",
  longRun:       "Long Run",
  walkRun:       "Walk/Run",
  recoveryRun:   "Recovery",
  rest:          "Rest",
};

function detectZone(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("long run"))      return "longRun";
  if (t.includes("tempo run") || (t.includes("tempo") && t.includes("run"))) return "tempoRun";
  if (t.includes("interval run"))  return "intervalRun";
  if (t.includes("walk/run") || t.includes("walk run")) return "walkRun";
  if (t.includes("recovery run"))  return "recoveryRun";
  if (t.includes("easy run"))      return "easyRun";
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "sweetSpot";
  if (t.includes("threshold") || t.includes("ftp")) return "threshold";
  if (t.includes("vo2") || t.includes("norwegian")) return "vo2max";
  if (t.includes("tempo"))         return "tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "neuromuscular";
  if (t.includes("rest") || t.includes("recovery") || t.includes("off")) return "rest";
  return "endurance";
}

const BAR_COLOR = (pct: number) =>
  pct >= 120 ? "#ef4444" :
  pct >= 106 ? "#FF5A1F" :
  pct >= 95  ? "rgba(255,90,31,0.88)" :
  pct >= 88  ? "rgba(255,90,31,0.75)" :
  pct >= 76  ? "rgba(255,90,31,0.72)" :
  pct >= 56  ? "rgba(255,255,255,0.16)" :
               "rgba(255,255,255,0.08)";

interface Props {
  workout: WeeklyWorkout;
  weekWorkouts: WeeklyWorkout[];
  today: string;
  todayStatus?: DayStatus;
  weekStatus?: Record<string, DayStatus>;
}

const PLAN_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_ABBR  = ["M","T","W","T","F","S","S"];

export default function MobileWorkoutCard({
  workout, weekWorkouts, today, todayStatus = "planned", weekStatus = {},
}: Props) {
  const [noteState, setNoteState] = useState<"idle"|"sending"|"done">("idle");
  const [structureOpen, setStructureOpen] = useState(false);

  const zone   = detectZone(workout);
  const isRest = zone === "rest";
  const zoneLabel = ZONE_LABEL[zone] ?? "Structured";
  const isRun  = isRunWorkout(workout.type) || isRunWorkout(workout.title);

  const ifTss = workout.structure && workout.structure.length > 0
    ? computeIfTss(structureToBlocks(workout.structure)) : null;

  async function sendNote(note: string) {
    if (noteState !== "idle") return;
    setNoteState("sending");
    try {
      await fetch("/api/ai/coaching-note", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, date: today }),
      });
      setNoteState("done");
    } catch { setNoteState("idle"); }
  }

  return (
    <div style={{ padding: "0 0 32px" }}>

      {/* TODAY badge */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{
          display: "inline-flex", alignItems: "center",
          fontSize: 12, fontWeight: 800, color: "#FF5A1F",
          background: "rgba(255,90,31,0.10)", border: "1px solid rgba(255,90,31,0.28)",
          borderRadius: 4, padding: "4px 12px", letterSpacing: ".1em",
          textTransform: "uppercase",
        }}>
          Today
        </div>
      </div>

      {/* ── Workout header ──────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px 24px" }}>

        {/* Meta row: zone · type · status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: "var(--m-muted)",
            textTransform: "uppercase", letterSpacing: "1.2px",
          }}>
            {zoneLabel}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--m-muted)", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--m-muted)", letterSpacing: ".5px" }}>
            {isRun ? "Run" : "Ride"}
          </span>
          {todayStatus === "completed" && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>Done</span>
            </>
          )}
          {todayStatus === "missed" && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#ef4444", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>Missed</span>
            </>
          )}
        </div>

        {/* Workout title — dominant */}
        <div style={{
          fontSize: 36, fontWeight: 900, color: "var(--m-text)",
          letterSpacing: "-1px", lineHeight: 1.05, marginBottom: 10,
        }}>
          {isRest ? "Rest Day" : workout.title}
        </div>

        {/* Duration — clean, large */}
        {!isRest && workout.durationMin > 0 && (
          <div style={{ fontSize: 17, color: "var(--m-muted)", fontWeight: 500 }}>
            {workout.durationMin} min
          </div>
        )}
      </div>

      {/* ── Chart ───────────────────────────────────────────────────── */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ marginBottom: 0 }}>
          <MobileWorkoutChart blocks={workout.structure} durationMin={workout.durationMin} />
        </div>
      )}
      {isRest && (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
          🛌
        </div>
      )}

      {/* ── Stats strip ─────────────────────────────────────────────── */}
      {!isRest && (ifTss || workout.targetPowerPctFtp) && (
        <div style={{
          display: "flex", alignItems: "stretch",
          borderTop: "1px solid var(--m-border)",
          borderBottom: "1px solid var(--m-border)",
          margin: "0",
        }}>
          {workout.durationMin > 0 && (
            <StatCell value={String(workout.durationMin)} label="MIN" />
          )}
          {ifTss && (
            <>
              <StatCell value={String(Math.round(ifTss.tss))} label="TSS" divider />
              <StatCell value={ifTss.intensityFactor.toFixed(2)} label="IF" divider accent />
            </>
          )}
          {workout.targetPowerPctFtp && (
            <StatCell value={workout.targetPowerPctFtp} label="% FTP" divider accent />
          )}
        </div>
      )}

      {/* ── Structure accordion ─────────────────────────────────────── */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ padding: "0 24px", marginTop: 24 }}>
          <button
            onClick={() => setStructureOpen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0",
              background: "none", border: "none", borderBottom: structureOpen ? "none" : "1px solid var(--m-border)",
              color: "var(--m-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer",
              letterSpacing: "1px", textTransform: "uppercase",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span>Session Structure</span>
            <span style={{
              fontSize: 20, lineHeight: 1, color: "var(--m-muted)",
              transform: structureOpen ? "rotate(45deg)" : "none",
              transition: "transform .2s",
              display: "inline-block",
            }}>+</span>
          </button>
          {structureOpen && (
            <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--m-border)", paddingBottom: 8 }}>
              {workout.structure.map((block, i) => {
                const pct = Math.round((block.powerFtp ?? 0) * 100);
                const barColor = BAR_COLOR(pct);
                const dur = block.durationMin ?? 0;
                const label = block.label || block.type;
                const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                const repDetail = block.type === "intervals" && block.onSec
                  ? ` (${Math.round(block.onSec/60)}/${Math.round((block.offSec??0)/60)} min)` : "";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "16px 0",
                    borderBottom: i < workout.structure!.length - 1 ? "1px solid var(--m-border)" : "none",
                  }}>
                    <div style={{ width: 3, height: 28, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--m-text)", lineHeight: 1.2 }}>
                        {reps && <span style={{ color: barColor, marginRight: 4 }}>{reps}</span>}
                        {label}{repDetail}
                      </div>
                      <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 3 }}>
                        {dur} min{pct > 0 ? ` · ${pct}% FTP` : ""}
                      </div>
                    </div>
                    {pct > 0 && (
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: barColor,
                        flexShrink: 0, minWidth: 36, textAlign: "right",
                      }}>
                        {pct}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Post-workout note ───────────────────────────────────────── */}
      {todayStatus === "completed" && (
        <div style={{ padding: "20px 24px 0" }}>
          <button onClick={() => sendNote("Felt tired today — please factor into next week")} style={{
            width: "100%", padding: "16px",
            background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
            borderRadius: 8, color: noteState === "done" ? "#22c55e" : "var(--m-muted)",
            fontSize: 15, fontWeight: 600, cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}>
            {noteState === "done" ? "Noted ✓" : "That session was tough — let the coach know"}
          </button>
        </div>
      )}

      {/* ── Week strip ──────────────────────────────────────────────── */}
      <div style={{ padding: "28px 24px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 14 }}>
          This week
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PLAN_DAYS.map((dayName, i) => {
            const w = weekWorkouts.find(x => x.day === dayName);
            const isToday = w?.date === today;
            const z = w ? detectZone(w) : "rest";
            const isRestDay = z === "rest" || !w;
            const status = w?.date ? weekStatus[w.date] : undefined;
            const isDone = status === "completed";
            const isMissed = status === "missed";
            return (
              <div key={dayName} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: "100%", paddingTop: 10, paddingBottom: 10,
                  borderRadius: 6,
                  background: isToday ? "#FF5A1F" : "var(--m-card-inner)",
                  border: `1px solid ${isToday ? "#FF5A1F" : "var(--m-border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: isToday ? 800 : 500,
                    color: isToday ? "#fff" : isRestDay ? "var(--m-muted)" : "var(--m-text)",
                  }}>
                    {DAY_ABBR[i]}
                  </span>
                </div>
                {/* Status dot */}
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: isDone ? "#22c55e" : isMissed ? "#ef4444" : "transparent",
                }} />
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function StatCell({ value, label, divider, accent }: {
  value: string; label: string; divider?: boolean; accent?: boolean;
}) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 10px",
      borderLeft: divider ? "1px solid var(--m-border)" : "none",
    }}>
      <div style={{
        fontSize: 26, fontWeight: 800, lineHeight: 1,
        color: accent ? "#FF5A1F" : "var(--m-text)",
        marginBottom: 5,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--m-muted)",
        textTransform: "uppercase", letterSpacing: "1px",
      }}>
        {label}
      </div>
    </div>
  );
}
