"use client";

import type { WeeklyWorkout } from "@/lib/ai";

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

function formatDayLabel(dateStr?: string, dayName?: string): { short: string; full: string; dateNum: string } {
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return {
      short: d.toLocaleDateString("en-US", { weekday: "short" }),
      full: d.toLocaleDateString("en-US", { weekday: "long" }),
      dateNum: d.toLocaleDateString("en-US", { day: "numeric" }),
    };
  }
  const SHORTS: Record<string, string> = {
    Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
    Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
  };
  return { short: SHORTS[dayName ?? ""] ?? dayName ?? "", full: dayName ?? "", dateNum: "" };
}

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Break a coach summary into ≤4 short bullets for mobile readability. */
function parseSummaryBullets(summary: string): string[] {
  // Split on sentence boundaries, strip leading/trailing whitespace
  const sentences = summary
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 12);
  // Take first 4, but prefer natural stopping at 3 if they're long
  return sentences.slice(0, 4);
}

interface Props {
  workouts: (WeeklyWorkout & { date?: string })[];
  weekOf: string;
  today: string;
  summary: string | null;
}

export default function WeekView({ workouts, weekOf, today, summary }: Props) {
  if (workouts.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
          No plan yet
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 28 }}>
          Open the dashboard to generate your weekly training plan.
        </div>
        <a
          href="/dashboard"
          style={{
            display: "inline-block", padding: "14px 28px",
            background: "#2563eb", color: "#fff", borderRadius: 14,
            fontSize: 15, fontWeight: 700, textDecoration: "none",
          }}
        >
          Open Dashboard
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 0" }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#475569", fontWeight: 500, letterSpacing: ".4px", textTransform: "uppercase" }}>
          {formatWeekRange(weekOf)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc", letterSpacing: "-.4px", marginTop: 2 }}>
          Weekly Plan
        </div>
        {summary && (
          <div style={{
            marginTop: 10,
            background: "#111827", borderRadius: 14, padding: "12px 14px",
            border: "1px solid #1e293b",
            display: "flex", flexDirection: "column", gap: 7,
          }}>
            {parseSummaryBullets(summary).map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%", background: "#3b82f6",
                  flexShrink: 0, marginTop: 6,
                }} />
                <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Day cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 8 }}>
        {ALL_DAYS.map(dayName => {
          const w = workouts.find(x => x.day === dayName);
          const isToday = w?.date === today;
          const zone = w ? detectZone(w) : "rest";
          const colors = ZONE_COLOR[zone] ?? ZONE_COLOR.rest;
          const isRest = zone === "rest" || !w;
          const label = formatDayLabel(w?.date, dayName);

          return (
            <div
              key={dayName}
              style={{
                background: isToday ? `${colors.accent}0d` : "#111827",
                borderRadius: 18,
                border: isToday
                  ? `1.5px solid ${colors.accent}55`
                  : "1px solid #1e293b",
                padding: "14px 16px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Today indicator */}
              {isToday && (
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0, width: 4,
                  background: colors.accent, borderRadius: "18px 0 0 18px",
                }} />
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 14, paddingLeft: isToday ? 8 : 0 }}>
                {/* Day bubble */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: isRest ? "#1e293b" : `${colors.accent}22`,
                  border: `1px solid ${isRest ? "#334155" : colors.accent + "44"}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 1,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: isRest ? "#475569" : colors.accent,
                    letterSpacing: ".3px",
                  }}>
                    {label.short.toUpperCase()}
                  </span>
                  {label.dateNum && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: isRest ? "#475569" : colors.accent }}>
                      {label.dateNum}
                    </span>
                  )}
                </div>

                {/* Workout info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isRest ? 0 : 4 }}>
                    <span style={{
                      fontSize: 15, fontWeight: 700,
                      color: isRest ? "#475569" : "#f1f5f9",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {isRest ? "Rest" : w!.title}
                    </span>
                    {isToday && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: colors.accent,
                        background: `${colors.accent}22`,
                        padding: "2px 7px", borderRadius: 6, flexShrink: 0,
                        letterSpacing: ".3px", textTransform: "uppercase",
                      }}>
                        Today
                      </span>
                    )}
                  </div>
                  {!isRest && w && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {w.durationMin > 0 && (
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                          {w.durationMin} min
                        </span>
                      )}
                      {w.targetPowerPctFtp && (
                        <span style={{ fontSize: 12, color: colors.accent }}>
                          {w.targetPowerPctFtp} FTP
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: colors.accent,
                        letterSpacing: ".3px", textTransform: "uppercase",
                      }}>
                        {colors.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Structure indicator dots */}
                {!isRest && w?.structure && w.structure.length > 0 && (
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {w.structure.slice(0, 5).map((block, i) => {
                      const pct = Math.round((block.powerFtp ?? 0) * 100);
                      const dotColor =
                        pct >= 106 ? "#22c55e" :
                        pct >= 97  ? "#ef4444" :
                        pct >= 88  ? "#3b82f6" :
                        pct >= 76  ? "#f59e0b" : "#4b5563";
                      return (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: dotColor,
                        }} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Description snippet */}
              {!isRest && w?.description && (
                <div style={{
                  fontSize: 12, color: "#64748b", marginTop: 10,
                  lineHeight: 1.5,
                  paddingLeft: isToday ? 8 : 0,
                  overflow: "hidden",
                  maxHeight: "3em",
                }}>
                  {w.description.slice(0, 140)}{w.description.length > 140 ? "…" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
