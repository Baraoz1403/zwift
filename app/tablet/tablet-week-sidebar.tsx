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
      display: "flex", flexDirection: "column",
      overflowY: "auto",
    }}>

      {/* ── Stats — sticky at column top ──────────────────────────────── */}
      <div style={{
        padding: "16px 16px 16px", borderBottom: "1px solid var(--m-border)",
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--m-card)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".14em", marginBottom: 14 }}>
          Fitness metrics
        </div>

        {/* CTL / ATL / TSB only — FTP/Phase/Sessions are in the top bar, no need to repeat */}
        {(ctl != null || atl != null || tsb != null) && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {ctl != null && (
              <div style={{
                flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)",
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>{Math.round(ctl)}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>CTL</div>
              </div>
            )}
            {atl != null && (
              <div style={{
                flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)",
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--m-text)", lineHeight: 1 }}>{Math.round(atl)}</div>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>ATL</div>
              </div>
            )}
            {tsb != null && (
              <div style={{
                flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)",
                borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: tsb >= 0 ? "#22c55e" : "#ef4444", lineHeight: 1 }}>
                  {tsb > 0 ? "+" : ""}{Math.round(tsb)}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 3 }}>TSB</div>
              </div>
            )}
          </div>
        )}

        {/* Bonus ride highlight */}
        {isBonus && (
          <div style={{
            marginTop: 10,
            background: "rgba(255,255,255,0.03)", border: "1px solid var(--m-border)",
            borderLeft: "3px solid #FF5A1F",
            borderRadius: 6, padding: "12px 14px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#FF5A1F", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>
              Bonus ride today
            </div>
            {todayActivityName && (
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 6, lineHeight: 1.3 }}>
                {todayActivityName.length > 28 ? todayActivityName.slice(0, 26) + "…" : todayActivityName}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {todayActivityDurationMin != null && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-muted)" }}>{todayActivityDurationMin} min</span>
              )}
              {todayAvgHr != null && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--m-muted)" }}>{Math.round(todayAvgHr)} bpm</span>
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
            const dateNum   = w?.date ? new Date(w.date + "T12:00:00").getDate() : null;

            return (
              <div key={dayName} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 4,
                // Today highlight — neutral white tint + orange border (no brown)
                background: isToday ? "rgba(255,255,255,0.05)" : "transparent",
                border: `1px solid ${isToday ? "rgba(255,90,31,0.40)" : "transparent"}`,
              }}>
                {/* Day bubble — uniform dark, no zone tinting */}
                <div style={{
                  width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                  background: "var(--m-card-inner)",
                  border: `1px solid ${isToday ? "rgba(255,255,255,0.12)" : "var(--m-border)"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--m-text)" : "var(--m-muted)", textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1 }}>
                    {dayName.slice(0, 3)}
                  </div>
                  {dateNum && (
                    <div style={{ fontSize: 16, fontWeight: 900, color: isToday ? "var(--m-text)" : "var(--m-muted)", lineHeight: 1, marginTop: 1 }}>
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
                    <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 2, fontWeight: 500 }}>
                      {detectZoneLabel(w)}{w.durationMin > 0 ? ` · ${w.durationMin}m` : ""}
                    </div>
                  )}
                </div>

                {/* Status dots — these ARE meaningful color signals, keep them */}
                {dayStatus === "completed" && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />}
                {dayStatus === "missed"    && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />}
                {dayStatus === "bonus"     && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF5A1F", flexShrink: 0 }} />}
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
