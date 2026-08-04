/**
 * TabletWeekSidebar — shared right-panel for Today, Week, and Coach pages.
 * Shows FTP + training phase + sessions count, optional bonus-ride highlight,
 * the week's workout list with status dots, and the week plan summary.
 *
 * Matches the inline sidebar layout of tablet/today/page.tsx exactly so all
 * three pages feel consistent.
 */
import type { WeeklyWorkout } from "@/lib/ai";
import type { DayStatus } from "@/lib/activity-sync";

const ZO = "#FF5A1F";
const ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

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

interface Props {
  ftp: number | null;
  currentPhase: string | null;
  weekDisplayNum?: number | null;
  workouts: WeeklyWorkout[];
  weekStatus: Record<string, DayStatus>;
  todayStr: string;
  planSummary?: string | null;
  /** Number of non-rest workouts this week */
  weekWorkoutCount?: number;
  /** True when athlete rode on today's rest day */
  isBonus?: boolean;
  todayActivityName?: string | null;
  todayActivityDurationMin?: number | null;
  todayAvgHr?: number | null;
  /** Training load metrics */
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  freshness?: string | null;
}

export function TabletWeekSidebar({
  ftp, currentPhase, weekDisplayNum, workouts, weekStatus, todayStr, planSummary,
  weekWorkoutCount, isBonus, todayActivityName, todayActivityDurationMin, todayAvgHr,
  ctl, atl, tsb, freshness,
}: Props) {
  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderLeft: "1px solid var(--m-border)",
      background: "var(--m-card)",
      overflowY: "auto",
      overscrollBehavior: "contain",
      display: "flex", flexDirection: "column",
    }}>

      {/* ── Stats — sticky so always visible ──────────────────────────── */}
      <div style={{
        padding: "20px 16px", borderBottom: "1px solid var(--m-border)",
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--m-card)",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 12 }}>
          Fitness metrics
        </div>
        {/* FTP — cyan, full width */}
        {ftp && (
          <div style={{
            background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.2)",
            borderRadius: 8, padding: "14px 16px", marginBottom: 8,
            display: "flex", alignItems: "baseline", gap: 6,
          }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: "#22d3ee", letterSpacing: "-1px", lineHeight: 1 }}>{ftp}W</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(34,211,238,0.55)", textTransform: "uppercase", letterSpacing: ".1em" }}>FTP</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {/* Phase — orange */}
          {currentPhase && (
            <div style={{
              flex: 1, background: "rgba(255,90,31,0.07)", border: "1px solid rgba(255,90,31,0.2)",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#FF5A1F", lineHeight: 1 }}>{currentPhase}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,90,31,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 4 }}>
                {weekDisplayNum != null ? `Week ${weekDisplayNum}` : "Phase"}
              </div>
            </div>
          )}
          {/* Sessions this week — purple */}
          {weekWorkoutCount != null && weekWorkoutCount > 0 && (
            <div style={{
              flex: 1, background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#8b5cf6", lineHeight: 1 }}>{weekWorkoutCount}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(139,92,246,0.55)", textTransform: "uppercase", letterSpacing: ".1em", marginTop: 4 }}>Sessions</div>
            </div>
          )}
        </div>
        {/* CTL / ATL / TSB — training load row */}
        {(ctl != null || atl != null || tsb != null) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {ctl != null && (
              <div style={{
                flex: 1, background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#3b82f6", lineHeight: 1 }}>{Math.round(ctl)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(59,130,246,0.6)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>CTL</div>
              </div>
            )}
            {atl != null && (
              <div style={{
                flex: 1, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{Math.round(atl)}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(245,158,11,0.6)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>ATL</div>
              </div>
            )}
            {tsb != null && (
              <div style={{
                flex: 1,
                background: tsb >= 0 ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
                border: `1px solid ${tsb >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                borderRadius: 8, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: tsb >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>
                  {tsb > 0 ? "+" : ""}{Math.round(tsb)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: tsb >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>TSB</div>
              </div>
            )}
          </div>
        )}
        {/* Bonus ride highlight */}
        {isBonus && (
          <div style={{
            marginTop: 10,
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>
              🚴 Bonus ride today
            </div>
            {todayActivityName && (
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 6, lineHeight: 1.3 }}>
                {todayActivityName.length > 28 ? todayActivityName.slice(0, 26) + "…" : todayActivityName}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {todayActivityDurationMin != null && (
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{todayActivityDurationMin} min</span>
              )}
              {todayAvgHr != null && (
                <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{Math.round(todayAvgHr)} bpm</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Week list ─────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 16px", flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>
          This week
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {ALL_DAYS.map(dayName => {
            const w         = workouts.find(x => x.day === dayName);
            const isToday   = w?.date === todayStr;
            const dayIsRest = !w || ["rest","recovery"].some(k => (w.type ?? "").toLowerCase().includes(k));
            const dayStatus: DayStatus | undefined = w?.date ? weekStatus[w.date] : undefined;
            const rowColor  = dayIsRest ? "var(--m-border)" : (w ? detectZoneColor(w) : ZO);
            const dateNum   = w?.date ? new Date(w.date + "T12:00:00").getDate() : null;

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

                {/* Workout info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 15, fontWeight: isToday ? 700 : 500,
                    color: dayIsRest ? "var(--m-muted)" : "var(--m-text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {dayIsRest ? (isToday && isBonus ? "Rest + Bonus 🚴" : "Rest") : w!.title}
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
                {dayStatus === "bonus"     && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Week plan summary ─────────────────────────────────────────── */}
      {planSummary && (
        <div style={{ padding: "0 16px 20px" }}>
          <div style={{
            background: "var(--m-card-inner)", border: "1px solid var(--m-border)",
            borderRadius: 4, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>
              Week plan
            </div>
            <div style={{ fontSize: 15, color: "var(--m-muted)", lineHeight: 1.65 }}>
              {planSummary.slice(0, 140)}{planSummary.length > 140 ? "…" : ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
