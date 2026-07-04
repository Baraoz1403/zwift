"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { IconCalendar, IconBolt } from "./icons";
import { generateZwoXml, zwoFileName, isRestDay, zoneForPowerFraction, type WorkoutStructureBlock } from "@/lib/zwo";
import { getPhaseForWeekIndex } from "@/lib/periodization";
import WorkoutThumbnail from "./workout-thumbnail";
import TrainingProfileCard from "./training-profile";

interface WeeklyWorkout {
  day: string;
  date?: string;
  type: string;
  title: string;
  durationMin: number;
  targetPowerPctFtp?: string;
  description: string;
  structure?: WorkoutStructureBlock[];
}

/** Actual Zwift ride detected for a planned workout day */
interface ActualRide {
  name: string;
  startDate: string;
  durationInSeconds: number;
  distanceInMeters: number;
  avgWatts: number | null;
  avgHeartRate: number | null;
  sport: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

/** Approximate Training Stress Score from structured blocks.
 *  Formula per block: hours × IF² × 100  (IF = powerFtp fraction).
 *  Intervals split into on/off contributions separately. */
function calcTss(structure: WorkoutStructureBlock[]): number {
  let tss = 0;
  for (const b of structure) {
    if (b.type === "intervals" && b.onSec && b.offSec && b.repeats) {
      const onHours  = (b.repeats * b.onSec)  / 3600;
      const offHours = (b.repeats * b.offSec) / 3600;
      tss += onHours  * b.powerFtp * b.powerFtp * 100;
      tss += offHours * (b.recoveryPowerFtp ?? 0.50) * (b.recoveryPowerFtp ?? 0.50) * 100;
    } else {
      const avgPower = b.type === "warmup"   ? (0.45 + b.powerFtp) / 2
                     : b.type === "cooldown" ? (b.powerFtp + 0.40) / 2
                     : b.powerFtp;
      tss += (b.durationMin / 60) * avgPower * avgPower * 100;
    }
  }
  return Math.round(tss);
}

interface WeeklyPlan {
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

const STORAGE_KEY = "zwiftWeeklyPlan";
const CYCLE_STORAGE_KEY = "zwiftMacroCycle";
const ACTIVITIES_CACHE_KEY = "zwiftWeekActivitiesCache";
const ACTIVITIES_CACHE_WEEK_KEY = "zwiftWeekActivitiesWeek";
/** localStorage key for the array of TP workoutIds pushed in the current plan */
const TP_PUSHED_IDS_KEY = "zwiftTPPushedWorkoutIds";

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

/**
 * Ensures every workout has a concrete ISO date string ("YYYY-MM-DD"),
 * computed from the plan's weekOf + the workout's day-of-week index.
 * The AI sometimes omits dates on active workouts (only day names are
 * returned), which breaks the "Ride done" detection in the plan grid.
 */
function ensureWorkoutDates(plan: WeeklyPlan): WeeklyPlan {
  const base = new Date(plan.weekOf + "T00:00:00Z");
  return {
    ...plan,
    workouts: plan.workouts.map((w) => {
      if (w.date) return w; // already populated — leave unchanged
      const dayIndex = WEEK_DAYS.indexOf(w.day);
      if (dayIndex < 0) return w;
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + dayIndex);
      return { ...w, date: d.toISOString().slice(0, 10) };
    }),
  };
}

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
  const [noteOpen, setNoteOpen] = useState(false);
  // Map of YYYY-MM-DD → actual Zwift ride done on that day (this week only)
  const [weekActivities, setWeekActivities] = useState<Map<string, ActualRide>>(new Map());

