"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { WeeklyWorkout } from "@/lib/ai";
import MobileWorkoutChart from "@/app/m/today/workout-chart";
import { isRunWorkout } from "@/lib/zwo";

// Monochromatic — single VOLT orange accent for all workout types.
const ZONE_COLOR: Record<string, { accent: string; label: string }> = {
  // Cycling
  sweetSpot:     { accent: "#FF5A1F", label: "Sweet Spot" },
  threshold:     { accent: "#FF5A1F", label: "Threshold"  },
  vo2max:        { accent: "#FF5A1F", label: "VO2 Max"    },
  tempo:         { accent: "#FF5A1F", label: "Tempo"      },
  endurance:     { accent: "#FF5A1F", label: "Endurance"  },
  neuromuscular: { accent: "#FF5A1F", label: "Neuro"      },
  // Running
  easyRun:       { accent: "#FF5A1F", label: "Easy Run"   },
  tempoRun:      { accent: "#FF5A1F", label: "Tempo Run"  },
  intervalRun:   { accent: "#FF5A1F", label: "Intervals"  },
  longRun:       { accent: "#FF5A1F", label: "Long Run"   },
  walkRun:       { accent: "var(--m-muted)", label: "Walk/Run" },
  recoveryRun:   { accent: "var(--m-muted)", label: "Recovery" },
  rest:          { accent: "var(--m-muted)", label: "Rest" },
};

function detectZone(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  // Running — check title first (resilient to old cached plans with cycling type)
  if (t.includes("long run"))     return "longRun";
  if (t.includes("tempo run") || (t.includes("tempo") && t.includes("run"))) return "tempoRun";
  if (t.includes("interval run")) return "intervalRun";
  if (t.includes("walk/run") || t.includes("walk run")) return "walkRun";
  if (t.includes("recovery run")) return "recoveryRun";
  if (t.includes("easy run"))     return "easyRun";
  // Cycling
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "sweetSpot";
  if (t.includes("threshold") || t.includes("ftp")) return "threshold";
  if (t.includes("vo2") || t.includes("norwegian") || t.includes("60/60")) return "vo2max";
  if (t.includes("tempo")) return "tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "neuromuscular";
  if (t.includes("rest") || t.includes("recovery") || t.includes("off")) return "rest";
  return "endurance";
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

// Monochromatic power bar — VOLT orange gradient, red only at all-out effort.
// rgba(255,90,31,X) below 0.70 opacity on dark bg renders as brown — forbidden.
function blockBarColor(pct: number): string {
  if (pct >= 120) return "#ef4444";
  if (pct >= 106) return "#FF5A1F";
  if (pct >= 95)  return "rgba(255,90,31,0.88)";
  if (pct >= 88)  return "rgba(255,90,31,0.75)";
  if (pct >= 76)  return "rgba(255,90,31,0.72)";
  if (pct >= 56)  return "rgba(255,255,255,0.16)";
  return "rgba(255,255,255,0.08)";
}

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  workouts: (WeeklyWorkout & { date?: string })[];
  weekOf: string;
  weekRange: string;
  today: string;
  summary: string | null;
  weekStatus?: Record<string, string>;
  prevWeekHref: string | null;
  nextWeekHref: string | null;
  isCurrentWeek: boolean;
  /** On tablet, TabletPageHeader already shows the week range — hide WeekNav. */
  hideNav?: boolean;
}

