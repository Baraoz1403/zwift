"use client";

import { useState } from "react";
import type { WeeklyWorkout } from "@/lib/ai";

const FAMILY_COLOR: Record<string, { bg: string; label: string; text: string }> = {
  sweetSpot:     { bg: "#1e3a5f", label: "#60a5fa", text: "Sweet Spot" },
  threshold:     { bg: "#3b1f1f", label: "#f87171", text: "Threshold" },
  vo2max:        { bg: "#1f2d1f", label: "#4ade80", text: "VO2max" },
  tempo:         { bg: "#2d2200", label: "#fbbf24", text: "Tempo" },
  endurance:     { bg: "#1a2035", label: "#818cf8", text: "Endurance" },
  neuromuscular: { bg: "#2d1a2d", label: "#c084fc", text: "Neuromuscular" },
  rest:          { bg: "#1e1e2a", label: "#6b7280", text: "Rest" },
};

function detectFamily(workout: WeeklyWorkout): string {
  const t = (workout.title + " " + (workout.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "sweetSpot";
  if (t.includes("threshold") || t.includes("ftp")) return "threshold";
  if (t.includes("vo2") || t.includes("interval")) return "vo2max";
  if (t.includes("tempo")) return "tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "neuromuscular";
  if (t.includes("rest") || t.includes("recovery") || t.includes("off")) return "rest";
  return "endurance";
}

interface Props {
  workout: WeeklyWorkout;
  weekWorkouts: WeeklyWorkout[];
  today: string; // "YYYY-MM-DD"
}

export default function WorkoutCard({ workout, weekWorkouts, today }: Props) {
  const [sent, setSent] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [noteState, setNoteState] = useState<"idle" | "sending" | "done">("idle");

  const family = detectFamily(workout);
  const colors = FAMILY_COLOR[family] ?? FAMILY_COLOR.endurance;
  const isRest = family === "rest" || workout.type?.toLowerCase().includes("rest");

  async function handleNote(note: string) {
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

  async function handlePushToZwift() {
    if (sent !== "idle") return;
    setSent("sending");
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
      setSent(data.ok ? "done" : "error");
    } catch {
      setSent("error");
    }
  }

  const todayDate = new Date(today + "T00:00:00");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dateLabel = `${dayNames[todayDate.getDay()]} ${todayDate.getDate()} ${monthNames[todayDate.getMonth()]}`;

  return (
    <div style={{ width: "100%", maxWidth: 400, padding: "16px 16px 32px", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingTop: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 2 }}>{dateLabel}</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#f1f5f9" }}>Today</div>
        </div>
        <a href="/dashboard" style={{ fontSize: 12, color: "#64748b", textDecoration: "none", padding: "6px 10px", border: "0.5px solid #334155", borderRadius: 8 }}>
          Dashboard
        </a>
      </div>

      {/* Main workout card */}
      <div style={{ background: colors.bg, borderRadius: 20, padding: "20px", marginBottom: 12, border: `0.5px solid ${colors.label}22` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: colors.label,
            background: `${colors.label}18`, borderRadius: 6, padding: "3px 8px",
            letterSpacing: ".4px", textTransform: "uppercase",
          }}>
            {colors.text}
          </span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 6, lineHeight: 1.2 }}>
          {workout.title}
        </div>

        {workout.description && (
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 16 }}>
            {workout.description.length > 120 ? workout.description.slice(0, 120) + "…" : workout.description}
          </div>
        )}

        {!isRest && (
          <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
            {workout.durationMin > 0 && (
              <div style={{ background: "#ffffff0a", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9" }}>{workout.durationMin}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>min</div>
              </div>
            )}
            {workout.targetPowerPctFtp && (
              <div style={{ background: "#ffffff0a", borderRadius: 10, padding: "8px 14px", textAlign: "center", flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: colors.label }}>{workout.targetPowerPctFtp}</div>
                <div style={{ fontSize: 10, color: "#64748b" }}>of FTP</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isRest && (
        <button
          onClick={handlePushToZwift}
          disabled={sent !== "idle"}
          style={{
            width: "100%", padding: "15px",
            background: sent === "done" ? "#166534" : sent === "error" ? "#7f1d1d" : "#2563eb",
            color: "#fff", border: "none", borderRadius: 14,
            fontSize: 16, fontWeight: 600, cursor: sent === "idle" ? "pointer" : "default",
            marginBottom: 10, transition: "background .2s",
          }}
        >
          {sent === "idle" ? "Push to Zwift" : sent === "sending" ? "Syncing…" : sent === "done" ? "On your Zwift calendar" : "Try again"}
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => handleNote("I'm feeling tired today, please adjust the plan")}
          style={{
            padding: "12px", background: "#1e293b", border: "0.5px solid #334155",
            borderRadius: 12, color: noteState === "done" ? "#4ade80" : "#94a3b8",
            fontSize: 14, cursor: "pointer",
          }}
        >
          {noteState === "done" ? "Noted" : "I'm tired"}
        </button>
        <button
          onClick={() => handleNote("Skipping today's workout")}
          style={{
            padding: "12px", background: "#1e293b", border: "0.5px solid #334155",
            borderRadius: 12, color: "#94a3b8", fontSize: 14, cursor: "pointer",
          }}
        >
          Skip today
        </button>
      </div>

      {/* Week strip */}
      <div style={{ borderTop: "0.5px solid #1e293b", paddingTop: 16 }}>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>
          This week
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
          {weekWorkouts.map((w, i) => {
            const fam = detectFamily(w);
            const col = FAMILY_COLOR[fam] ?? FAMILY_COLOR.endurance;
            const isToday = w.date === today;
            const dayName = w.day?.slice(0, 1) ?? String(i);
            const isDone = w.type?.toLowerCase().includes("completed") || w.type?.toLowerCase().includes("retrospective");
            return (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isToday ? col.label : isDone ? "#1e293b" : "#0f172a",
                  border: isToday ? `2px solid ${col.label}` : "0.5px solid #1e293b",
                  margin: "0 auto 4px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isDone
                    ? <span style={{ fontSize: 14, color: "#4ade80" }}>✓</span>
                    : <span style={{ fontSize: 11, color: isToday ? "#0f172a" : "#475569", fontWeight: isToday ? 700 : 400 }}>{dayName}</span>
                  }
                </div>
                <div style={{ fontSize: 9, color: isToday ? col.label : "#475569", fontWeight: isToday ? 600 : 400 }}>
                  {fam === "rest" ? "—" : fam === "endurance" ? "Z2" : fam === "sweetSpot" ? "SS" : fam === "threshold" ? "THR" : fam === "vo2max" ? "VO2" : fam === "tempo" ? "Tmp" : "NM"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
