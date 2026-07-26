"use client";

import { useState } from "react";
import type { WeeklyWorkout } from "@/lib/ai";
import MobileWorkoutChart from "@/app/m/today/workout-chart";
import { isRunWorkout } from "@/lib/zwo";

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

function formatWeekRange(weekOf: string): string {
  const start = new Date(weekOf + "T00:00:00Z");
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDayLabel(dateStr?: string, dayName?: string): { short: string; dateNum: string } {
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return {
      short: d.toLocaleDateString("en-US", { weekday: "short" }),
      dateNum: d.toLocaleDateString("en-US", { day: "numeric" }),
    };
  }
  const SHORTS: Record<string, string> = {
    Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
    Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
  };
  return { short: SHORTS[dayName ?? ""] ?? (dayName ?? ""), dateNum: "" };
}

/** Max 2 short bullets from the coach summary (≤55 chars each). */
function summaryBullets(summary: string): string[] {
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  return sentences.slice(0, 2).map(s => s.length > 55 ? s.slice(0, 53) + "…" : s);
}

function blockBarColor(pct: number): string {
  if (pct >= 120) return "#ef4444";
  if (pct >= 106) return "#f97316";
  if (pct >= 95)  return "#f59e0b";
  if (pct >= 88)  return "#10b981";
  if (pct >= 76)  return "#22d3ee";
  if (pct >= 56)  return "#3b82f6";
  return "#64748b";
}

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  workouts: (WeeklyWorkout & { date?: string })[];
  weekOf: string;
  today: string;
  summary: string | null;
  weekStatus?: Record<string, string>;
}

