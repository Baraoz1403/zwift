import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

const ZO = "#F2541B";
const ZB = "#009CDF";

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
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "#3b82f6";
  if (t.includes("threshold") || t.includes("ftp")) return "#ef4444";
  if (t.includes("vo2") || t.includes("norwegian") || t.includes("60/60")) return "#22c55e";
  if (t.includes("tempo")) return "#f59e0b";
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
          background: "linear-gradient(140deg, #030c1e 0%, #09162e 55%, #04091a 100%)",
          padding: "28px 32px 24px",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {/* Ambient glows */}
          <div style={{ position: "absolute", top: -60, right: -40, width: 280, height: 280, borderRadius: "50%", background: `radial-gradient(circle, ${ZO}22 0%, transparent 65%)`, filter: "blur(40px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -20, left: -20, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${ZB}18 0%, transparent 65%)`, filter: "blur(30px)", pointerEvents: "none" }} />

          {/* Date chip */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(248,250,252,0.38)", marginBottom: 16, letterSpacing: "0.04em", position: "relative", zIndex: 1 }}>
            {dateLabel}
          </div>

          {/* Greeting */}
          <div style={{ position: "relative", zIndex: 1, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: `${ZB}cc`, marginBottom: 2 }}>{greeting}</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "#f8fafc", letterSpacing: "-1.5px", lineHeight: 1 }}>
              {firstName ?? "Athlete"}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 12, position: "relative", zIndex: 1 }}>
            {ftp && (
              <div style={{ background: `${ZB}12`, border: `1px solid ${ZB}28`, borderRadius: 12, padding: "10px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: ZB, lineHeight: 1 }}>{ftp}W</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(248,250,252,0.35)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 3 }}>FTP</div>
              </div>
            )}
            {currentPhase && (
              <div style={{ background: `${ZO}12`, border: `1px solid ${ZO}28`, borderRadius: 12, padding: "10px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: ZO, lineHeight: 1 }}>{currentPhase}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(248,250,252,0.35)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 3 }}>Phase</div>
              </div>
            )}
            {todayWorkout && (
              <div style={{ background: `${statusColor}12`, border: `1px solid ${statusColor}28`, borderRadius: 12, padding: "10px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: statusColor, lineHeight: 1 }}>{statusLabel}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(248,250,252,0.35)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 3 }}>Today</div>
              </div>
            )}
          </div>
        </div>

        {/* Workout detail */}
        <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
          {!todayWorkout ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌙</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--m-text)", marginBottom: 8 }}>Rest day</div>
              <div style={{ fontSize: 16, color: "var(--m-muted)", lineHeight: 1.6, maxWidth: 340, margin: "0 auto" }}>
                No workout scheduled. Quality rest is as important as the training itself.
              </div>
            </div>
          ) : (
            <>
              {/* Workout title */}
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: `${zoneColor}16`, border: `1px solid ${zoneColor}30`,
                  borderRadius: 8, padding: "4px 12px", marginBottom: 10,
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: zoneColor }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: zoneColor, textTransform: "uppercase", letterSpacing: ".12em" }}>{zoneLabel}</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-0.8px", lineHeight: 1.1 }}>
                  {todayWorkout.title}
                </h1>
                <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
                  {todayWorkout.durationMin > 0 && (
                    <span style={{ fontSize: 16, color: "var(--m-muted)", fontWeight: 600 }}>
                      {todayWorkout.durationMin} min
                    </span>
                  )}
                  {todayWorkout.targetPowerPctFtp && (
                    <span style={{ fontSize: 14, color: zoneColor, fontWeight: 700 }}>
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
                          display: "flex", alignItems: "center", gap: 14,
                          background: "var(--m-card)", border: "1px solid var(--m-border)",
                          borderRadius: 12, padding: "14px 16px",
                        }}>
                          <div style={{ width: 4, height: 28, borderRadius: 2, background: bc, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--m-text)" }}>
                            {reps}{block.label || block.type}{timeDet}
                          </div>
                          <span style={{ fontSize: 14, color: "var(--m-muted)", fontWeight: 500 }}>
                            {block.durationMin ?? 0} min
                          </span>
                          {pct > 0 && (
                            <div style={{
                              minWidth: 48, height: 30, borderRadius: 8,
                              background: `${bc}18`, border: `1px solid ${bc}33`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 700, color: bc,
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
          padding: "28px 24px 16px",
          borderBottom: "1px solid var(--m-border)",
          position: "sticky", top: 0, background: "var(--m-bg)", zIndex: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 4 }}>
            Training week
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-0.4px" }}>
            {plan ? "This week" : "No plan yet"}
          </div>
          {plan?.summary && (
            <div style={{ fontSize: 13, color: "var(--m-muted)", lineHeight: 1.5, marginTop: 6 }}>
              {plan.summary.slice(0, 100)}{plan.summary.length > 100 ? "…" : ""}
            </div>
          )}
        </div>

        {/* Day rows */}
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
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
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                background: isToday ? `${rowColor}12` : "var(--m-card)",
                border: `1.5px solid ${isToday ? rowColor + "50" : "var(--m-border)"}`,
                borderRadius: 14,
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Today accent */}
                {isToday && (
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: rowColor }} />
                )}

                {/* Day bubble */}
                <div style={{
                  width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                  background: isRest ? "var(--m-card-inner)" : `${rowColor}20`,
                  border: `1px solid ${isRest ? "var(--m-border)" : rowColor + "40"}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: isRest ? "var(--m-muted)" : rowColor, letterSpacing: ".4px" }}>{dayShort}</span>
                  {dateNum && (
                    <span style={{ fontSize: 16, fontWeight: 900, color: isRest ? "var(--m-muted)" : rowColor }}>{dateNum}</span>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: 700,
                    color: isRest ? "var(--m-muted)" : "var(--m-text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isRest ? "Rest" : w!.title}
                  </div>
                  {!isRest && w && (
                    <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 2 }}>
                      {w.durationMin > 0 ? `${w.durationMin} min` : ""}{w.durationMin > 0 && detectZoneLabel(w) ? "  ·  " : ""}{detectZoneLabel(w)}
                    </div>
                  )}
                </div>

                {/* Status / today badge */}
                {statusMeta ? (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: statusMeta.color,
                    background: `${statusMeta.color}18`, padding: "3px 10px", borderRadius: 7, flexShrink: 0,
                  }}>{statusMeta.text}</span>
                ) : isToday && !isRest ? (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: rowColor,
                    background: `${rowColor}18`, padding: "3px 10px", borderRadius: 7, flexShrink: 0,
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
