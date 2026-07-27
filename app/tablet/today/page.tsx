import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { getCachedPlan, getIntervalsCredentials, getStoredAthleteState, getRiderIdentity } from "@/lib/kv-plan-state";
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

  const firstName    = zwiftProfile?.firstName ?? cachedIdentity?.firstName ?? null;
  const ftp          = zwiftProfile?.ftp ?? cachedIdentity?.ftp ?? null;
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
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#0D1117", color: "#f0f6ff", fontFamily: "system-ui,-apple-system,sans-serif", overflow: "hidden" }}>

      {/* ── TOP NAV ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 52, display: "flex", alignItems: "center",
        padding: "0 28px", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
      }}>
        {/* Volt AI logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: `linear-gradient(135deg, ${ZO} 0%, ${ZB} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 10px ${ZO}50`,
          }}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="white">
              <path d="M13 1L3 11h5.5L6 19l11-10h-5.5L13 1Z" />
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", color: "#fff" }}>VOLT AI</span>
        </div>

        {/* Date */}
        <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(248,250,252,0.45)" }}>{dateLabel}</span>

        {/* Rider stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {ftp && <span style={{ fontSize: 14, fontWeight: 700, color: ZB }}>{ftp} W</span>}
          {currentPhase && <span style={{ fontSize: 13, fontWeight: 700, color: ZO, background: `${ZO}15`, padding: "3px 10px", borderRadius: 6 }}>{currentPhase}</span>}
          {firstName && <span style={{ fontSize: 14, color: "rgba(248,250,252,0.55)", fontWeight: 500 }}>{firstName}</span>}
        </div>
      </div>

      {/* ── MAIN BODY ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT: Today */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px 40px" }}>

          {/* Greeting */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: `${ZB}bb`, marginBottom: 2 }}>{greeting}</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", lineHeight: 1 }}>
              {firstName ?? "Athlete"}
            </div>
          </div>

          {/* Section label */}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(248,250,252,0.28)", marginBottom: 18 }}>
            Today&apos;s session
          </div>

          {!todayWorkout ? (
            /* REST DAY — no dark box */
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "8px 0 32px" }}>
              <span style={{ fontSize: 38 }}>🌙</span>
              <div>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#f0f6ff", letterSpacing: "-0.5px" }}>Rest Day</div>
                <div style={{ fontSize: 15, color: "rgba(248,250,252,0.40)", marginTop: 5, lineHeight: 1.5, maxWidth: 380 }}>
                  Recovery is where adaptation happens. No training today — this is the work.
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Zone + title */}
              <div style={{ marginBottom: 22 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  background: `${zoneColor}14`, border: `1px solid ${zoneColor}28`,
                  borderRadius: 8, padding: "4px 11px", marginBottom: 10,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: zoneColor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: zoneColor, textTransform: "uppercase", letterSpacing: ".1em" }}>{zoneLabel}</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.08 }}>
                  {todayWorkout.title}
                </h1>
                <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "center" }}>
                  {todayWorkout.durationMin > 0 && (
                    <span style={{ fontSize: 16, color: "rgba(248,250,252,0.45)", fontWeight: 600 }}>{todayWorkout.durationMin} min</span>
                  )}
                  {todayWorkout.targetPowerPctFtp && (
                    <span style={{ fontSize: 14, color: zoneColor, fontWeight: 700 }}>{todayWorkout.targetPowerPctFtp}</span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: statusColor, background: `${statusColor}14`, padding: "3px 9px", borderRadius: 6 }}>{statusLabel}</span>
                </div>
              </div>

              {/* Power chart */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div style={{ marginBottom: 20, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <PowerBarChart blocks={todayWorkout.structure} durationMin={todayWorkout.durationMin} />
                </div>
              )}

              {/* Description */}
              {todayWorkout.description && (
                <div style={{ fontSize: 15, color: "rgba(248,250,252,0.55)", lineHeight: 1.70, marginBottom: 24, maxWidth: 580 }}>
                  {todayWorkout.description}
                </div>
              )}

              {/* Session blocks */}
              {todayWorkout.structure && todayWorkout.structure.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(248,250,252,0.28)", marginBottom: 10 }}>
                    Session structure
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {todayWorkout.structure.map((block, i) => {
                      const pct = Math.round((block.powerFtp ?? 0) * 100);
                      const bc  = blockColor(pct);
                      const reps = block.type === "intervals" && block.repeats ? `${block.repeats}×` : "";
                      const timeDet = block.type === "intervals" && block.onSec
                        ? `${Math.round(block.onSec / 60)}/${Math.round((block.offSec ?? 0) / 60)} min`
                        : "";
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "11px 16px",
                          background: "rgba(255,255,255,0.025)",
                          borderRadius: 10,
                          borderLeft: `3px solid ${bc}`,
                        }}>
                          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                            {reps && <span style={{ color: bc, marginRight: 5 }}>{reps}</span>}
                            {block.label || block.type}
                            {timeDet && <span style={{ color: "rgba(248,250,252,0.35)", fontSize: 13, marginLeft: 7 }}>{timeDet}</span>}
                          </div>
                          <span style={{ fontSize: 13, color: "rgba(248,250,252,0.35)" }}>{block.durationMin ?? 0} min</span>
                          {pct > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: bc, background: `${bc}14`, padding: "2px 8px", borderRadius: 5 }}>
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

        {/* RIGHT: Week panel */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.07)", overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* Metrics */}
          <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(248,250,252,0.28)", marginBottom: 14 }}>Your metrics</div>
            <div style={{ display: "flex", gap: 20 }}>
              {ftp && (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: ZB, letterSpacing: "-0.5px", lineHeight: 1 }}>{ftp}W</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(248,250,252,0.35)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>FTP</div>
                </div>
              )}
              {currentPhase && (
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: ZO, letterSpacing: "-0.5px", lineHeight: 1 }}>{currentPhase}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(248,250,252,0.35)", textTransform: "uppercase", letterSpacing: ".12em", marginTop: 4 }}>Phase</div>
                </div>
              )}
            </div>
          </div>

          {/* Week label */}
          <div style={{ padding: "18px 20px 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(248,250,252,0.28)" }}>This week</div>
          </div>

          {/* Day rows */}
          <div style={{ padding: "0 12px 20px", flex: 1 }}>
            {ALL_DAYS.map(dayName => {
              const w = workouts.find(x => x.day === dayName);
              const isToday = w?.date === todayStr;
              const isRest  = !w || w.type === "Rest" || w.type?.toLowerCase().includes("rest");
              const dayStatus: DayStatus | undefined = w?.date ? weekStatus[w.date] : undefined;
              const rowColor = isRest ? "rgba(248,250,252,0.25)" : (w ? detectZoneColor(w) : ZB);
              const dateNum  = w?.date ? new Date(w.date + "T12:00:00").getDate() : null;
              const dayShort = dayName.slice(0, 3);

              return (
                <div key={dayName} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 10px",
                  borderRadius: 9,
                  borderLeft: `3px solid ${isToday ? rowColor : "transparent"}`,
                  background: isToday ? `${rowColor}10` : "transparent",
                  marginBottom: 2,
                }}>
                  {/* Day / date */}
                  <div style={{ width: 34, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? rowColor : "rgba(248,250,252,0.30)", letterSpacing: ".04em", textTransform: "uppercase" }}>{dayShort}</div>
                    {dateNum && <div style={{ fontSize: 15, fontWeight: 900, color: isToday ? rowColor : "rgba(248,250,252,0.45)", lineHeight: 1 }}>{dateNum}</div>}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isRest ? "rgba(248,250,252,0.25)" : (isToday ? "#fff" : "rgba(248,250,252,0.70)"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isRest ? "Rest" : w!.title}
                    </div>
                    {!isRest && w && (
                      <div style={{ fontSize: 11, color: rowColor, marginTop: 1, fontWeight: 500, opacity: 0.8 }}>
                        {detectZoneLabel(w)}{w.durationMin > 0 ? ` · ${w.durationMin}m` : ""}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  {dayStatus === "completed" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
                  {dayStatus === "missed"    && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>

          {/* Plan summary */}
          {plan?.summary && (
            <div style={{ margin: "0 12px 20px", padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 12, color: "rgba(248,250,252,0.40)", lineHeight: 1.6 }}>
                {plan.summary.slice(0, 130)}{plan.summary.length > 130 ? "…" : ""}
              </div>
            </div>
          )}
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