  useEffect(() => {
    const cached = loadCachedPlan();
    if (cached) {
      setPlan(ensureWorkoutDates(normalizeToSix(cached)));
      setStale(cached.weekOf !== currentWeekOf());
    }
    const cachedCycle = loadCachedCycle();
    if (cachedCycle) {
      setCycleInfo(getPhaseForWeekIndex(cachedCycle.weekIndex));
    }

    // Load cached activities immediately to prevent flash on refresh
    const thisWeek = currentWeekOf();
    try {
      const cachedWeek = window.localStorage.getItem(ACTIVITIES_CACHE_WEEK_KEY);
      if (cachedWeek === thisWeek) {
        const raw = window.localStorage.getItem(ACTIVITIES_CACHE_KEY);
        if (raw) {
          setWeekActivities(new Map(JSON.parse(raw) as [string, ActualRide][]));
        }
      }
    } catch {}

    // Check TrainingPeaks connection status
    fetch("/api/trainingpeaks/status")
      .then(r => r.json())
      .then(d => { if (d.connected) setTpConnected(true); })
      .catch(() => {});

    // Check Strava connection status + handle redirect-back from OAuth
    fetch("/api/strava/status")
      .then(r => r.json())
      .then((d: { connected: boolean; athleteName?: string }) => {
        if (d.connected) { setStravaConnected(true); setStravaName(d.athleteName ?? null); }
      })
      .catch(() => {});

    // Fetch this week's actual Zwift rides to detect completed workouts
    const weekStart = thisWeek;
    const weekEndMs = new Date(weekStart + "T00:00:00Z").getTime() + 7 * 86400 * 1000;
    fetch("/api/zwift/activities")
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !Array.isArray(data.activities)) return;
        const map = new Map<string, ActualRide>();
        for (const a of data.activities as Record<string, unknown>[]) {
          const startDate = a.startDate as string | undefined;
          if (!startDate) continue;
          const ts = new Date(startDate).getTime();
          if (ts < new Date(weekStart + "T00:00:00Z").getTime() || ts >= weekEndMs) continue;
          const dateKey = startDate.slice(0, 10);
          if (!map.has(dateKey)) {
            map.set(dateKey, {
              name: (a.name as string) ?? "Zwift Ride",
              startDate,
              durationInSeconds: a.movingTimeInMs ? Math.round((a.movingTimeInMs as number) / 1000) : 0,
              distanceInMeters: (a.distanceInMeters as number) ?? 0,
              avgWatts: (a.avgWatts as number | null) ?? null,
              avgHeartRate: (a.avgHeartRate as number | null) ?? null,
              sport: (a.sport as string) ?? "CYCLING",
            });
          }
        }
        setWeekActivities(map);
        // Cache for next page load — keyed by week to auto-invalidate next week
        try {
          window.localStorage.setItem(ACTIVITIES_CACHE_WEEK_KEY, currentWeekOf());
          window.localStorage.setItem(ACTIVITIES_CACHE_KEY, JSON.stringify([...map.entries()]));
        } catch {}
      })
      .catch(() => {});
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
        const normalizedPlan = ensureWorkoutDates(normalizeToSix(data.plan));
        setPlan(normalizedPlan);
        setStale(false);
        setCycleInfo(data.cycle ?? null);
        setRiderNote("");
        // Auto-push all non-rest workouts to TrainingPeaks if connected.
        // Before pushing, delete any previously pushed workout IDs so the TP
        // calendar only ever contains the current plan (not stale old entries).
        // TP syncs to Zwift + Garmin automatically — no manual step needed.
        if (tpConnected) {
          // 1. Delete previously pushed workouts from TP
          try {
            const prevRaw = window.localStorage.getItem(TP_PUSHED_IDS_KEY);
            if (prevRaw) {
              const prevIds = JSON.parse(prevRaw) as (string | number)[];
              prevIds.forEach(id => {
                fetch("/api/trainingpeaks/push-workout", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ workoutId: id }),
                }).catch(() => {});
              });
            }
          } catch {}
          // Clear old IDs from storage before pushing new ones
          try { window.localStorage.removeItem(TP_PUSHED_IDS_KEY); } catch {}

          // 2. Push new workouts
          normalizedPlan.workouts
            .filter(w => !isRestDay(w.type))
            .forEach(w => { handlePushToTP(w); });
        }
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


  // ── Strava integration ────────────────────────────────────────────────────
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaName, setStravaName] = useState<string | null>(null);

  // ── TrainingPeaks integration ──────────────────────────────────────────────
  const [tpConnected, setTpConnected] = useState(false);
  const [showTPModal, setShowTPModal] = useState(false);
  const [tpPolling, setTpPolling] = useState(false);
  const [tpTokenExpired, setTpTokenExpired] = useState(false);
  const [tpPushState, setTpPushState] = useState<Record<string, "idle" | "loading" | "ok" | "error">>({});
  const [tpPushLog, setTpPushLog]     = useState<Record<string, string>>({});

  // Build bookmarklet href on the client using the current dashboard origin.
  // The bookmarklet runs on app.trainingpeaks.com and:
  //   1. Exchanges the HttpOnly Production_tpAuth cookie for a gAAAA token (same-origin fetch to TP API)
  //   2. Posts the token back here via credentialed CORS fetch
  const bookmarkletHref = typeof window !== "undefined"
    ? (() => {
        const origin = window.location.origin;
        const code = `(async()=>{try{const r=await fetch('https://tpapi.trainingpeaks.com/users/v3/token',{credentials:'include'});if(!r.ok){alert('TrainingPeaks: not logged in');return;}const d=await r.json();const t=d?.token?.access_token;if(!t){alert('TP token not found');return;}const r2=await fetch('${origin}/api/trainingpeaks/connect',{method:'POST',mode:'cors',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({tpToken:t})});const d2=await r2.json();if(d2.ok){alert('Connected! Return to Zwift AI Dashboard.')}else{alert('Error: '+(d2.error||'Unknown. Are you logged in?'))}}catch(e){alert('Error: '+e.message)}})()`;
        return `javascript:${encodeURIComponent(code)}`;
      })()
    : "#";

  // Poll connection status every 2 s while modal is open waiting for bookmarklet
  useEffect(() => {
    if (!tpPolling || tpConnected) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/trainingpeaks/status");
        const data = await res.json() as { connected: boolean };
        if (data.connected) {
          setTpConnected(true);
          setTpPolling(false);
          setShowTPModal(false);
          setTpTokenExpired(false);
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [tpPolling, tpConnected]);

  async function handlePushToTP(w: WeeklyWorkout) {
    const key = `tp_${w.date ?? w.title}`;
    setTpPushState(s => ({ ...s, [key]: "loading" }));
    try {
      const res = await fetch("/api/trainingpeaks/push-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutDay: w.date ?? new Date().toISOString().slice(0, 10),
          title: w.title,
          description: w.description,
          durationMin: w.durationMin,
          type: w.type,
          targetPower: w.targetPowerPctFtp,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTpPushState(s => ({ ...s, [key]: "ok" }));
        setTpPushLog(l => ({ ...l, [key]: `✓ ID: ${data.workoutId ?? "pushed"}` }));
        setTpTokenExpired(false);
        // Persist workoutId so it can be deleted when the plan is regenerated
        if (data.workoutId != null) {
          try {
            const raw = window.localStorage.getItem(TP_PUSHED_IDS_KEY);
            const ids: (string | number)[] = raw ? JSON.parse(raw) : [];
            ids.push(data.workoutId);
            window.localStorage.setItem(TP_PUSHED_IDS_KEY, JSON.stringify(ids));
          } catch {}
        }
      } else {
        setTpPushState(s => ({ ...s, [key]: "error" }));
        setTpPushLog(l => ({ ...l, [key]: data.error ?? "Failed." }));
        // Detect expired / invalid token — surface reconnect banner
        if (res.status === 401 || res.status === 403 ||
            (data.error ?? "").toLowerCase().includes("token") ||
            (data.error ?? "").toLowerCase().includes("unauthorized") ||
            (data.error ?? "").toLowerCase().includes("auth")) {
          setTpTokenExpired(true);
          setTpConnected(false);
        }
      }
    } catch (e) {
      setTpPushState(s => ({ ...s, [key]: "error" }));
      setTpPushLog(l => ({ ...l, [key]: e instanceof Error ? e.message : "Network error." }));
    }
  }

  return (
    <div>

      {/* ── TrainingPeaks Connect Modal (bookmarklet flow) ───────────── */}
      {showTPModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(14,17,20,0.72)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        } as CSSProperties}
          onClick={() => { setShowTPModal(false); setTpPolling(false); }}
        >
          <div
            className="stat-card"
            style={{ maxWidth: 460, width: "100%", padding: "28px 28px 24px" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: "#e8264c",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Connect TrainingPeaks</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  One bookmark → one click to connect, every time
                </div>
              </div>
              <button
                onClick={() => { setShowTPModal(false); setTpPolling(false); }}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 18, padding: 4 }}
              >✕</button>
            </div>

            {/* Step 1 — drag bookmarklet */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
                Step 1 — Save the connector (drag to bookmark bar)
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* The actual bookmarklet link — user drags this */}
                <a
                  href={bookmarkletHref}
                  draggable
                  onClick={e => e.preventDefault()}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "9px 18px", borderRadius: 8,
                    border: "2px dashed var(--accent)",
                    background: "rgba(47,143,224,0.07)",
                    color: "var(--accent)", fontSize: 13, fontWeight: 700,
                    cursor: "grab", textDecoration: "none",
                    userSelect: "none" as const, flexShrink: 0,
                    letterSpacing: "0.01em",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Zwift AI → TP
                </a>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
                  ← Drag this to your browser&apos;s bookmarks bar. You only need to do this once.
                </div>
              </div>
            </div>

            {/* Step 2 — go to TP and click */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
                Step 2 — Open TrainingPeaks and click the bookmark
              </div>
              <button
                type="button"
                onClick={() => {
                  window.open("https://app.trainingpeaks.com", "_blank");
                  setTpPolling(true);
                }}
                style={{
                  width: "100%", padding: "10px 18px", borderRadius: 7, border: "none",
                  background: "#e8264c", color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.01em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                Open TrainingPeaks →
              </button>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.55 }}>
                A TrainingPeaks tab opens. Click the <strong style={{ color: "var(--text)" }}>Zwift AI → TP</strong> bookmark in your bar — it connects automatically and you can close that tab.
              </div>
            </div>

            {/* Polling status */}
            {tpPolling && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                padding: "10px 14px", borderRadius: 7,
                background: "rgba(47,143,224,0.07)", border: "1px solid rgba(47,143,224,0.2)",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>
                  Waiting for connection… click the bookmark in the TrainingPeaks tab
                </span>
              </div>
            )}

            {/* Cancel */}
            <button
              type="button"
              onClick={() => { setShowTPModal(false); setTpPolling(false); }}
              style={{
                width: "100%", padding: "8px 16px", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>

            <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", opacity: 0.65, lineHeight: 1.5 }}>
              The bookmark exchanges your TrainingPeaks session for a short-lived token that is sent over HTTPS and stored only in your browser session.
            </div>
          </div>
        </div>
      )}

      {/* ── Token-expired reconnect banner ─────────────────────────────── */}
      {tpTokenExpired && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          padding: "10px 16px", borderRadius: 8,
          background: "rgba(232,38,76,0.08)", border: "1px solid rgba(232,38,76,0.3)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8264c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 12.5, color: "#e8264c", fontWeight: 600, flex: 1 }}>
            TrainingPeaks session expired
          </span>
          <button
            type="button"
            onClick={() => { setShowTPModal(true); setTpPolling(false); }}
            style={{
              padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(232,38,76,0.4)",
              background: "rgba(232,38,76,0.12)", color: "#e8264c",
              fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Reconnect →
          </button>
        </div>
      )}

      {/* ── 3-column header grid ────────────────────────────────────────── */}
      <div className="header-cards-grid">

        {/* Card 1: Training Profile */}
        <TrainingProfileCard />

        {/* Card 2: Today's Note */}
        <div id="todays-note" className="stat-card" style={{
          display: "flex", flexDirection: "column", padding: "20px 22px",
        }}>
          <div className="section-title" style={{ margin: "0 0 8px 0" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Today&apos;s note
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, flex: 1 }}>
            {riderNote
              ? <span style={{ color: "var(--accent)", fontWeight: 500 }}>✓ {riderNote.length > 60 ? riderNote.slice(0, 60) + "…" : riderNote}</span>
              : "How are you feeling today? Your AI coach adapts the session to your readiness."}
          </div>

          {/* Expanded content */}
          {noteOpen && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                {(["Feeling great", "Feeling OK", "Tired", "Very tired / sore"] as const).map((label) => {
                  const selected = riderNote === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setRiderNote(prev => prev === label ? "" : label)}
                      style={{
                        flex: "1 1 calc(50% - 4px)", padding: "9px 8px", borderRadius: 7,
                        border: selected ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                        background: selected ? "rgba(47,143,224,0.09)" : "var(--panel)",
                        fontSize: 12.5, fontWeight: selected ? 600 : 400,
                        color: selected ? "var(--accent)" : "var(--text)",
                        cursor: "pointer", transition: "all 0.15s ease",
                        textAlign: "center" as const,
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <textarea
                rows={2}
                placeholder="More detail — e.g. tired legs, sore back, great form…"
                value={typeof riderNote === "string" && !["Feeling great","Feeling OK","Tired","Very tired / sore"].includes(riderNote) ? riderNote : ""}
                onChange={(e) => setRiderNote(e.target.value)}
                style={{
                  width: "100%", resize: "vertical", padding: "10px 13px",
                  borderRadius: 6, border: "1px solid var(--border)",
                  background: "rgba(20,23,26,0.02)", fontSize: 13,
                  color: "var(--text)", fontFamily: "inherit", lineHeight: 1.5,
                  outline: "none", boxSizing: "border-box" as const,
                }}
              />
            </div>
          )}

          {/* Loading indicator when auto-generating after note submit */}
          {loading && !noteOpen && (
            <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, marginTop: 8, textAlign: "center", opacity: 0.9 }}>
              Adapting your plan…
            </div>
          )}

          {/* Button at bottom */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                if (noteOpen) {
                  // Close the note panel. If a note was entered, auto-trigger plan generation.
                  setNoteOpen(false);
                  if (riderNote.trim()) {
                    handleGenerate();
                  }
                } else {
                  setNoteOpen(true);
                }
              }}
              disabled={loading}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "9px 20px", borderRadius: 6,
                border: noteOpen ? "1.5px solid var(--accent)" : "1.5px solid #16a34a",
                background: noteOpen
                  ? (riderNote.trim() ? "rgba(47,143,224,0.12)" : "rgba(47,143,224,0.07)")
                  : "#16a34a",
                color: noteOpen ? "var(--accent)" : "#fff",
                fontSize: 12.5, fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.5 : 1,
                whiteSpace: "nowrap" as const, fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
            >
              {noteOpen
                ? (riderNote.trim() ? "Update plan ↗" : "Done")
                : (riderNote ? "Edit note" : "Add today's note")}
              {!noteOpen && (
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Card 3: Weekly Training Plan */}
        <div className="stat-card" style={{
          display: "flex", flexDirection: "column", padding: "20px 22px",
        }}>
          <div className="section-title" style={{ margin: "0 0 8px 0" }}>
            <IconCalendar size={13} />
            Weekly training plan
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, flex: 1 }}>
            {cycleInfo
              ? `${cycleInfo.phase} phase · Week ${cycleInfo.weekInMesocycle} of 4 — your AI coach builds 7 structured sessions from your ride history, training load, and goals.`
              : "Seven structured sessions, built fresh each week — calibrated to your training load, recovery, and where you are in your season."}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "9px 20px", borderRadius: 6,
                border: "1.5px solid #16a34a",
                background: "#16a34a",
                color: "#fff",
                fontSize: 12.5, fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.5 : 1,
                whiteSpace: "nowrap" as const, fontFamily: "inherit",
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
        </div>

      </div>{/* end 3-col grid */}

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
                <div className="section-title" style={{ margin: 0 }}>
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

          {/* TrainingPeaks connect banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderRadius: 8, marginBottom: 12,
            background: "rgba(20,23,26,0.03)",
            border: "1px solid var(--border)",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: "#e8264c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: tpConnected ? "#e8264c" : "var(--text)" }}>
                {tpConnected ? "TrainingPeaks connected" : "Connect TrainingPeaks"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {tpConnected
                  ? "Push workouts to your calendar — they sync to Zwift automatically"
                  : "Push workouts straight to your Zwift calendar via TrainingPeaks"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => tpConnected
                ? fetch("/api/trainingpeaks/connect", { method: "DELETE" }).then(() => setTpConnected(false))
                : setShowTPModal(true)
              }
              style={{
                padding: "5px 12px", borderRadius: 6, flexShrink: 0,
                border: tpConnected ? "1px solid rgba(232,38,76,0.3)" : "1px solid var(--border)",
                background: tpConnected ? "rgba(232,38,76,0.08)" : "rgba(47,143,224,0.06)",
                color: tpConnected ? "#e8264c" : "var(--accent)",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {tpConnected ? "Disconnect" : "Connect →"}
            </button>
          </div>

          {/* Strava connect banner */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderRadius: 8, marginBottom: 12,
            background: "rgba(20,23,26,0.03)",
            border: "1px solid var(--border)",
          }}>
            {/* Strava logo mark */}
            <div style={{ width: 24, height: 24, borderRadius: 7, background: "#FC4C02", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 4 13.828h4.17"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: stravaConnected ? "#FC4C02" : "var(--text)" }}>
                {stravaConnected ? `Strava connected${stravaName ? ` · ${stravaName}` : ""}` : "Connect Strava"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                {stravaConnected
                  ? "Outdoor rides & Garmin data visible to your AI coach"
                  : "Add outdoor rides + Garmin data for a more complete training picture"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => stravaConnected
                ? fetch("/api/strava/status", { method: "DELETE" }).then(() => { setStravaConnected(false); setStravaName(null); })
                : (window.location.href = "/api/strava/oauth-start")
              }
              style={{
                padding: "5px 12px", borderRadius: 6, flexShrink: 0,
                border: stravaConnected ? "1px solid rgba(252,76,2,0.3)" : "1px solid var(--border)",
                background: stravaConnected ? "rgba(252,76,2,0.08)" : "rgba(252,76,2,0.06)",
                color: stravaConnected ? "#FC4C02" : "#FC4C02",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {stravaConnected ? "Disconnect" : "Connect →"}
            </button>
          </div>

          <div className="stat-grid workout-grid">
            {plan.workouts.map((w, i) => {
              const actual = w.date ? weekActivities.get(w.date) : undefined;

              // ── Completed: actual ride found for this day ──
              if (actual && !isRestDay(w.type)) {
                const distKm = actual.distanceInMeters > 0
                  ? (actual.distanceInMeters / 1000).toFixed(1) + " km"
                  : null;
                const stats = [
                  actual.durationInSeconds > 0 ? formatDuration(actual.durationInSeconds) : null,
                  distKm,
                  actual.avgWatts ? `${Math.round(actual.avgWatts)} W` : null,
                  actual.avgHeartRate ? `${Math.round(actual.avgHeartRate)} bpm` : null,
                ].filter(Boolean).join(" · ");

                return (
                  <div
                    key={i}
                    className="stat-card"
                    style={{
                      display: "flex", flexDirection: "column",
                      padding: 0, overflow: "hidden",
                    }}
                  >
                    {/* Thumbnail — full-bleed, "flush" skips the -20px margin */}
                    <div style={{ position: "relative" }}>
                      <WorkoutThumbnail workout={w} flush />
                      {/* "Ride done" pill badge overlaid on the thumbnail */}
                      <div style={{
                        position: "absolute", top: 8, left: 10,
                        background: "rgba(26,143,76,0.88)",
                        color: "#fff",
                        fontSize: 10, fontWeight: 700,
                        padding: "2.5px 8px",
                        borderRadius: 20,
                        display: "flex", alignItems: "center", gap: 4,
                        letterSpacing: "0.06em",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                      }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                          stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        DONE
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
                      {/* Actual ride name — most prominent */}
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: 3 }}>
                        {actual.name}
                      </div>
                      {/* Day + date */}
                      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500, marginBottom: 10 }}>
                        {w.day}{w.date ? ` · ${w.date}` : ""}
                      </div>
                      {/* Stats */}
                      {stats && (
                        <div style={{ fontSize: 12.5, color: "var(--text)", opacity: 0.8 }}>
                          {stats}
                        </div>
                      )}
                      {/* "Planned" footnote — bottom of card */}
                      <div style={{
                        marginTop: "auto", paddingTop: 10,
                        borderTop: "1px solid var(--border)",
                        fontSize: 10.5, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.4,
                      }}>
                        Planned: {w.title}
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Actual ride on a Rest Day (bonus ride!) ──
              if (actual && isRestDay(w.type)) {
                const distKm = actual.distanceInMeters > 0 ? (actual.distanceInMeters / 1000).toFixed(1) + " km" : null;
                const bonusStats = [
                  actual.durationInSeconds > 0 ? formatDuration(actual.durationInSeconds) : null,
                  distKm,
                  actual.avgWatts ? `${Math.round(actual.avgWatts)} W` : null,
                  actual.avgHeartRate ? `${Math.round(actual.avgHeartRate)} bpm` : null,
                ].filter(Boolean).join(" · ");
                // Synthetic workout so WorkoutThumbnail renders actual-ride bars
                const bonusWorkout = {
                  title: actual.name as string,
                  type: (actual.sport as string) === "RUNNING" ? "Easy Run" : "Endurance",
                  durationMin: Math.round(((actual.durationInSeconds as number) || 3600) / 60),
                  targetPowerPctFtp: "65-75%",
                };
                return (
                  <div key={i} className="stat-card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                    <div style={{ position: "relative" }}>
                      <WorkoutThumbnail workout={bonusWorkout} flush />
                      <div style={{
                        position: "absolute", top: 8, left: 10,
                        background: "rgba(26,143,76,0.88)", color: "#fff",
                        fontSize: 10, fontWeight: 700, padding: "2.5px 8px",
                        borderRadius: 20, display: "flex", alignItems: "center", gap: 4,
                        letterSpacing: "0.06em", boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
                      }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        BONUS
                      </div>
                    </div>
                    <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: 3 }}>
                        {actual.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500, marginBottom: 10 }}>
                        {w.day}{w.date ? ` · ${w.date}` : ""} · Bonus ride!
                      </div>
                      {bonusStats && <div style={{ fontSize: 12.5, color: "var(--text)", opacity: 0.8 }}>{bonusStats}</div>}
                      <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 10.5, color: "var(--muted)", fontStyle: "italic" }}>
                        Planned: Rest Day — great job riding anyway!
                      </div>
                    </div>
                  </div>
                );
              }

              // ── Planned: no ride done yet ──
              return (
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
                    {w.structure && w.structure.length > 0 && (
                      <span style={{ marginLeft: 6, opacity: 0.8 }}>
                        · ~{calcTss(w.structure)} TSS
                      </span>
                    )}
                  </div>
                  <div className="card-desc" style={{ fontSize: 12, opacity: 0.85, marginTop: 6, flexGrow: 1 }}>
                    {w.description}
                  </div>
                  {/* Interval structure chips — colored by power zone */}
                  {w.structure && w.structure.length > 0 && (
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10,
                      paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      {w.structure.map((b, j) => {
                        const zone = zoneForPowerFraction(b.powerFtp);
                        const isInterval = b.type === "intervals";
                        const label = isInterval
                          ? `${b.repeats ?? "?"}×${Math.round((b.onSec ?? 0) / 60)}′ @ ${Math.round(b.powerFtp * 100)}%`
                          : `${b.durationMin}′ @ ${Math.round(b.powerFtp * 100)}%`;
                        return (
                          <span key={j} title={b.label} style={{
                            fontSize: 10.5, padding: "3px 7px", borderRadius: 4,
                            background: `${zone.color}1a`,
                            border: `1px solid ${zone.color}55`,
                            color: zone.color,
                            fontWeight: 600, letterSpacing: "0.01em",
                          }}>
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {!isRestDay(w.type) && (() => {
                    const tpKey = `tp_${w.date ?? w.title}`;
                    const tps   = tpPushState[tpKey] ?? "idle";
                    const tpLog = tpPushLog[tpKey] ?? "";
                    return (
                      <div style={{ marginTop: 14 }}>
                        {/* TP sync status — shown when connected; no interactive button, auto-push handles it */}
                        {tpConnected && (
                          <div style={{ marginBottom: 6, textAlign: "center", fontSize: 11, fontWeight: 600 }}>
                            {tps === "loading" && (
                              <span style={{ color: "var(--muted)", opacity: 0.7 }}>
                                ⏳ Syncing to TrainingPeaks…
                              </span>
                            )}
                            {tps === "ok" && (
                              <span style={{ color: "#e8264c" }}>
                                ✓ Synced → TrainingPeaks → Zwift + Garmin
                              </span>
                            )}
                            {tps === "error" && (
                              <span style={{ color: "var(--danger)" }} title={tpLog}>
                                ✗ Sync failed
                              </span>
                            )}
                            {tps === "idle" && (
                              <span style={{ color: "var(--muted)", opacity: 0.4, fontSize: 10 }}>
                                will sync on generate
                              </span>
                            )}
                          </div>
                        )}

                        {/* Download .zwo — always available as fallback */}
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ width: "auto", padding: "5px 11px", fontSize: 11 }}
                            onClick={() => handleDownloadZwo(w)}
                          >
                            ↓ Download .zwo
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>
            {tpConnected
              ? <>
                  <strong style={{ opacity: 0.8, color: "#e8264c" }}>TrainingPeaks connected</strong> — workouts pushed here appear in your Zwift calendar automatically (connect Zwift to TrainingPeaks once in the Zwift Companion app if you haven&apos;t yet). Fall back to{" "}
                  <strong style={{ opacity: 0.8 }}>↓ Download .zwo</strong> at any time.
                </>
              : <>
                  <strong style={{ opacity: 0.8 }}>Connect TrainingPeaks</strong> (above) for the easiest path — push workouts straight to your Zwift calendar. Or use{" "}
                  <strong style={{ opacity: 0.8 }}>↓ Download .zwo</strong> and drop the file into{" "}
                  <code style={{ fontSize: 10 }}>Documents/Zwift/Workouts/&lt;your Zwift ID&gt;/</code>,
                  then open Zwift once.
                </>
            }
          </div>
        </>
      )}
    </div>
    );
}
