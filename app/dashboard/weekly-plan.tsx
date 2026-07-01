"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconCalendar, IconBolt } from "./icons";
import { generateZwoXml, zwoFileName, isRestDay } from "@/lib/zwo";
import { getPhaseForWeekIndex } from "@/lib/periodization";
import WorkoutThumbnail from "./workout-thumbnail";

interface WeeklyWorkout {
  day: string;
  date?: string;
  type: string;
  title: string;
  durationMin: number;
  targetPowerPctFtp?: string;
  description: string;
}

interface WeeklyPlan {
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

const STORAGE_KEY = "zwiftWeeklyPlan";
const CYCLE_STORAGE_KEY = "zwiftMacroCycle";

function colorForType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("rest") || t.includes("recover")) return "c-green";
  if (t.includes("interval") || t.includes("sweet") || t.includes("threshold")) return "c-orange";
  if (t.includes("endurance")) return "c-blue";
  return "c-teal";
}

function loadCachedPlan(): WeeklyPlan | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WeeklyPlan;
  } catch {
    return null;
  }
}

interface MacroCycleState {
  weekIndex: number;
  lastWeekOf: string;
}

interface PhaseInfo {
  phase: "Base" | "Build" | "Recovery";
  weekInMesocycle: number;
}

function loadCachedCycle(): MacroCycleState | null {
  try {
    const raw = window.localStorage.getItem(CYCLE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MacroCycleState;
  } catch {
    return null;
  }
}

const WEEK_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function normalizeToSix(plan: WeeklyPlan): WeeklyPlan {
  let workouts = [...plan.workouts].sort(
    (a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day)
  );

  while (workouts.length > 6) {
    const restIdx = workouts.findIndex(w => isRestDay(w.type));
    if (restIdx >= 0) {
      workouts.splice(restIdx, 1);
    } else {
      workouts.pop();
    }
  }

  if (workouts.length < 6) {
    const usedDays = new Set(workouts.map(w => w.day));
    for (const day of WEEK_DAYS) {
      if (workouts.length >= 6) break;
      if (!usedDays.has(day)) {
        const dayIndex = WEEK_DAYS.indexOf(day);
        const base = new Date(plan.weekOf + "T00:00:00Z");
        base.setUTCDate(base.getUTCDate() + dayIndex);
        workouts.push({
          day,
          date: base.toISOString().slice(0, 10),
          type: "Rest",
          title: "Rest Day",
          durationMin: 0,
          description: "Active recovery — light walking or stretching is fine.",
        });
        usedDays.add(day);
      }
    }
    workouts.sort((a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day));
  }

  return { ...plan, workouts };
}

function currentWeekOf(): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cycleInfo, setCycleInfo] = useState<PhaseInfo | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [riderNote, setRiderNote] = useState("");

  useEffect(() => {
    const cached = loadCachedPlan();
    if (cached) {
      setPlan(normalizeToSix(cached));
      setStale(cached.weekOf !== currentWeekOf());
    }
    const cachedCycle = loadCachedCycle();
    if (cachedCycle) {
      setCycleInfo(getPhaseForWeekIndex(cachedCycle.weekIndex));
    }
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const macroCycle = loadCachedCycle();
      const previousPlan = plan && stale ? plan : null;
      let riderProfile = null;
      try {
        const raw = window.localStorage.getItem("zwiftRiderProfile");
        if (raw) riderProfile = JSON.parse(raw);
      } catch {}
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macroCycle, previousPlan, riderProfile, riderNote: riderNote.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        const normalizedPlan = normalizeToSix(data.plan);
        setPlan(normalizedPlan);
        setStale(false);
        setCycleInfo(data.cycle ?? null);
        setRiderNote("");
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedPlan));
          if (data.macroCycle) {
            window.localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(data.macroCycle));
          }
        } catch {}
      } else {
        setError(data.error ?? "Could not generate a weekly plan.");
      }
    } catch {
      setError("Network error reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadZwo(w: WeeklyWorkout) {
    const xml = generateZwoXml(w);
    const filename = zwoFileName(w.date, w.title);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ marginTop: 0 }}>

      {/* ── Compelling pitch block ──────────────────────────────────────── */}
      <div className="stat-card" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "20px 22px",
        marginBottom: 24,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Eyebrow */}
          <div className="card-eyebrow" style={{ marginBottom: 6 }}>
            <IconCalendar size={10} />
            {cycleInfo ? `${cycleInfo.phase} · Week ${cycleInfo.weekInMesocycle}/4` : "Weekly training plan"}
          </div>
          {/* Headline */}
          <div style={{
            fontSize: 18, fontWeight: 800, color: "var(--text)",
            lineHeight: 1.25, letterSpacing: "-0.3px", marginBottom: 6,
          }}>
            A fresh plan every week — built around your data.
          </div>
          {/* Sub */}
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
            Your AI coach reads ride history, training load, and goals to design a week that moves you forward.
          </div>
        </div>

        {/* CTA — always visible */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          style={{
            flexShrink: 0,
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 15px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: "rgba(47,143,224,0.04)",
            color: "var(--muted)",
            fontSize: 12.5, fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
            whiteSpace: "nowrap", fontFamily: "inherit",
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Building…" : plan ? "Regenerate plan" : "Generate this week's plan"}
          {!loading && (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Today's note — rider tells the AI how they feel before generating */}
      {!loading && (
        <div className="stat-card" style={{ marginTop: 20, marginBottom: 4, padding: "20px 22px" }}>
          <div className="card-eyebrow" style={{ marginBottom: 16 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Today&apos;s note
          </div>

          {/* Feeling buttons — equal width, full row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(["Feeling great", "Feeling OK", "Tired", "Very tired / sore"] as const).map((label) => {
              const selected = riderNote === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setRiderNote(prev => prev === label ? "" : label)}
                  style={{
                    flex: 1,
                    padding: "9px 8px",
                    borderRadius: 7,
                    border: selected
                      ? "1.5px solid var(--accent)"
                      : "1px solid var(--border)",
                    background: selected
                      ? "rgba(47,143,224,0.09)"
                      : "var(--panel)",
                    fontSize: 13,
                    fontWeight: selected ? 600 : 400,
                    color: selected ? "var(--accent)" : "var(--text)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    textAlign: "center" as const,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <textarea
            rows={2}
            placeholder="How are you feeling today? (e.g. tired legs, great form, sore back...) — the AI will adjust your plan."
            value={riderNote}
            onChange={(e) => setRiderNote(e.target.value)}
            style={{
              width: "100%",
              resize: "vertical",
              padding: "10px 13px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "rgba(20,23,26,0.02)",
              fontSize: 13,
              color: "var(--text)",
              fontFamily: "inherit",
              lineHeight: 1.5,
              outline: "none",
              boxSizing: "border-box" as const,
            }}
          />
        </div>
      )}

      {stale && plan && !loading && (
        <div className="notice" style={{ marginTop: 16, marginBottom: 12 }}>
          This plan is from the week of {plan.weekOf} - generate a new one for the current week.
        </div>
      )}

      {error && (
        <div className="notice" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {plan && (
        <>
          {plan.summary && (
            <div style={{ marginTop: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: summaryOpen ? 10 : 0 }}>
                <div className="card-eyebrow">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                  </svg>
                  Plan rationale
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSummaryOpen(v => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "rgba(47,143,224,0.05)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--accent)",
                      cursor: "pointer",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {summaryOpen ? "Hide" : "Show"}
                    <svg
                      width="10" height="10" viewBox="0 0 10 10" fill="none"
                      style={{ transform: summaryOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                    >
                      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
              {summaryOpen && (
                <div className="notice" style={{ color: "var(--text)", lineHeight: 1.6 }}>
                  {plan.summary}
                </div>
              )}
            </div>
          )}

          <div className="stat-grid workout-grid">
            {plan.workouts.map((w, i) => (
              <div className="stat-card" key={i} style={{ display: "flex", flexDirection: "column" }}>
                {!isRestDay(w.type) && <WorkoutThumbnail workout={w} />}
                <div className="stat-card-head" style={{ marginTop: 10 }}>
                  <div className={`stat-card-icon ${colorForType(w.type)}`}>
                    <IconBolt size={13} />
                  </div>
                  <div className="label" style={{ margin: 0 }}>
                    {w.day}
                    {w.date ? ` (${w.date})` : ""} - {w.type}
                  </div>
                </div>
                <div className="value" style={{ fontSize: 16 }}>{w.title}</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  {w.durationMin} min
                  {w.targetPowerPctFtp ? ` · ${w.targetPowerPctFtp} FTP` : ""}
                </div>
                <div className="card-desc" style={{ fontSize: 12, opacity: 0.85, marginTop: 6, flexGrow: 1 }}>
                  {w.description}
                </div>
                {!isRestDay(w.type) && (
                  <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto", padding: "5px 18px", fontSize: 11.5 }}
                      onClick={() => handleDownloadZwo(w)}
                    >
                      Download .zwo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>
            Each session above can be downloaded as a real Zwift workout file (.zwo) - drop
            it into your Documents/Zwift/Workouts/&lt;your Zwift ID&gt; folder, then open
            Zwift on that computer once. Zwift uploads custom workouts placed there to your
            account automatically, so they then sync to your phone and any other device too
            - no separate step needed beyond opening Zwift once after adding the file. This
            plan itself (the weekly text/structure) is saved in your browser only.
          </div>
        </>
      )}
    </div>
    );
}
