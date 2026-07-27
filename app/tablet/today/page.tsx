import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { fetchIcuActivities } from "@/lib/intervals";
import { fetchOwnProfile } from "@/lib/zwift";
import { computeWeekStatus } from "@/lib/activity-sync";
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

const ZO = "#FF5A1F";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const ALL_DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function buildDateMap(weekOf: string): Record<string, string> {
  const monday = new Date(weekOf + "T00:00:00Z");
  const map: Record<string, string> = {};
  ALL_DAYS.forEach((d, i) => {
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
  if (t.includes("threshold") || t.includes("ftp"))         return "#FF5A1F";
  if (t.includes("vo2") || t.includes("norwegian"))         return "#ef4444";
  if (t.includes("tempo"))                                   return "#3b82f6";
  if (t.includes("sprint") || t.includes("neuromuscular"))  return "#a855f7";
  if (t.includes("endurance") || t.includes("z2"))          return "#22d3ee";
  return ZO;
}

function detectZoneLabel(w: WeeklyWorkout): string {
  const t = (w.title + " " + (w.type ?? "")).toLowerCase();
  if (t.includes("sweet spot") || t.includes("sweetspot")) return "Sweet Spot";
  if (t.includes("threshold") || t.includes("ftp"))        return "Threshold";
  if (t.includes("vo2") || t.includes("norwegian"))        return "VO2max";
  if (t.includes("tempo"))                                  return "Tempo";
  if (t.includes("sprint") || t.includes("neuromuscular")) return "Neuromuscular";
  if (t.includes("endurance") || t.includes("z2"))         return "Endurance";
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
  const weekOf    = mondayOfCurrentWeek();
  const cookieKey = cookieStore.get("zwift_intervals_key")?.value;

  const [plan, earlyKvCreds, zwiftProfile, athleteState, cachedIdentity] = await Promise.all([
    getCachedPlan(athleteId, weekOf),
    cookieKey ? Promise.resolve(null) : getIntervalsCredentials(athleteId),
    fetchOwnProfile(session.accessToken).catch(() => null),
    getStoredAthleteState(athleteId).catch(() => null),
    getRiderIdentity(athleteId).catch(() => null),
  ]);

  const todayDate    = new Date();
  const todayStr     = todayDate.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[todayDate.getDay()];
  const dateMap      = buildDateMap(weekOf);
  const weekDates    = weekDatesFrom(weekOf);

  const workouts = (plan?.workouts ?? []).map(w => ({ ...w, date: w.date ?? dateMap[w.day] ?? undefined }));

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

  const firstName    = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp          = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;
  const macro        = (athleteState as { macroCycle?: { weekIndex: number } } | null)?.macroCycle ?? null;
  const currentPhase = macro
    ? (macro.weekIndex === 0 ? "Base" : macro.weekIndex % 4 === 3 ? "Recovery" : "Build")
    : null;

  const utcHour   = todayDate.getUTCHours();
  const localHour = (utcHour + 3) % 24;
  const greeting  = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = todayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Jerusalem" });

  const isRest     = !todayWorkout || ["rest","recovery"].some(k => (todayWorkout.type ?? "").toLowerCase().includes(k));
  const zoneColor  = !isRest && todayWorkout ? detectZoneColor(todayWorkout) : "#64748b";
  const zoneLabel  = !isRest && todayWorkout ? detectZoneLabel(todayWorkout) : "";
  const statusLabel = todayStatus === "completed" ? "Done ✓" : todayStatus === "missed" ? "Missed" : todayStatus === "bonus" ? "Bonus" : "Planned";
  const statusColor = todayStatus === "completed" ? "#22c55e" : todayStatus === "missed" ? "#ef4444" : todayStatus === "bonus" ? "#f59e0b" : "#94a3b8";

  return (
    <div style={{
      height: "100dvh", display: "flex", flexDirection: "column",
      background: "var(--m-bg)", color: "var(--m-text)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── HEADER BAR ──────────────────────────────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        background: "var(--m-card)",
        borderBottom: "1px solid var(--m-border)",
      }}>
        {/* Date + greeting */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            {greeting}{firstName ? `, ${firstName}` : ""}
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "var(--m-text)", marginTop: 2 }}>
            {dateLabel}
          </div>
        </div>

        {/* Volt AI logo — no duplicate stats here, they live in the right panel */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 4, background: ZO, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="white"><path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z"/></svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 900, color: "var(--m-muted)", letterSpacing: ".06em" }}>VOLT AI</span>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Today workout */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>

          {isRest || !todayWorkout ? (
            /* ── REST DAY ─────────────────────────────────────────────── */
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 20 }}>
                Today&apos;s session
              </div>
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderRadius: 4, padding: "40px 36px",
                display: "flex", alignItems: "center", gap: 28,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 4, flexShrink: 0,
                  background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
                }}>🌙</div>
                <div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1, marginBottom: 10 }}>
                    Rest Day
                  </div>
                  <div style={{ fontSize: 18, color: "var(--m-muted)", lineHeight: 1.6, maxWidth: 420 }}>
                    Recovery is where adaptation happens. No training today — this is the work.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── WORKOUT ──────────────────────────────────────────────── */
            <div>
              {/* Section label + status */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em" }}>
                  Today&apos;s session
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: statusColor,
                  background: `${statusColor}14`, border: `1px solid ${statusColor}30`,
                  borderRadius: 3, padding: "4px 10px",
                }}>
                  {statusLabel}
                </div>
              </div>

              {/* Main workout card */}
              <div style={{
                background: "var(--m-card)", border: "1px solid var(--m-border)",
                borderLeft: `4px solid ${zoneColor}`,
                borderRadius: 4, padding: "28px 32px", marginBottom: 16,
              }}>
                {/* Zone badge */}
                {zoneLabel && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: `${zoneColor}12`, border: `1px solid ${zoneColor}25`,
                    borderRadius: 3, padding: "3px 10px", marginBottom: 14,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: zoneColor }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: zoneColor, textTransform: "uppercase", letterSpacing: ".1em" }}>{zoneLabel}</span>
                  </div>
                )}

                <h1 style={{ margin: "0 0 12px", fontSize: 42, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-1px", lineHeight: 1.1 }}>
                  {todayWorkout.title}
                </h1>

                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  {todayWorkout.durationMin > 0 && (
                    <span style={{ fontSize: 18, fontWeight: 600, color: "var(--m-muted)" }}>
                      {todayWorkout.durationMin} min
                    </span>
                  )}
                  {todayWorkout.targetPowerPctFtp && (
                    <span style={{ fontSize: 17, fontWeight: 700, color: zoneColor }}>
                      {todayWorkout.targetPowerPctFtp}
                    </span>
                  )}
                </div>
              </div>

              {/* Power bar chart */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px 16px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>
                    Power profile
                  </div>
                  <PowerBarChart blocks={todayWorkout.structure} durationMin={todayWorkout.durationMin} />
                </div>
              )}

              {/* Description */}
              {todayWorkout.description && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>
                    Coach note
                  </div>
                  <div style={{ fontSize: 17, color: "var(--m-text)", lineHeight: 1.75 }}>
                    {todayWorkout.description}
                  </div>
                </div>
              )}

              {/* Session structure */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{
                  background: "var(--m-card)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "20px 24px",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>
                    Session structure
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {todayWorkout.structure.map((block, i) => {
                      const pct  = Math.round((block.powerFtp ?? 0) * 100);
                      const bc   = blockColor(pct);
                      const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                      const timeDet = block.type === "intervals" && block.onSec
                        ? `${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min`
                        : "";
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "11px 14px",
                          background: "var(--m-card-inner)",
                          border: "1px solid var(--m-border)",
                          borderLeft: `3px solid ${bc}`,
                          borderRadius: 4,
                        }}>
                          <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: "var(--m-text)" }}>
                            {reps && <span style={{ color: bc, marginRight: 5, fontWeight: 800 }}>{reps}</span>}
                            {block.label || block.type}
                            {timeDet && <span style={{ color: "var(--m-muted)", fontSize: 15, marginLeft: 8 }}>{timeDet}</span>}
                          </div>
                          <span style={{ fontSize: 15, color: "var(--m-muted)", flexShrink: 0 }}>{block.durationMin ?? 0} min</span>
                          {pct > 0 && (
                            <span style={{
                              fontSize: 13, fontWeight: 800, color: bc,
                              background: `${bc}12`, border: `1px solid ${bc}25`,
                              padding: "2px 8px", borderRadius: 3, flexShrink: 0,
                            }}>
                              {pct}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Week panel ─────────────────────────────────────────── */}
        <div style={{
          width: 280, flexShrink: 0,
          borderLeft: "1px solid var(--m-border)",
          background: "var(--m-card)",
          overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}>
          {/* Metrics */}
          <div style={{ padding: "24px 20px", borderBottom: "1px solid var(--m-border)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 16 }}>
              Your stats
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              {ftp && (
                <div style={{
                  flex: 1, background: `${ZO}08`, border: `1px solid ${ZO}20`,
                  borderRadius: 4, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: ZO, letterSpacing: "-.5px", lineHeight: 1 }}>{ftp}W</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ZO, opacity: 0.7, textTransform: "uppercase", letterSpacing: ".1em", marginTop: 6 }}>FTP</div>
                </div>
              )}
              {currentPhase && (
                <div style={{
                  flex: 1, background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                  borderRadius: 4, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "var(--m-text)", letterSpacing: "-.5px", lineHeight: 1 }}>{currentPhase}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 6 }}>Phase</div>
                </div>
              )}
            </div>
          </div>

          {/* Week list */}
          <div style={{ padding: "20px 16px", flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>
              This week
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {ALL_DAYS.map(dayName => {
                const w        = workouts.find(x => x.day === dayName);
                const isToday  = w?.date === todayStr;
                const dayIsRest = !w || ["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k));
                const dayStatus: DayStatus | undefined = w?.date ? weekStatus[w.date] : undefined;
                const rowColor = dayIsRest ? "var(--m-border)" : (w ? detectZoneColor(w) : ZO);
                const dateNum  = w?.date ? new Date(w.date + "T12:00:00").getDate() : null;

                return (
                  <div key={dayName} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 4,
                    background: isToday ? "var(--m-card-inner)" : "transparent",
                    border: `1px solid ${isToday ? "var(--m-border)" : "transparent"}`,
                    borderLeft: `3px solid ${isToday ? (dayIsRest ? "var(--m-border)" : rowColor) : "transparent"}`,
                  }}>
                    {/* Day bubble */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                      background: isToday ? (dayIsRest ? "rgba(100,116,139,0.08)" : `${rowColor}14`) : "var(--m-card-inner)",
                      border: `1px solid ${isToday ? (dayIsRest ? "rgba(100,116,139,0.15)" : `${rowColor}25`) : "var(--m-border)"}`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? (dayIsRest ? "var(--m-muted)" : rowColor) : "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1 }}>
                        {dayName.slice(0, 3)}
                      </div>
                      {dateNum && (
                        <div style={{ fontSize: 16, fontWeight: 900, color: isToday ? (dayIsRest ? "var(--m-muted)" : rowColor) : "var(--m-muted)", lineHeight: 1, marginTop: 1 }}>
                          {dateNum}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 15, fontWeight: isToday ? 700 : 500,
                        color: dayIsRest ? "var(--m-muted)" : "var(--m-text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {dayIsRest ? "Rest" : w!.title}
                      </div>
                      {!dayIsRest && w && (
                        <div style={{ fontSize: 13, color: rowColor as string, marginTop: 2, fontWeight: 600 }}>
                          {detectZoneLabel(w)}{w.durationMin > 0 ? ` · ${w.durationMin}m` : ""}
                        </div>
                      )}
                    </div>

                    {/* Status dot */}
                    {dayStatus === "completed" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
                    {dayStatus === "missed"    && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Plan summary */}
          {plan?.summary && (
            <div style={{ padding: "0 16px 20px" }}>
              <div style={{
                background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
                borderRadius: 4, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
                  Week plan
                </div>
                <div style={{ fontSize: 15, color: "var(--m-muted)", lineHeight: 1.65 }}>
                  {plan.summary.slice(0, 140)}{plan.summary.length > 140 ? "…" : ""}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PowerBarChart({ blocks, durationMin }: {
  blocks: Array<{ type: string; durationMin?: number; powerFtp?: number; repeats?: number; onSec?: number; offSec?: number }>;
  durationMin: number;
}) {
  const totalMin = blocks.reduce((s, b) => s + (b.durationMin ?? 0), 0) || durationMin || 60;
  const expanded: Array<{ durationMin: number; powerFtp: number }> = [];
  for (const b of blocks) {
    if (b.type === "intervals" && b.repeats && b.onSec && b.offSec) {
      const onMin = b.onSec / 60, offMin = b.offSec / 60;
      for (let r = 0; r < b.repeats; r++) {
        expanded.push({ durationMin: onMin,  powerFtp: b.powerFtp ?? 0.75 });
        expanded.push({ durationMin: offMin, powerFtp: 0.5 });
      }
    } else {
      expanded.push({ durationMin: b.durationMin ?? 0, powerFtp: b.powerFtp ?? 0.65 });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }}>
        {expanded.map((seg, i) => {
          const pct = Math.round((seg.powerFtp ?? 0) * 100);
          const color = blockColor(pct);
          const widthPct = (seg.durationMin / totalMin) * 100;
          const heightPct = Math.min(100, Math.max(8, pct));
          return (
            <div key={i} title={`${pct}% FTP · ${seg.durationMin.toFixed(1)} min`} style={{
              flex: `${widthPct} 0 0`, height: `${heightPct}%`,
              background: color, borderRadius: 2, opacity: 0.85, minWidth: 2,
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--m-muted)" }}>0</span>
        <span style={{ fontSize: 11, color: "var(--m-muted)", fontWeight: 600 }}>{totalMin} min</span>
      </div>
    </div>
  );
}
