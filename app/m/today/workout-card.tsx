"use client";

import { useState } from "react";
import MobileWorkoutChart from "./workout-chart";
import type { WeeklyWorkout } from "@/lib/ai";
import { structureToBlocks, computeIfTss, isRunWorkout } from "@/lib/zwo";
import type { DayStatus } from "@/lib/activity-sync";

// Monochromatic: VOLT orange for all active zones, neutral for rest
const ZONE_COLOR: Record<string, { accent: string; label: string }> = {
  sweetSpot:     { accent: "#FF5A1F", label: "Sweet Spot" },
  threshold:     { accent: "#FF5A1F", label: "Threshold"  },
  vo2max:        { accent: "#FF5A1F", label: "VO2 Max"    },
  tempo:         { accent: "#FF5A1F", label: "Tempo"      },
  endurance:     { accent: "#FF5A1F", label: "Endurance"  },
  neuromuscular: { accent: "#FF5A1F", label: "Neuro"      },
  rest:          { accent: "var(--m-muted)", label: "Rest" },
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
  const [noteState, setNoteState] = useState<"idle" | "sending" | "done">("idle");
  const [structureOpen, setStructureOpen] = useState(false);

  const zone = detectZone(workout);
  const colors = ZONE_COLOR[zone] ?? ZONE_COLOR.endurance;
  const isRest = zone === "rest";

  const ifTss = workout.structure && workout.structure.length > 0
    ? computeIfTss(structureToBlocks(workout.structure))
    : null;

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
          fontSize: 11, fontWeight: 600, color: "var(--m-muted)",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
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
              background: "rgba(0,0,0,0.60)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 3, padding: "3px 9px",
              fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)",
              letterSpacing: ".3px", textTransform: "uppercase",
            }}>
              {colors.label}
            </div>
            {workout.structure && workout.structure.length > 0 ? (
              <MobileWorkoutChart blocks={workout.structure} durationMin={workout.durationMin} isRunning={isRunWorkout(workout.type)} />
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
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--m-text)", lineHeight: 1.15, letterSpacing: "-0.4px", marginBottom: isRest ? 0 : 10 }}>
            {workout.title}
          </div>
          {!isRest && (
            <div style={{ display: "flex", gap: 7, flexWrap: "nowrap" }}>
              {workout.durationMin > 0 && <StatPill value={`${workout.durationMin}`} unit="min" />}
              {/* FTP-based metrics hidden for running — not applicable */}
              {!isRunWorkout(workout.type) && ifTss && <StatPill value={`${Math.round(ifTss.tss)}`} unit="TSS" />}
              {!isRunWorkout(workout.type) && ifTss && <StatPill value={ifTss.intensityFactor.toFixed(2)} unit="IF" />}
              {!isRunWorkout(workout.type) && workout.targetPowerPctFtp && <StatPill value={workout.targetPowerPctFtp} unit="% FTP" />}
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
                const barColor = pct>=120?"#ef4444":pct>=106?"#FF5A1F":pct>=95?"rgba(255,90,31,0.88)":pct>=88?"rgba(255,90,31,0.75)":pct>=76?"rgba(255,90,31,0.72)":pct>=56?"rgba(255,255,255,0.16)":"rgba(255,255,255,0.08)";
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
                        {dur} min{pct>0 && !isRunWorkout(workout.type) ? ` · ${pct}% FTP` : ""}
                        {block.recoveryPowerFtp && !isRunWorkout(workout.type) ? ` / ${Math.round(block.recoveryPowerFtp*100)}% rec` : ""}
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
                  // only today gets the orange fill — all other days neutral
                  background: isToday ? col.accent : "var(--m-card-inner)",
                  border: `1px solid ${isToday ? col.accent : "var(--m-border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? "#fff" : "var(--m-muted)" }}>
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

function StatPill({ value, unit }: { value: string; unit: string }) {
  return (
    <div style={{ flex: 1, background: "var(--m-card-inner)", borderRadius: 3, padding: "8px 10px", textAlign: "center", border: "1px solid var(--m-border)", minWidth: 0 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-text)", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--m-muted)", marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{unit}</div>
    </div>
  );
}
