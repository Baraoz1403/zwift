import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

const ZO = "#FF5A1F"; // Volt AI — Power Orange
const ZB = "#00C2FF"; // Volt AI — Cyan Electric

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ALL_DAYS  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildDateMap(weekOf: string): Record<string, string> {
  const monday = new Date(weekOf + "T00:00:00Z");
  const map: Record<string, string> = {};
  ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].forEach((d, i) => {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    map[d] = dt.toISOString().slice(0, 10);
  });
  return map;
}

function weekDatesFrom(weekOf: string): string[] {
  const monday = new Date(weekOf + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function detectZoneColor(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "#10b981";
  if (t.includes("threshold") || t.includes("ftp")) return "#FF5A1F";
  if (t.includes("vo2") || t.includes("norwegian") || t.includes("60/60")) return "#ef4444";
  if (t.includes("tempo")) return "#00C2FF";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "#a855f7";
  if (t.includes("rest") || t.includes("recovery")) return "#475569";
  return ZB;
}

function detectZoneLabel(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "Sweet Spot";
  if (t.includes("threshold") || t.includes("ftp")) return "Threshold";
  if (t.includes("vo2") || t.includes("norwegian") || t.includes("60/60")) return "VO2max";
  if (t.includes("tempo")) return "Tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "Neuromuscular";
  if (t.includes("endurance") || t.includes("z2")) return "Endurance";
  return "Structured";
}

function blockColor(pct: number): string {
  if (pct >= 120) return "#ef4444";
  if (pct >= 106) return "#f97316";
  if (pct >= 95)  return "#f59e0b";
  if (pct >= 88)  return "#10b981";
  if (pct >= 76)  return "#22d3ee";
  if (pct >= 56)  return "#3b82f6";
  return "#64748b";
}

export default async function TabletTodayPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = await decryptSession(raw);
  if (!session?.athleteId) return null;

  const athleteId = String(session.athleteId);
  const weekOf = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;

  const [plan, earlyKvCreds, zwiftProfile, athleteState] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
  ]);

  const todayDate    = new Date();
  const todayStr     = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];
  const dateMap      = buildDateMap(weekOf);
  const weekDates    = weekDatesFrom(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? dateMap[w.day] ?? undefined }));

  // Fetch ICU activities for week status
  let weekStatus: Record<string, DayStatus> = {};
  try {
    const cookieId = cookieStore.get("zwift_intervals_id")?.value;
    const icuKey = cookieKey ?? earlyKvCreds?.icuKey;
    const icuId  = cookieId  ?? earlyKvCreds?.icuId;
    if (icuKey && icuId) {
      const activities = await Promise.race([
        fetchIcuActivities(icuKey, icuId, weekDates[0], weekDates[6]),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 4000)),
      ]);
      weekStatus = computeWeekStatus(workouts, activities, todayStr, weekDates);
    }
  } catch { /* best-effort */ }

  const todayStatus: DayStatus = weekStatus[todayStr] ?? "planned";
  const todayWorkout =
    workouts.find(w => w.date === todayStr) ??
    workouts.find(w => w.day === todayDayName) ??
    null;

  const firstName    = zwiftProfile?.firstName ?? null;
  const ftp          = zwiftProfile?.ftp ?? null;
  const macro        = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
  const currentPhase = macro
    ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
    : null;

  const utcHour    = todayDate.getUTCHours();
  const localHour  = (utcHour + 3) % 24;
  const greeting   = localHour < 5 ? "Late night," : localHour < 12 ? "Good morning," : localHour < 17 ? "Good afternoon," : "Good evening,";
  const dateLabel  = todayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Jerusalem" });

  const zoneColor  = todayWorkout && !["Rest","rest"].includes(todayWorkout.type ?? "") ? detectZoneColor(todayWorkout) : ZB;
  const zoneLabel  = todayWorkout && !["Rest","rest"].includes(todayWorkout.type ?? "") ? detectZoneLabel(todayWorkout) : "";

  const statusLabel = todayStatus === "completed" ? "Done ✓" : todayStatus === "missed" ? "Missed" : todayStatus === "bonus" ? "Bonus" : "Planned";
  const statusColor = todayStatus === "completed" ? "#22c55e" : todayStatus === "missed" ? "#ef4444" : todayStatus === "bonus" ? "#f59e0b" : ZB;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 380px",
      gap: 0,
      minHeight: "100dvh",
      background: "var(--m-bg)",
    }}>

      {/* ── LEFT PANEL: Today's workout ────────────────────────────────────── */}
      <div style={{ borderRight: "1px solid var(--m-border)", display: "flex", flexDirection: "column" }}>

        {/* Hero header */}
        <div style={{
          background: "linear-gradient(140deg, #0D1117 0%, #17100a 55%, #0D1117 100%)",
          padding: "36px 40px 30px",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {/* Ambient glows — bigger & warmer */}
          <div style={{ position: "absolute", top: -80, right: -60, width: 360, height: 360, borderRadius: "50%", background: `radial-gradient(circle, ${ZO}28 0%, transparent 65%)`, filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -30, left: -30, width: 240, height: 240, borderRadius: "50%", background: `radial-gradient(circle, ${ZB}22 0%, transparent 65%)`, filter: "blur(36px)", pointerEvents: "none" }} />

          {/* Date chip */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(248,250,252,0.45)", marginBottom: 20, letterSpacing: "0.04em", position: "relative", zIndex: 1 }}>
            {dateLabel}
          </div>

          {/* Greeting */}
          <div style={{ position: "relative", zIndex: 1, marginBottom: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: `${ZB}dd`, marginBottom: 4 }}>{greeting}</div>
            <div style={{ fontSize: 54, fontWeight: 900, color: "#f0f6ff", letterSpacing: "-2px", lineHeight: 1 }}>
              {firstName ?? "Athlete"}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 14, position: "relative", zIndex: 1 }}>
            {ftp && (
              <div style={{ background: `${ZB}16`, border: `1px solid ${ZB}35`, borderRadius: 14, padding: "14px 22px" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: ZB, lineHeight: 1 }}>{ftp}W</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: ".14em", marginTop: 5 }}>FTP</div>
              </div>
            )}
            {currentPhase && (
              <div style={{ background: `${ZO}16`, border: `1px solid ${ZO}35`, borderRadius: 14, padding: "14px 22px" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: ZO, lineHeight: 1 }}>{currentPhase}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: ".14em", marginTop: 5 }}>Phase</div>
              </div>
            )}
            {todayWorkout && (
              <div style={{ background: `${statusColor}16`, border: `1px solid ${statusColor}35`, borderRadius: 14, padding: "14px 22px" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: statusColor, lineHeight: 1 }}>{statusLabel}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(248,250,252,0.40)", textTransform: "uppercase", letterSpacing: ".14em", marginTop: 5 }}>Today</div>
              </div>
            )}
          </div>
        </div>

        {/* Workout detail */}
        <div style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
          {!todayWorkout ? (
            <div style={{ maxWidth: 480, margin: "60px auto", textAlign: "center", padding: "0 24px" }}>
              <div style={{ fontSize: 56, marginBottom: 20 }}>🌙</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "var(--m-text)", marginBottom: 12, letterSpacing: "-0.5px" }}>Rest Day</div>
              <div style={{ fontSize: 17, color: "var(--m-muted)", lineHeight: 1.7, maxWidth: 340, margin: "0 auto" }}>
                No workout scheduled today. Quality rest is where adaptation happens — this day is as important as any session.
              </div>
            </div>
          ) : (
            <>
              {/* Workout title */}
              <div style={{ marginBottom: 28 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: `${zoneColor}18`, border: `1px solid ${zoneColor}35`,
                  borderRadius: 10, padding: "6px 14px", marginBottom: 14,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: zoneColor }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: zoneColor, textTransform: "uppercase", letterSpacing: ".12em" }}>{zoneLabel}</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 38, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1.08 }}>
                  {todayWorkout.title}
                </h1>
                <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
                  {todayWorkout.durationMin > 0 && (
                    <span style={{ fontSize: 18, color: "var(--m-muted)", fontWeight: 600 }}>
                      {todayWorkout.durationMin} min
                    </span>
                  )}
                  {todayWorkout.targetPowerPctFtp && (
                    <span style={{ fontSize: 16, color: zoneColor, fontWeight: 700 }}>
                      {todayWorkout.targetPowerPctFtp}
                    </span>
                  )}
                </div>
              </div>

              {/* Power chart */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{ marginBottom: 24, borderRadius: 16, overflow: "hidden", background: "var(--m-card)", border: "1px solid var(--m-border)" }}>
                  <PowerBarChart blocks={todayWorkout.structure} durationMin={todayWorkout.durationMin} />
                </div>
              )}

              {/* Description */}
              {todayWorkout.description && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 16, padding: "16px 20px", marginBottom: 20,
                  fontSize: 15, color: "var(--m-muted)", lineHeight: 1.65,
                }}>
                  {todayWorkout.description}
                </div>
              )}

              {/* Interval blocks */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
                    Session structure
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {todayWorkout.structure.map((block, i) => {
                      const pct = Math.round((block.powerFtp ?? 0) * 100);
                      const bc  = blockColor(pct);
                      const reps = block.type === "intervals" && block.repeats ? `${block.repeats}× ` : "";
                      const timeDet = block.type === "intervals" && block.onSec
                        ? ` (${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min)`
                        : "";
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 16,
                          background: "var(--m-card)", border: "1px solid var(--m-border)",
                          borderRadius: 14, padding: "16px 20px",
                        }}>
                          <div style={{ width: 5, height: 32, borderRadius: 3, background: bc, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--m-text)" }}>
                            {reps}{block.label || block.type}{timeDet}
                          </div>
                          <span style={{ fontSize: 15, color: "var(--m-muted)", fontWeight: 500 }}>
                            {block.durationMin ?? 0} min
                          </span>
                          {pct > 0 && (
                            <div style={{
                              minWidth: 54, height: 34, borderRadius: 9,
                              background: `${bc}18`, border: `1px solid ${bc}33`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 14, fontWeight: 700, color: bc,
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
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Week overview ─────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {/* Week header */}
        <div style={{
          padding: "36px 28px 20px",
          borderBottom: "1px solid var(--m-border)",
          position: "sticky", top: 0, background: "var(--m-bg)", zIndex: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 6 }}>
            Training week
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-0.5px" }}>
            {plan ? "This week" : "No plan yet"}
          </div>
          {plan?.summary && (
            <div style={{ fontSize: 14, color: "var(--m-muted)", lineHeight: 1.5, marginTop: 8 }}>
              {plan.summary.slice(0, 100)}{plan.summary.length > 100 ? "…" : ""}
            </div>
          )}
        </div>

        {/* Day rows */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {ALL_DAYS.map(dayName => {
            const w = workouts.find(x => x.day === dayName);
            const isToday = w?.date === todayStr;
            const isRest  = !w || w.type === "Rest" || w.type?.toLowerCase().includes("rest");
            const dayStatus: DayStatus | undefined = w?.date ? weekStatus[w.date] : undefined;

            const rowColor = isRest ? "var(--m-muted)" : (w ? detectZoneColor(w) : ZB);
            const statusMeta =
              dayStatus === "completed" ? { text: "Done",   color: "#22c55e" } :
              dayStatus === "missed"    ? { text: "Missed", color: "#ef4444" } :
              dayStatus === "bonus"     ? { text: "Bonus",  color: "#f59e0b" } :
              null;

            // Day + date number
            const dateNum = w?.date ? new Date(w.date + "T12:00:00").getDate() : null;
            const dayShort = dayName.slice(0, 3).toUpperCase();

            return (
              <div key={dayName} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: isToday ? `${rowColor}14` : "var(--m-card)",
                border: `1.5px solid ${isToday ? rowColor + "55" : "var(--m-border)"}`,
                borderRadius: 16,
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Today accent */}
                {isToday && (
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: rowColor }} />
                )}

                {/* Day bubble */}
                <div style={{
                  width: 50, height: 50, borderRadius: 13, flexShrink: 0,
                  background: isRest ? "var(--m-card-inner)" : `${rowColor}22`,
                  border: `1px solid ${isRest ? "var(--m-border)" : rowColor + "45"}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: isRest ? "var(--m-muted)" : rowColor, letterSpacing: ".4px" }}>{dayShort}</span>
                  {dateNum && (
                    <span style={{ fontSize: 18, fontWeight: 900, color: isRest ? "var(--m-muted)" : rowColor }}>{dateNum}</span>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 16, fontWeight: 700,
                    color: isRest ? "var(--m-muted)" : "var(--m-text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isRest ? "Rest" : w!.title}
                  </div>
                  {!isRest && w && (
                    <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 3 }}>
                      {w.durationMin > 0 ? `${w.durationMin} min` : ""}{w.durationMin > 0 && detectZoneLabel(w) ? "  ·  " : ""}{detectZoneLabel(w)}
                    </div>
                  )}
                </div>

                {/* Status / today badge */}
                {statusMeta ? (
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: statusMeta.color,
                    background: `${statusMeta.color}18`, padding: "4px 12px", borderRadius: 9, flexShrink: 0,
                  }}>{statusMeta.text}</span>
                ) : isToday && !isRest ? (
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: rowColor,
                    background: `${rowColor}18`, padding: "4px 12px", borderRadius: 9, flexShrink: 0,
                  }}>TODAY</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Inline power bar chart (no client component needed for a static render) ───

function PowerBarChart({ blocks, durationMin }: {
  blocks: Array<{ type: string; durationMin?: number; powerFtp?: number; repeats?: number; onSec?: number; offSec?: number }>;
  durationMin: number;
}) {
  const totalMin = blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0) || durationMin || 60;

  // Expand interval repeats for display
  const expanded: Array<{ durationMin: number; powerFtp: number; type: string }> = [];
  for (const b of blocks) {
    if (b.type === "intervals" && b.repeats && b.onSec && b.offSec) {
      const onMin  = b.onSec  / 60;
      const offMin = b.offSec / 60;
      for (let r = 0; r < b.repeats; r++) {
        expanded.push({ durationMin: onMin,  powerFtp: b.powerFtp ?? 0.75, type: "on" });
        expanded.push({ durationMin: offMin, powerFtp: 0.5,                type: "off" });
      }
    } else {
      expanded.push({ durationMin: b.durationMin ?? 0, powerFtp: b.powerFtp ?? 0.65, type: b.type });
    }
  }

  return (
    <div style={{ padding: "20px 20px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 72 }}>
        {expanded.map((seg, i) => {
          const pct = Math.round((seg.powerFtp ?? 0) * 100);
          const color = blockColor(pct);
          const widthPct = (seg.durationMin / totalMin) * 100;
          const heightPct = Math.min(100, Math.max(8, pct));
          return (
            <div
              key={i}
              title={`${pct}% FTP · ${seg.durationMin.toFixed(1)} min`}
              style={{
                flex: `${widthPct} 0 0`,
                height: `${heightPct}%`,
                background: color,
                borderRadius: 3,
                opacity: 0.85,
                minWidth: 2,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "var(--m-muted)" }}>0</span>
        <span style={{ fontSize: 12, color: "var(--m-muted)", fontWeight: 600 }}>{totalMin} min</span>
      </div>
    </div>
  );
}
