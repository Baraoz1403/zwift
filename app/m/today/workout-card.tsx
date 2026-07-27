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
  tempo:         { accent: "#f59e0b", label: "Tempo"      },
  endurance:     { accent: "#3b82f6", label: "Endurance"  },
  neuromuscular: { accent: "#a855f7", label: "Neuro"      },
  rest:          { accent: "#64748b", label: "Rest"       },
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
  const [structureOpen, setStructureOpen] = useState(false);

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
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutDay: today, title: workout.title,
          description: workout.description ?? "",
          durationMin: workout.durationMin ?? 60,
          type: workout.type ?? "Bike",
          targetPower: workout.targetPowerPctFtp,
          structure: workout.structure,
        }),
      });
      const data = await res.json();
      setPushState(data.ok ? "done" : "error");
    } catch { setPushState("error"); }
  }

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

  const PLAN_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const DAY_ABBR  = ["M","T","W","T","F","S","S"];

  return (
    <div style={{ padding: "16px 16px 0" }}>

      {/* Section label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".14em", color: "var(--m-muted)", textTransform: "uppercase" }}>
          Today&apos;s session
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#FF5A1F",
          background: "rgba(255,90,31,0.1)", border: "1px solid rgba(255,90,31,0.3)",
          borderRadius: 3, padding: "2px 8px",
        }}>
          {isRunWorkout(workout.type) ? "Run" : "Ride"}
        </span>
        {todayStatus === "completed" && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", background: "rgba(22,163,74,0.1)", border: "1px solid rgba(22,163,74,0.3)", borderRadius: 3, padding: "2px 8px" }}>Done ✓</span>
        )}
        {todayStatus === "missed" && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 3, padding: "2px 8px" }}>Missed</span>
        )}
      </div>

      {/* Main workout card */}
      <div style={{
        borderRadius: 4, overflow: "hidden",
        background: "var(--m-card)",
        border: "1px solid var(--m-border)",
        borderTop: `3px solid ${colors.accent}`,
        marginBottom: 10,
      }}>
        {!isRest && (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", zIndex: 10, top: 10, left: 12,
              background: "var(--m-card)", border: `1px solid ${colors.accent}40`,
              borderRadius: 3, padding: "3px 9px",
              fontSize: 11, fontWeight: 700, color: colors.accent,
              letterSpacing: ".3px", textTransform: "uppercase",
            }}>
              {colors.label}
            </div>
            {workout.structure && workout.structure.length > 0 ? (
              <MobileWorkoutChart blocks={workout.structure} durationMin={workout.durationMin} />
            ) : (
              <div style={{ height: 100, background: "var(--m-card-inner)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 36 }}>🚴</span>
              </div>
            )}
          </div>
        )}
        {isRest && (
          <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--m-card-inner)", fontSize: 36 }}>🛌</div>
        )}

        <div style={{ padding: "14px 16px 16px" }}>
          {!isRest && (
            <div style={{ fontSize: 10, fontWeight: 800, color: colors.accent, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 5 }}>
              {colors.label}
            </div>
          )}
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--m-text)", lineHeight: 1.15, letterSpacing: "-0.4px", marginBottom: isRest ? 0 : 10 }}>
            {workout.title}
          </div>
          {!isRest && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {workout.durationMin > 0 && <StatPill value={`${workout.durationMin}`} unit="min" />}
              {ifTss && <StatPill value={`${Math.round(ifTss.tss)}`} unit="TSS" />}
              {ifTss && <StatPill value={ifTss.intensityFactor.toFixed(2)} unit="IF" accent={colors.accent} />}
              {workout.targetPowerPctFtp && <StatPill value={workout.targetPowerPctFtp} unit="% FTP" accent={colors.accent} />}
            </div>
          )}
        </div>
      </div>

      {/* Description intentionally hidden — shown in coach chat on demand */}

      {/* Structure blocks — collapsed by default */}
      {!isRest && workout.structure && workout.structure.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setStructureOpen(o => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", marginBottom: structureOpen ? 8 : 0,
              background: "var(--m-card)", border: "1px solid var(--m-border)", borderRadius: 4,
              color: "var(--m-muted)", fontSize: 12, fontWeight: 700, cursor: "pointer",
              letterSpacing: ".1em", textTransform: "uppercase",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span>Session structure</span>
            <span style={{ fontSize: 16, lineHeight: 1 }}>{structureOpen ? "−" : "+"}</span>
          </button>
          {structureOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {workout.structure.map((block, i) => {
                const pct = Math.round((block.powerFtp ?? 0) * 100);
                const barColor = pct>=120?"#ef4444":pct>=106?"#f97316":pct>=95?"#f59e0b":pct>=88?"#10b981":pct>=76?"#22d3ee":pct>=56?"#3b82f6":"#64748b";
                const dur = block.durationMin ?? 0;
                const label = block.label || block.type;
                const reps = block.type==="intervals" && block.repeats ? `${block.repeats}×` : "";
                const repDetail = block.type==="intervals" && block.onSec ? ` (${Math.round(block.onSec/60)}/${Math.round((block.offSec??0)/60)}min)` : "";
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "var(--m-card)", borderRadius: 4, padding: "11px 14px",
                    border: "1px solid var(--m-border)", borderLeft: `3px solid ${barColor}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)", lineHeight: 1.2 }}>
                        {reps && <span style={{ color: barColor, marginRight: 3 }}>{reps}</span>}
                        {label}{repDetail}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--m-muted)", marginTop: 2 }}>
                        {dur} min{pct>0?` · ${pct}% FTP`:""}
                        {block.recoveryPowerFtp ? ` / ${Math.round(block.recoveryPowerFtp*100)}% rec` : ""}
                      </div>
                    </div>
                    {pct>0 && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: barColor, background: `${barColor}14`, border: `1px solid ${barColor}30`, borderRadius: 3, padding: "3px 8px", flexShrink: 0 }}>
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

      {/* Actions */}
      <div style={{ marginBottom: 14 }}>
        {!isRest && (
          <button onClick={pushToZwift} disabled={pushState!=="idle"} style={{
            width: "100%", padding: "15px", borderRadius: 4, border: "none",
            fontSize: 15, fontWeight: 700, cursor: pushState==="idle"?"pointer":"default",
            marginBottom: 8,
            background: pushState==="done"?"#16a34a":pushState==="error"?"#dc2626":pushState==="sending"?"var(--m-muted)":"#FF5A1F",
            color: "#fff",
          }}>
            {pushState==="idle"?"Send to Zwift":pushState==="sending"?"Sending…":pushState==="done"?"✓ On your Zwift calendar":"Try again"}
          </button>
        )}
        {/* Post-workout: tired signal (only after activity logged) */}
        {todayStatus === "completed" && (
          <button onClick={() => sendNote("Felt tired today — please factor into next week")} style={{
            width: "100%", padding: "12px",
            background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
            borderRadius: 4, color: noteState==="done"?"#16a34a":"var(--m-muted)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{noteState==="done"?"Noted ✓":"That session was tough — let the coach know"}</button>
        )}
      </div>

      {/* Week strip */}
      <div style={{ background: "var(--m-card)", borderRadius: 4, padding: "14px", border: "1px solid var(--m-border)", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--m-muted)", letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 10 }}>
          This week
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {PLAN_DAYS.map((dayName, i) => {
            const w = weekWorkouts.find(x => x.day===dayName);
            const z = w ? detectZone(w) : "rest";
            const col = ZONE_COLOR[z] ?? ZONE_COLOR.rest;
            const isToday = w?.date===today;
            const isRestDay = z==="rest" || !w;
            return (
              <div key={dayName} style={{ flex: 1 }}>
                <div style={{
                  paddingTop: 8, paddingBottom: 8, borderRadius: 3,
                  background: isToday ? col.accent : isRestDay ? "var(--m-card-inner)" : `${col.accent}14`,
                  border: `1px solid ${isToday ? col.accent : isRestDay ? "var(--m-border)" : col.accent+"35"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, fontWeight: isToday?800:600, color: isToday?"#fff":isRestDay?"var(--m-muted)":col.accent }}>
                    {DAY_ABBR[i]}
                  </span>
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
    <div style={{ background: "var(--m-card-inner)", borderRadius: 3, padding: "8px 12px", textAlign: "center", border: "1px solid var(--m-border)" }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ?? "var(--m-text)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>{unit}</div>
    </div>
  );
}
