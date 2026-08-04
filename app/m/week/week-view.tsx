"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { WeeklyWorkout } from "@/lib/ai";
import MobileWorkoutChart from "@/app/m/today/workout-chart";
import { isRunWorkout } from "@/lib/zwo";

// ── Bonus activity helpers ───────────────────────────────────────────────────
export interface BonusActivityInfo {
  durationMin?: number;
  avgPower?: number;
  normalizedPower?: number;
  avgHr?: number;
  tss?: number;
  distanceKm?: number;
  sport?: string;
}

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
  weekRange: string;
  today: string;
  summary: string | null;
  weekStatus?: Record<string, string>;
  bonusActivities?: Record<string, BonusActivityInfo>;
  prevWeekHref: string | null;
  nextWeekHref: string | null;
  isCurrentWeek: boolean;
  /** On tablet, TabletPageHeader already shows the week range — hide WeekNav. */
  hideNav?: boolean;
}

export default function WeekView({ workouts, weekOf, weekRange, today, summary, weekStatus = {}, bonusActivities = {} as Record<string, BonusActivityInfo>, prevWeekHref, nextWeekHref, isCurrentWeek, hideNav = false }: Props) {
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
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--m-text)", marginBottom: 8 }}>
            {isCurrentWeek ? "No plan yet" : "No plan for this week"}
          </div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.6, marginBottom: 28 }}>
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
    <div style={{ padding: "0 0 0" }}>

      {!hideNav && <WeekNav weekRange={weekRange} prevWeekHref={prevWeekHref} nextWeekHref={nextWeekHref} isCurrentWeek={isCurrentWeek} />}

      <div style={{ padding: "0 16px" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.6px", marginTop: 0 }}>
          {isCurrentWeek ? "This Week" : "Next Week"}
        </div>

        {/* Coach note */}
        {bullets.length > 0 && (
          <div style={{
            marginTop: 10,
            background: "var(--m-card-inner)", borderRadius: 4, padding: "12px 14px",
            border: "1px solid var(--m-border)",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 2 }}>Coach note</div>
            {bullets.map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#FF5A1F", flexShrink: 0, marginTop: 6 }} />
                <span style={{ fontSize: 13, color: "var(--m-muted)", lineHeight: 1.55 }}>{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8, paddingBottom: 8 }}>
        {ALL_DAYS.map(dayName => {
          const w = workouts.find(x => x.day === dayName);
          const isToday = w?.date === today;
          const zone = w ? detectZone(w) : "rest";
          const colors = ZONE_COLOR[zone] ?? ZONE_COLOR.rest;
          const dayStatus = w?.date ? weekStatus[w.date] : undefined;
          const isBonus = dayStatus === "bonus";
          const bonusInfo: BonusActivityInfo | undefined = isBonus
            ? (bonusActivities[w?.date ?? ""] ?? undefined)
            : undefined;
          const isRest = !isBonus && (zone === "rest" || !w);
          const label = formatDayLabel(w?.date, dayName);
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
                tabIndex={(isRest && !isBonus) ? undefined : 0}
                onClick={() => { if (!isRest || isBonus) setExpanded(isOpen ? null : dayName); }}
                style={{
                  background:
                    dayStatus === "completed" ? "rgba(34,197,94,0.05)" :
                    dayStatus === "missed"    ? "rgba(239,68,68,0.05)" :
                    dayStatus === "bonus"     ? "rgba(245,158,11,0.06)" :
                    isToday ? `${colors.accent}0d` : "var(--m-card)",
                  borderRadius: isOpen ? "4px 4px 0 0" : 4,
                  border:
                    dayStatus === "completed" ? "1px solid rgba(34,197,94,0.25)" :
                    dayStatus === "missed"    ? "1px solid rgba(239,68,68,0.20)" :
                    dayStatus === "bonus"     ? "1px solid rgba(245,158,11,0.25)" :
                    isToday ? `1.5px solid ${colors.accent}55` : "1px solid var(--m-border)",
                  borderBottom: isOpen ? "none" : undefined,
                  padding: "16px 14px",
                  cursor: (isRest && !isBonus) ? "default" : "pointer",
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
                    background: colors.accent, borderRadius: "4px 0 0 4px",
                  }} />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: isToday ? 8 : 0 }}>
                  {/* Day bubble */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 4, flexShrink: 0,
                    background: isRest ? "var(--m-card-inner)" : `${colors.accent}18`,
                    border: `1px solid ${isRest ? "var(--m-border)" : colors.accent + "44"}`,
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 1,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isRest ? "var(--m-muted)" : colors.accent, letterSpacing: ".3px" }}>
                      {label.short.toUpperCase()}
                    </span>
                    {label.dateNum && (
                      <span style={{ fontSize: 20, fontWeight: 800, color: isRest ? "var(--m-muted)" : colors.accent }}>
                        {label.dateNum}
                      </span>
                    )}
                  </div>

                  {/* Workout info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 20, fontWeight: 700,
                        color: isRest ? "var(--m-muted)" : "var(--m-text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1, minWidth: 0,
                      }}>
                        {isBonus ? "Bonus ride" : isRest ? "Rest" : w!.title}
                      </span>
                      {isToday && !statusMeta && (
                        <span style={{
                          fontSize: 12, fontWeight: 700, color: colors.accent,
                          background: `${colors.accent}22`, padding: "3px 8px", borderRadius: 3, flexShrink: 0,
                        }}>TODAY</span>
                      )}
                      {statusMeta && (
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: statusMeta.color,
                          background: statusMeta.bg, padding: "3px 9px", borderRadius: 3, flexShrink: 0,
                        }}>{statusMeta.text}</span>
                      )}
                    </div>

                    {isBonus && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "2px 8px", flexShrink: 0 }}>
                          {bonusInfo?.sport?.toLowerCase().includes("run") ? "RUN" : "RIDE"}
                        </span>
                        {bonusInfo?.durationMin ? <span style={{ fontSize: 16, color: "#64748b" }}>{bonusInfo.durationMin} min</span> : null}
                        {bonusInfo?.avgPower ? <span style={{ fontSize: 15, fontWeight: 600, color: "#f59e0b" }}>{Math.round(bonusInfo.avgPower)}W avg</span> : null}
                        <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--m-muted)", display: "inline-block", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>&#8964;</span>
                      </div>
                    )}
                    {!isRest && !isBonus && w && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {/* RIDE / RUN mode badge */}
                        <span style={{
                          fontSize: 12, fontWeight: 800,
                          color: isRunWorkout(w.type) ? "#f97316" : "#3b82f6",
                          background: isRunWorkout(w.type) ? "rgba(249,115,22,0.12)" : "rgba(59,130,246,0.12)",
                          border: `1px solid ${isRunWorkout(w.type) ? "rgba(249,115,22,0.3)" : "rgba(59,130,246,0.3)"}`,
                          borderRadius: 3, padding: "2px 8px", flexShrink: 0,
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
                          marginLeft: "auto", fontSize: 14, color: "var(--m-muted)",
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

              {/* Bonus activity expanded panel */}
              {isOpen && isBonus && (
                <div style={{ background: "var(--m-card)", border: "1px solid rgba(245,158,11,0.3)", borderTop: "none", borderRadius: "0 0 4px 4px", padding: "14px 16px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10 }}>Bonus — rode on rest day</div>
                  {bonusInfo ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {bonusInfo.durationMin ? <div style={{ background: "var(--m-card-inner)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "8px 12px", textAlign: "center", minWidth: 64 }}><div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>Duration</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-text)", marginTop: 2 }}>{bonusInfo.durationMin}<span style={{ fontSize: 11, color: "var(--m-muted)", marginLeft: 2 }}>min</span></div></div> : null}
                      {(bonusInfo.normalizedPower ?? bonusInfo.avgPower) ? <div style={{ background: "var(--m-card-inner)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "8px 12px", textAlign: "center", minWidth: 64 }}><div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>{bonusInfo.normalizedPower ? "NP" : "Avg W"}</div><div style={{ fontSize: 18, fontWeight: 800, color: "#f59e0b", marginTop: 2 }}>{Math.round(bonusInfo.normalizedPower ?? bonusInfo.avgPower ?? 0)}<span style={{ fontSize: 11, color: "var(--m-muted)", marginLeft: 2 }}>W</span></div></div> : null}
                      {bonusInfo.avgHr ? <div style={{ background: "var(--m-card-inner)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "8px 12px", textAlign: "center", minWidth: 64 }}><div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>HR</div><div style={{ fontSize: 18, fontWeight: 800, color: "#ef4444", marginTop: 2 }}>{Math.round(bonusInfo.avgHr)}<span style={{ fontSize: 11, color: "var(--m-muted)", marginLeft: 2 }}>bpm</span></div></div> : null}
                      {bonusInfo.tss ? <div style={{ background: "var(--m-card-inner)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "8px 12px", textAlign: "center", minWidth: 64 }}><div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>TSS</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-text)", marginTop: 2 }}>{Math.round(bonusInfo.tss)}</div></div> : null}
                      {bonusInfo.distanceKm && bonusInfo.distanceKm > 0 ? <div style={{ background: "var(--m-card-inner)", border: "1px solid var(--m-border)", borderRadius: 4, padding: "8px 12px", textAlign: "center", minWidth: 64 }}><div style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>Distance</div><div style={{ fontSize: 18, fontWeight: 800, color: "var(--m-text)", marginTop: 2 }}>{bonusInfo.distanceKm.toFixed(1)}<span style={{ fontSize: 11, color: "var(--m-muted)", marginLeft: 2 }}>km</span></div></div> : null}
                    </div>
                  ) : <div style={{ fontSize: 14, color: "var(--m-muted)" }}>Rode on rest day — no data.</div>}
                </div>
              )}

              {/* Planned workout expanded detail panel */}
              {isOpen && !isRest && !isBonus && w && (
                <div style={{
                  background: "var(--m-card)",
                  border: "1px solid var(--m-border)", borderTop: "1px solid var(--m-border)",
                  borderRadius: "0 0 4px 4px",
                  padding: "12px 16px 16px",
                }}>
                  {/* Power chart */}
                  {w.structure && w.structure.length > 0 && (
                    <div style={{ borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                      <MobileWorkoutChart blocks={w.structure} durationMin={w.durationMin} />
                    </div>
                  )}

                  {/* Short description */}
                  {w.description && (
                    <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.5, marginBottom: 10 }}>
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
                            background: "var(--m-card-inner)", borderRadius: 4, padding: "10px 12px",
                            border: "1px solid var(--m-border)",
                          }}>
                            <div style={{ width: 3, height: 22, borderRadius: 2, background: barColor, flexShrink: 0 }} />
                            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--m-text)" }}>
                              {reps}{block.label || block.type}{repDetail}
                            </div>
                            <span style={{ fontSize: 13, color: "var(--m-muted)" }}>
                              {block.durationMin ?? 0} min
                            </span>
                            {pct > 0 && (
                              <div style={{
                                width: 42, height: 28, borderRadius: 3,
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
                    <div style={{ fontSize: 14, color: "var(--m-muted)" }}>No detailed structure.</div>
                  )}

                  {/* CTA for today */}
                  {isToday && (
                    <a href={todayHref} style={{
                      display: "block", marginTop: 12, textAlign: "center",
                      padding: "12px", borderRadius: 4,
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
      padding: "12px 16px 10px",
      borderBottom: "1px solid var(--m-border)",
      background: "var(--m-bg)",
      position: "sticky", top: 0, zIndex: 10,
    }}>
      {/* Prev week button */}
      {prevWeekHref ? (
        <a href={prevWeekHref} style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 15, fontWeight: 700, color: "#FF5A1F",
          textDecoration: "none", padding: "8px 12px",
          background: "rgba(255,90,31,0.08)", borderRadius: 4,
          border: "1px solid rgba(255,90,31,0.2)",
          WebkitTapHighlightColor: "transparent",
        }}>
          ← Now
        </a>
      ) : (
        <div style={{ width: 80 }} />
      )}

      {/* Week label */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
          {isCurrentWeek ? "Current Week" : "Next Week"}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--m-text)", marginTop: 1 }}>
          {weekRange}
        </div>
      </div>

      {/* Next week button */}
      {nextWeekHref ? (
        <a href={nextWeekHref} style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 15, fontWeight: 700, color: "#FF5A1F",
          textDecoration: "none", padding: "8px 12px",
          background: "rgba(255,90,31,0.08)", borderRadius: 4,
          border: "1px solid rgba(255,90,31,0.2)",
          WebkitTapHighlightColor: "transparent",
        }}>
          Next →
        </a>
      ) : (
        <div style={{ width: 80 }} />
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
        body: JSON.stringify(weekOf ? { weekOf } : {}),
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