export default function WeekView({ workouts, weekOf, today, summary, weekStatus = {} }: Props) {
  // Auto-expand today by default, or the first completed workout if today has no plan
  const todayWorkout = workouts.find(w => w.date === today);
  const firstCompleted = Object.entries(weekStatus).find(([, s]) => s === "completed")?.[0];
  const autoExpand = todayWorkout ? (todayWorkout.day ?? null) : (
    firstCompleted
      ? (workouts.find(w => w.date === firstCompleted)?.day ?? null)
      : null
  );
  const [expanded, setExpanded] = useState<string | null>(autoExpand);

  if (workouts.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>No plan yet</div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
          Your weekly training plan hasn&apos;t been generated yet.
        </div>
        <GeneratePlanButton />
      </div>
    );
  }

  const bullets = summary ? summaryBullets(summary) : [];

  return (
    <div style={{ padding: "16px 16px 0" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, color: "#475569", fontWeight: 500, letterSpacing: ".4px", textTransform: "uppercase" }}>
          {formatWeekRange(weekOf)}
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          Weekly Plan
        </div>

        {/* Coach summary — max 2 ultra-short bullets */}
        {bullets.length > 0 && (
          <div style={{
            marginTop: 8,
            background: "#0f172a", borderRadius: 12, padding: "10px 14px",
            border: "1px solid #1e293b",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            {bullets.map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#64748b", lineHeight: 1.4 }}>{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
        {ALL_DAYS.map(dayName => {
          const w = workouts.find(x => x.day === dayName);
          const isToday = w?.date === today;
          const zone = w ? detectZone(w) : "rest";
          const colors = ZONE_COLOR[zone] ?? ZONE_COLOR.rest;
          const isRest = zone === "rest" || !w;
          const label = formatDayLabel(w?.date, dayName);
          const dayStatus = w?.date ? weekStatus[w.date] : undefined;
          const isOpen = expanded === dayName;

          const statusMeta =
            dayStatus === "completed" ? { text: "Done",   color: "#22c55e", bg: "rgba(34,197,94,0.12)" } :
            dayStatus === "missed"    ? { text: "Missed", color: "#ef4444", bg: "rgba(239,68,68,0.10)" } :
            dayStatus === "bonus"     ? { text: "Bonus",  color: "#f59e0b", bg: "rgba(245,158,11,0.12)" } :
            null;

          return (
            <div key={dayName}>
              {/* Row — tappable */}
              <div
                role="button"
                tabIndex={isRest ? undefined : 0}
                onClick={() => { if (!isRest) setExpanded(isOpen ? null : dayName); }}
                style={{
                  background:
                    dayStatus === "completed" ? "rgba(34,197,94,0.05)" :
                    dayStatus === "missed"    ? "rgba(239,68,68,0.05)" :
                    dayStatus === "bonus"     ? "rgba(245,158,11,0.06)" :
                    isToday ? `${colors.accent}0d` : "#111827",
                  borderRadius: isOpen ? "18px 18px 0 0" : 18,
                  border:
                    dayStatus === "completed" ? "1px solid rgba(34,197,94,0.25)" :
                    dayStatus === "missed"    ? "1px solid rgba(239,68,68,0.20)" :
                    dayStatus === "bonus"     ? "1px solid rgba(245,158,11,0.25)" :
                    isToday ? `1.5px solid ${colors.accent}55` : "1px solid #1e293b",
                  borderBottom: isOpen ? "none" : undefined,
                  padding: "12px 14px",
                  cursor: isRest ? "default" : "pointer",
                  position: "relative",
                  overflow: "hidden",
                  WebkitTapHighlightColor: "transparent",
                  userSelect: "none",
                }}
              >
                {/* Today accent bar */}
                {isToday && (
                  <div style={{
                    position: "absolute", top: 0, left: 0, bottom: 0, width: 4,
                    background: colors.accent, borderRadius: "18px 0 0 18px",
                  }} />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: isToday ? 8 : 0 }}>
                  {/* Day bubble */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                    background: isRest ? "#1e293b" : `${colors.accent}22`,
                    border: `1px solid ${isRest ? "#334155" : colors.accent + "44"}`,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 1,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isRest ? "#475569" : colors.accent, letterSpacing: ".3px" }}>
                      {label.short.toUpperCase()}
                    </span>
                    {label.dateNum && (
                      <span style={{ fontSize: 18, fontWeight: 800, color: isRest ? "#475569" : colors.accent }}>
                        {label.dateNum}
                      </span>
                    )}
                  </div>

                  {/* Workout info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 19, fontWeight: 700,
                        color: isRest ? "#475569" : "#f1f5f9",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, minWidth: 0,
                      }}>
                        {isRest && dayStatus === "bonus" ? "Bonus ride" : isRest ? "Rest" : w!.title}
                      </span>
                      {isToday && !statusMeta && (
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: colors.accent,
                          background: `${colors.accent}22`, padding: "3px 8px", borderRadius: 6, flexShrink: 0,
                        }}>TODAY</span>
                      )}
                      {statusMeta && (
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: statusMeta.color,
                          background: statusMeta.bg, padding: "3px 9px", borderRadius: 6, flexShrink: 0,
                        }}>{statusMeta.text}</span>
                      )}
                    </div>

                    {!isRest && w && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {/* RIDE / RUN mode badge */}
                        <span style={{
                          fontSize: 12, fontWeight: 800,
                          color: isRunWorkout(w.type) ? "#f97316" : "#3b82f6",
                          background: isRunWorkout(w.type) ? "rgba(249,115,22,0.12)" : "rgba(59,130,246,0.12)",
                          border: `1px solid ${isRunWorkout(w.type) ? "rgba(249,115,22,0.3)" : "rgba(59,130,246,0.3)"}`,
                          borderRadius: 6, padding: "2px 8px", flexShrink: 0,
                        }}>
                          {isRunWorkout(w.type) ? "RUN" : "RIDE"}
                        </span>
                        {w.durationMin > 0 && (
                          <span style={{ fontSize: 16, color: "#64748b" }}>{w.durationMin} min</span>
                        )}
                        <span style={{ fontSize: 15, fontWeight: 600, color: colors.accent, letterSpacing: ".3px", textTransform: "uppercase" }}>
                          {colors.label}
                        </span>
                        {/* Dot indicators for structure */}
                        {w.structure && w.structure.length > 0 && (
                          <div style={{ display: "flex", gap: 3 }}>
                            {w.structure.slice(0, 5).map((block, i) => (
                              <div key={i} style={{
                                width: 5, height: 5, borderRadius: "50%",
                                background: blockBarColor(Math.round((block.powerFtp ?? 0) * 100)),
                              }} />
                            ))}
                          </div>
                        )}
                        {/* Expand chevron */}
                        <span style={{
                          marginLeft: "auto", fontSize: 14, color: "#334155",
                          display: "inline-block",
                          transform: isOpen ? "rotate(180deg)" : "none",
                          transition: "transform .2s",
                          flexShrink: 0,
                        }}>⌄</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded detail panel */}
              {isOpen && !isRest && w && (
                <div style={{
                  background: "#0a0f1a",
                  border: "1px solid #1e293b", borderTop: "1px solid #0f172a",
                  borderRadius: "0 0 18px 18px",
                  padding: "10px 14px 14px",
                }}>
                  {/* Power chart */}
                  {w.structure && w.structure.length > 0 && (
                    <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                      <MobileWorkoutChart blocks={w.structure} durationMin={w.durationMin} />
                    </div>
                  )}

                  {/* Short description */}
                  {w.description && (
                    <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.5, marginBottom: 10 }}>
                      {w.description.slice(0, 110)}{w.description.length > 110 ? "…" : ""}
                    </div>
                  )}

                  {/* Interval blocks */}
                  {w.structure && w.structure.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {w.structure.map((block, i) => {
                        const pct = Math.round((block.powerFtp ?? 0) * 100);
                        const barColor = blockBarColor(pct);
                        const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                        const repDetail = block.type === "intervals" && block.onSec
                          ? ` (${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min)`
                          : "";
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            background: "#111827", borderRadius: 10, padding: "10px 12px",
                            border: "1px solid #1e293b",
                          }}>
                            <div style={{ width: 3, height: 22, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>
                              {reps}{block.label || block.type}{repDetail}
                            </div>
                            <span style={{ fontSize: 13, color: "#64748b" }}>
                              {block.durationMin ?? 0} min
                            </span>
                            {pct > 0 && (
                              <div style={{
                                width: 42, height: 28, borderRadius: 7,
                                background: `${barColor}18`, border: `1px solid ${barColor}33`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 13, fontWeight: 700, color: barColor, flexShrink: 0,
                              }}>
                                {pct}%
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: "#475569" }}>No detailed structure.</div>
                  )}

                  {/* CTA for today */}
                  {isToday && (
                    <a href="/m" style={{
                      display: "block", marginTop: 12, textAlign: "center",
                      padding: "12px", borderRadius: 12,
                      background: colors.accent, color: "#fff",
                      fontSize: 15, fontWeight: 700, textDecoration: "none",
                    }}>View full workout →</a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeneratePlanButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function generate() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setState("done");
        setMsg("Plan generated! Refreshing…");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setState("error");
        setMsg(data.error ?? "Something went wrong");
      }
    } catch {
      setState("error");
      setMsg("Network error — try again");
    }
  }

  return (
    <div style={{ textAlign: "center" }}>
      <button
        onClick={generate}
        disabled={state === "loading" || state === "done"}
        style={{
          padding: "15px 32px",
          background: state === "done" ? "#166534" : state === "error" ? "#7f1d1d" : "#2563eb",
          color: "#fff", borderRadius: 16, border: "none",
          fontSize: 16, fontWeight: 700, cursor: state === "loading" ? "default" : "pointer",
          width: "100%", maxWidth: 280,
        }}
      >
        {state === "idle"    ? "Generate my plan" :
         state === "loading" ? "Generating…" :
         state === "done"    ? "✓ Done!" : "Try again"}
      </button>
      {msg && (
        <div style={{ fontSize: 13, color: state === "error" ? "#f87171" : "#4ade80", marginTop: 10 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