export default function WeekView({ workouts, weekOf, weekRange, today, summary, weekStatus = {}, prevWeekHref, nextWeekHref, isCurrentWeek, hideNav = false }: Props) {
  const pathname = usePathname();
  // "View full workout" links to the correct layout based on route
  const todayHref = pathname.startsWith("/tablet") ? "/tablet/today" : "/m";

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
      <div style={{ padding: "0 0 24px" }}>
        {!hideNav && <WeekNav weekRange={weekRange} prevWeekHref={prevWeekHref} nextWeekHref={nextWeekHref} isCurrentWeek={isCurrentWeek} />}
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>📋</div>
          <div style={{ fontSize: 23, fontWeight: 700, color: "var(--m-text)", marginBottom: 10 }}>
            {isCurrentWeek ? "No plan yet" : "No plan for this week"}
          </div>
          <div style={{ fontSize: 17, color: "var(--m-muted)", lineHeight: 1.6, marginBottom: 28 }}>
            {isCurrentWeek
              ? "Your weekly training plan hasn't been generated yet."
              : "No training plan has been generated for this week yet."}
          </div>
          <GeneratePlanButton weekOf={isCurrentWeek ? undefined : weekOf} />
        </div>
      </div>
    );
  }

  const bullets = summary ? summaryBullets(summary) : [];

  return (
    <div style={{ padding: "0" }}>

      {!hideNav && <WeekNav weekRange={weekRange} prevWeekHref={prevWeekHref} nextWeekHref={nextWeekHref} isCurrentWeek={isCurrentWeek} />}

      <div style={{ padding: "0 18px 32px" }}>

      {/* Coach note (week heading lives in page.tsx pinned header) */}
      {bullets.length > 0 && (
        <div style={{
          margin: "16px 0 0",
          background: "var(--m-card-inner)", borderRadius: 6, padding: "20px 18px",
          border: "1px solid var(--m-border)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em" }}>Coach note</div>
          {bullets.map((line, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#FF5A1F", flexShrink: 0, marginTop: 8 }} />
              <span style={{ fontSize: 18, color: "var(--m-muted)", lineHeight: 1.6 }}>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Day cards — sidebar style */}
      <div style={{ borderTop: "1px solid var(--m-border)" }}>
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
            dayStatus === "bonus"     ? { text: "Bonus",  color: "#FF5A1F", bg: "rgba(255,90,31,0.10)" } :
            null;

          return (
            <div key={dayName}>
              {/* Row — tappable */}
              <div
                role="button"
                tabIndex={isRest ? undefined : 0}
                onClick={() => { if (!isRest) setExpanded(isOpen ? null : dayName); }}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "20px 20px",
                  background: isToday ? `${colors.accent}0a` : "transparent",
                  borderLeft: `3px solid ${isToday ? colors.accent : "transparent"}`,
                  borderBottom: "1px solid var(--m-border)",
                  cursor: isRest ? "default" : "pointer",
                  WebkitTapHighlightColor: "transparent",
                  userSelect: "none",
                  position: "relative",
                }}
              >
                {/* Day chip — neutral */}
                <div style={{
                  width: 56, height: 56, borderRadius: 6, flexShrink: 0,
                  background: "var(--m-card-inner)",
                  border: "1px solid var(--m-border)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--m-muted)", letterSpacing: ".3px" }}>
                    {label.short.toUpperCase()}
                  </span>
                  {label.dateNum && (
                    <span style={{ fontSize: 24, fontWeight: 800, color: isToday ? colors.accent : "var(--m-text)", lineHeight: 1.1 }}>
                      {label.dateNum}
                    </span>
                  )}
                </div>

                {/* Title + subtitle */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 21, fontWeight: 700,
                    color: isRest ? "var(--m-muted)" : "var(--m-text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isRest && dayStatus === "bonus" ? "Bonus ride" : isRest ? "Rest" : w!.title}
                  </div>
                  {!isRest && w && (
                    <div style={{ fontSize: 17, color: "var(--m-muted)", marginTop: 4 }}>
                      {colors.label}{w.durationMin > 0 ? ` · ${w.durationMin} min` : ""}
                    </div>
                  )}
                </div>

                {/* Status + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {isToday && !statusMeta && (
                    <span style={{
                      fontSize: 16, fontWeight: 800, color: colors.accent,
                      background: `${colors.accent}22`, padding: "4px 10px", borderRadius: 4,
                      letterSpacing: ".5px",
                    }}>TODAY</span>
                  )}
                  {statusMeta && (
                    <span style={{
                      fontSize: 16, fontWeight: 800, color: statusMeta.color,
                      background: statusMeta.bg, padding: "4px 10px", borderRadius: 4,
                    }}>{statusMeta.text}</span>
                  )}
                  {!isRest && (
                    <span style={{
                      fontSize: 21, color: "var(--m-muted)",
                      display: "inline-block",
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform .2s",
                    }}>⌄</span>
                  )}
                </div>
              </div>

              {/* Expanded detail panel */}
              {isOpen && !isRest && w && (
                <div style={{
                  background: "var(--m-card-inner)",
                  borderLeft: `3px solid ${colors.accent}`,
                  borderBottom: "1px solid var(--m-border)",
                  padding: "20px 16px 22px 16px",
                }}>
                  {/* Power chart */}
                  {w.structure && w.structure.length > 0 && (
                    <div style={{ borderRadius: 4, overflow: "hidden", marginBottom: 16, height: 180, maxHeight: 180 }}>
                      <MobileWorkoutChart blocks={w.structure} durationMin={w.durationMin} />
                    </div>
                  )}

                  {/* Short description */}
                  {w.description && (
                    <div style={{ fontSize: 17, color: "var(--m-muted)", lineHeight: 1.5, marginBottom: 12 }}>
                      {w.description.slice(0, 110)}{w.description.length > 110 ? "…" : ""}
                    </div>
                  )}

                  {/* Interval blocks */}
                  {w.structure && w.structure.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {w.structure.map((block, i) => {
                        const pct = Math.round((block.powerFtp ?? 0) * 100);
                        const barColor = blockBarColor(pct);
                        const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                        const repDetail = block.type === "intervals" && block.onSec
                          ? ` (${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min)`
                          : "";
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            background: "var(--m-card-inner)", borderRadius: 4, padding: "10px 12px",
                            border: "1px solid var(--m-border)",
                          }}>
                            <div style={{ width: 3, height: 22, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 18, fontWeight: 600, color: "var(--m-text)" }}>
                              {reps}{block.label || block.type}{repDetail}
                            </div>
                            <span style={{ fontSize: 16, color: "var(--m-muted)" }}>
                              {block.durationMin ?? 0} min
                            </span>
                            {pct > 0 && (
                              <div style={{
                                width: 42, height: 28, borderRadius: 3,
                                background: `${barColor}18`, border: `1px solid ${barColor}33`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 16, fontWeight: 700, color: barColor, flexShrink: 0,
                              }}>
                                {pct}%
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 17, color: "var(--m-muted)" }}>No detailed structure.</div>
                  )}

                  {/* CTA for today */}
                  {isToday && (
                    <a href={todayHref} style={{
                      display: "block", marginTop: 12, textAlign: "center",
                      padding: "12px", borderRadius: 4,
                      background: colors.accent, color: "#fff",
                      fontSize: 18, fontWeight: 700, textDecoration: "none",
                    }}>View full workout →</a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div> {/* end padding wrapper */}
    </div>
  );
}

function WeekNav({ weekRange, prevWeekHref, nextWeekHref, isCurrentWeek }: {
  weekRange: string;
  prevWeekHref: string | null;
  nextWeekHref: string | null;
  isCurrentWeek: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 16px 18px",
      borderBottom: "1px solid var(--m-border)",
      background: "var(--m-bg)",
      position: "sticky", top: 0, zIndex: 10,
    }}>
      {/* Prev week button */}
      {prevWeekHref ? (
        <a href={prevWeekHref} style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 19, fontWeight: 700, color: "#FF5A1F",
          textDecoration: "none", padding: "10px 14px",
          background: "rgba(255,90,31,0.08)", borderRadius: 6,
          border: "1px solid rgba(255,90,31,0.2)",
          WebkitTapHighlightColor: "transparent",
        }}>
          ← Now
        </a>
      ) : (
        <div style={{ width: 88 }} />
      )}

      {/* Week label */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--m-muted)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 3 }}>
          {isCurrentWeek ? "Current Week" : "Next Week"}
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: "var(--m-text)" }}>
          {weekRange}
        </div>
      </div>

      {/* Next week button */}
      {nextWeekHref ? (
        <a href={nextWeekHref} style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 19, fontWeight: 700, color: "#FF5A1F",
          textDecoration: "none", padding: "10px 14px",
          background: "rgba(255,90,31,0.08)", borderRadius: 6,
          border: "1px solid rgba(255,90,31,0.2)",
          WebkitTapHighlightColor: "transparent",
        }}>
          Next →
        </a>
      ) : (
        <div style={{ width: 88 }} />
      )}
    </div>
  );
}

function GeneratePlanButton({ weekOf }: { weekOf?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function generate() {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weekOf ? { targetWeekOf: weekOf } : {}),
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
          background: state === "done" ? "#16a34a" : state === "error" ? "#dc2626" : "#FF5A1F",
          color: "#fff", borderRadius: 4, border: "none",
          fontSize: 19, fontWeight: 700, cursor: state === "loading" ? "default" : "pointer",
          width: "100%", maxWidth: 280,
        }}
      >
        {state === "idle"    ? "Generate my plan" :
         state === "loading" ? "Generating…" :
         state === "done"    ? "✓ Done!" : "Try again"}
      </button>
      {msg && (
        <div style={{ fontSize: 16, color: state === "error" ? "#f87171" : "#4ade80", marginTop: 10 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
