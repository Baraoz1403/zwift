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
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>
          <IconCalendar size={16} />
          Weekly training plan
          {cycleInfo && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--muted)",
                background: "var(--surface-2, rgba(0,0,0,0.05))",
                borderRadius: 6,
                padding: "2px 9px",
              }}
              title="Position in your recurring 4-week training mesocycle"
            >
              {cycleInfo.phase} · week {cycleInfo.weekInMesocycle}/4
            </span>
          )}
        </div>
        {/* Show generate button at top only when there is no plan yet */}
        {!plan && (
          <button
            type="button"
            className="btn"
            style={{ width: "auto", padding: "8px 18px" }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Building your plan..." : "Generate this week's plan"}
          </button>
        )}
      </div>

      {/* AI signal cards — always visible, symmetric 5-column grid */}
      {!loading && (
        <div style={{ marginTop: 20, marginBottom: 4 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 9,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L7.3 4.4H11L8.3 6.5L9.3 10L6 8.1L2.7 10L3.7 6.5L1 4.4H4.7L6 1Z" fill="currentColor"/>
            </svg>
            AI-generated · reads 5 signals from your training data
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
          }}>
            {([
              {
                label: "Ride history",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <polyline points="2,15 7,9 11,12 15,6 18,8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
              },
              {
                label: "Training load & freshness",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M10 10V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
                    <path d="M10 10L13.5 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                ),
              },
              {
                label: "Mesocycle phase",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <rect x="2" y="4" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M2 9h16" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M7 2v4M13 2v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                    <circle cx="7" cy="13" r="1.1" fill="currentColor"/>
                    <circle cx="10" cy="13" r="1.1" fill="currentColor"/>
                  </svg>
                ),
              },
              {
                label: "Goals & schedule",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4"/>
                    <circle cx="10" cy="10" r="1.3" fill="currentColor"/>
                  </svg>
                ),
              },
              {
                label: "Last week's adherence",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10.5L8.5 15L16.5 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
              },
            ] as { label: string; icon: ReactNode }[]).map(({ label, icon }) => (
              <div key={label} style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "13px 10px 11px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "rgba(47,143,224,0.04)",
                fontSize: 11.5,
                color: "var(--muted)",
                fontWeight: 500,
                textAlign: "center",
                lineHeight: 1.3,
              }}>
                <span style={{ color: "var(--accent)", opacity: 0.8 }}>{icon}</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's note — rider tells the AI how they feel before generating */}
      {!loading && (
        <div style={{ marginTop: 24, marginBottom: 4 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", color: "var(--muted)", marginBottom: 8,
          }}>
            Today&apos;s note
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {(["Feeling great", "Feeling OK", "Tired", "Very tired / sore"] as const).map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => setRiderNote(prev => prev === label ? "" : label)}
                style={{
                  padding: "4px 13px",
                  borderRadius: 6,
                  border: `1px solid ${riderNote === label ? "var(--accent)" : "var(--border)"}`,
                  background: riderNote === label ? "rgba(47,143,224,0.10)" : "rgba(47,143,224,0.03)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: riderNote === label ? "var(--accent)" : "var(--muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            ))}
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
              background: "rgba(47,143,224,0.03)",
              fontSize: 13,
              color: "var(--text)",
              fontFamily: "inherit",
              lineHeight: 1.5,
              outline: "none",
              boxSizing: "border-box",
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
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>
                  Plan rationale
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "auto", padding: "5px 15px", fontSize: 12 }}
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    {loading ? "Building..." : "Regenerate"}
                  </button>
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
