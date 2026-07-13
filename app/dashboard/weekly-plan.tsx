"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { IconBolt } from "./icons";
import { generateZwoXml, zwoFileName, isRestDay, zoneForPowerFraction, structureToBlocks, computeIfTss, type WorkoutStructureBlock } from "@/lib/zwo";
import { getPhaseForWeekIndex } from "@/lib/periodization";
import { WEEK_DAYS, ensureWorkoutDates, normalizeToSix, workoutDateLabel } from "@/lib/plan-shape";
import WorkoutThumbnail from "./workout-thumbnail";
import HeroBanner from "./hero-banner";
import TrainingProfileCard from "./training-profile";
import ConnectionsPanel from "./connections-panel";

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
  id?: string;
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

/** Training Stress Score from structured blocks - delegates to the same
 *  NP-style (4th-power-weighted) computeIfTss() used when pushing the
 *  workout to TrainingPeaks, so the number shown here on the card always
 *  matches what actually gets recorded on TP. Previously this used a
 *  simpler average-power² formula that could disagree with the TP-side
 *  value - two different "truths" for the same workout. */
function calcTss(structure: WorkoutStructureBlock[]): number {
  return Math.round(computeIfTss(structureToBlocks(structure)).tss);
}

interface WeeklyPlan {
  weekOf: string;
  summary: string;
  workouts: WeeklyWorkout[];
}

const STORAGE_KEY = "zwiftWeeklyPlan";
const CYCLE_STORAGE_KEY = "zwiftMacroCycle";
/** Pre-fetched *next* week's plan, generated early once the rolling 7-day
 *  window can no longer be filled from the current week alone. Bundled with
 *  the macro-cycle state that generating it produced, so the periodization
 *  pointer (lib/periodization.ts) only advances for real once this bundle is
 *  actually promoted to become the active plan (its week arrives) - never
 *  early, or the mesocycle count would drift ahead of real time. */
const STORAGE_KEY_NEXT = "zwiftWeeklyPlanNext";
const ACTIVITIES_CACHE_KEY = "zwiftWeekActivitiesCache";
const ACTIVITIES_CACHE_WEEK_KEY = "zwiftWeekActivitiesWeek";
/** localStorage key for the array of TP workoutIds pushed in the current plan */
const TP_PUSHED_IDS_KEY = "zwiftTPPushedWorkoutIds";
// Intervals.icu sync now happens server-side, automatically, the moment a
// plan is generated (see app/api/ai/weekly-plan/route.ts) - the browser no
// longer pushes anything itself, so there's no per-browser pushed-ids list
// to track here anymore. See lib/headless-sync.ts for the sync algorithm.

function colorForType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("rest") || t.includes("recover")) return "c-green";
  if (t.includes("interval") || t.includes("sweet") || t.includes("threshold")) return "c-orange";
  if (t.includes("endurance")) return "c-blue";
  return "c-teal";
}

/** Hex values matching each colorForType bucket's existing icon color (see
 *  .stat-card-icon.c-* in globals.css) - used for the workout card's
 *  top intensity-color bar. */
const TYPE_BAR_COLOR: Record<string, string> = {
  "c-green": "#1a9e52",
  "c-orange": "#e85d00",
  "c-blue": "#2f8fe0",
  "c-teal": "#0f9488",
};

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
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
  weeksToEvent?: number | null;
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

/** A pre-generated next-week plan, bundled with the macro-cycle state that
 *  generating it produced (see STORAGE_KEY_NEXT doc comment above). */
interface NextWeekBundle {
  plan: WeeklyPlan;
  macroCycle: MacroCycleState | null;
  cycle: PhaseInfo | null;
}

function loadCachedNextBundle(): NextWeekBundle | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_NEXT);
    if (!raw) return null;
    return JSON.parse(raw) as NextWeekBundle;
  } catch {
    return null;
  }
}

function saveNextBundle(bundle: NextWeekBundle | null) {
  try {
    if (bundle) {
      window.localStorage.setItem(STORAGE_KEY_NEXT, JSON.stringify(bundle));
    } else {
      window.localStorage.removeItem(STORAGE_KEY_NEXT);
    }
  } catch {}
}

/** Adds `days` (may be negative) to an ISO "YYYY-MM-DD" date, UTC-safe. */
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rolling 6-day-ahead window: merges the active plan's workouts with a
 * pre-fetched next-week plan (if any), drops anything whose date has already
 * passed, and returns the next `size` upcoming days in date order. This is
 * what the dashboard actually renders - never `plan.workouts` directly -
 * so a workout silently disappears from view the day after it happens, and
 * the grid always shows exactly 6 days of what's coming up regardless of
 * where "today" falls inside the calendar week.
 *
 * size stays 6 by design (that's the intended grid width) - the earlier
 * "Sunday missing" bug wasn't the count, it was normalizeToSix silently
 * dropping a REST day out of the underlying plan data (not just the
 * display), which could open a gap in the middle of the week instead of at
 * the edge of the 6-day slice. normalizeToSix now keeps all 7 real calendar
 * days in the data model; this window still only ever *shows* 6 of them,
 * but since the pool it slices from is always gap-free, the 6 it picks are
 * always consecutive real days with no hole in the middle.
 */
function computeForwardWindow(
  current: WeeklyPlan | null,
  next: WeeklyPlan | null,
  today: string,
  size = 6
): WeeklyWorkout[] {
  if (!current) return [];
  const pool = [...current.workouts, ...(next?.workouts ?? [])];
  const upcoming = pool
    .filter((w) => (w.date ?? "") >= today)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return upcoming.slice(0, size);
}

// WEEK_DAYS / ensureWorkoutDates / normalizeToSix now live in
// lib/plan-shape.ts (imported above) so the exact same logic runs for both
// this client component and the headless cron plan generator - see that
// file's doc comment for why a second, drifting copy is exactly what caused
// the day-name/date mismatch bug this project already fixed once.

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
  // Pre-fetched next week's plan (rolling 7-day-ahead window) - null until
  // the current week's remaining days can no longer fill the display.
  const [nextPlan, setNextPlan] = useState<WeeklyPlan | null>(null);
  const [prefetchingNext, setPrefetchingNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [cycleInfo, setCycleInfo] = useState<PhaseInfo | null>(null);
  // The server's actual report of what happened when it tried to push this
  // plan to Intervals.icu (see app/api/ai/weekly-plan/route.ts's
  // intervalsSync response field) - null before the first response arrives,
  // or if the rider isn't connected to ICU at all. Driving the "synced"
  // indicator off this REAL result (instead of just "is ICU connected")
  // matters: a connected-but-failed push should never look identical to a
  // connected-and-succeeded one.
  const [lastIntervalsSync, setLastIntervalsSync] = useState<
    { pushed: number; deleted: number; errors: string[] } | null
  >(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [riderNote, setRiderNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  // Map of YYYY-MM-DD → actual Zwift ride done on that day (this week only)
  const [weekActivities, setWeekActivities] = useState<Map<string, ActualRide>>(new Map());

  // Post-workout feeling scores: date → 1–5. Persisted to localStorage so the
  // picker shows the saved value on reload, even before the KV write confirms.
  const [feelingScores, setFeelingScores] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("zwift:feelingScores");
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch { return {}; }
  });
  const [feelingSubmitting, setFeelingSubmitting] = useState<Set<string>>(new Set());

  // ICU calendar cleanup runs automatically on page load and after every push — no user action needed.

  // Rider's current FTP - needed to convert a completed ride's raw-watts FIT
  // power stream into the FTP-fraction units WorkoutThumbnail draws in (same
  // units generateDefaultBlocks/sampleWorkoutPower already use for planned
  // workouts), so a real ride's bar graph lines up with the same zone colors.
  const [ftp, setFtp] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/zwift/profile")
      .then(r => r.json())
      .then(d => { if (d.ok && d.profile?.ftp) setFtp(d.profile.ftp as number); })
      .catch(() => {});
  }, []);

  // Real per-ride power stream (FTP fractions), keyed by activity id - filled
  // in lazily below once both weekActivities and ftp are known. This is what
  // lets the completed-ride thumbnail draw the shape of the ride actually
  // performed instead of a shape inferred from the (possibly since-changed)
  // plan slot - see the completedThumbWorkout comment further down.
  const [realPowerByRideId, setRealPowerByRideId] = useState<Map<string, number[]>>(new Map());
  useEffect(() => {
    if (!ftp || ftp <= 0) return;
    const idsNeeded = [...weekActivities.values()]
      .map(a => a.id)
      .filter((id): id is string => !!id && !realPowerByRideId.has(id));
    if (idsNeeded.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const id of idsNeeded) {
        try {
          const r = await fetch(`/api/zwift/activities/${id}/detail`);
          const d = await r.json();
          if (cancelled) return;
          if (!d.ok || !d.fit?.ok || !Array.isArray(d.fit.points)) continue;
          const watts = (d.fit.points as { power?: number }[])
            .map(p => p.power)
            .filter((p): p is number => typeof p === "number" && p > 0);
          if (watts.length === 0) continue;
          const fractions = watts.map(w => w / ftp);
          setRealPowerByRideId(prev => new Map(prev).set(id, fractions));
        } catch {
          // Best-effort — thumbnail falls back to the inferred shape.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [weekActivities, ftp, realPowerByRideId]);

  // Auto-sync to ICU is intentionally disabled on page load — see the comment
  // below the connections useEffect for the full explanation.

  // Connections panel visibility — hidden by default, toggled via header button
  const [showConnections, setShowConnections] = useState(false);
  useEffect(() => {
    const toggle = () => setShowConnections(v => !v);
    window.addEventListener("zwift:toggle-connections", toggle);
    return () => window.removeEventListener("zwift:toggle-connections", toggle);
  }, []);

  // Today's Note nav chip — open the note panel when the header button is clicked
  useEffect(() => {
    const open = () => setNoteOpen(true);
    window.addEventListener("zwift:open-todays-note", open);
    return () => window.removeEventListener("zwift:open-todays-note", open);
  }, []);

  // Immediate regenerate on profile save (see the dispatch in
  // training-profile.tsx's saveProfile). Reuses the exact same path a daily
  // note already used - handleGenerate() regenerates THIS week using
  // whatever's currently in localStorage (so it picks up the profile edit
  // that was just made); the POST this triggers already pushes the result to
  // Intervals.icu server-side (see app/api/ai/weekly-plan/route.ts) - no
  // separate wiring needed for that part.
  useEffect(() => {
    const onProfileSaved = () => { handleGenerate(); };
    window.addEventListener("zwift:profile-saved", onProfileSaved);
    return () => window.removeEventListener("zwift:profile-saved", onProfileSaved);
    // Re-subscribe whenever plan/stale change so the listener always closes
    // over the current handleGenerate (which reads them) - an empty dep
    // array here would freeze it on whatever plan/stale were at first
    // mount (both still null/false that early), silently dropping
    // "previousPlan" context from every profile-triggered regenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, stale]);

  // Client-side auto-sync on page load is intentionally ABSENT: syncing on
  // every page load from every browser/device caused a cross-device race
  // (Mac and iPad each took their own pre-push ICU snapshot, each pushed 6
  // new events, but each only deleted the snapshot IDs it personally saw -
  // not the other device's newly-pushed events - leaving duplicates on ICU
  // that accumulated on every page load).
  //
  // The fix isn't "only sync on explicit user action" (that was the previous
  // approach and still allowed two devices to race if both clicked Generate
  // around the same time) - it's that the browser no longer pushes to
  // Intervals.icu AT ALL. The push now happens exactly once, server-side,
  // inside the POST /api/ai/weekly-plan request itself, the moment a plan is
  // actually generated (see that route's doc comment, and
  // lib/headless-sync.ts for the push-then-delete-duplicates algorithm). The
  // nightly cron calls the same function for riders who never open the
  // dashboard that week. Every code path that can produce a plan syncs it,
  // and no code path left in the browser can race against that.

  useEffect(() => {
    const thisWeek = currentWeekOf();

    // localStorage is WRITE-ONLY from the dashboard's perspective.
    // The server (KV / /api/ai/weekly-plan/state) is the single source of
    // truth for the plan. We read localStorage only for:
    //   1. The pre-fetched next-week bundle — a fallback if the server has
    //      no entry yet for the new week (e.g. cron hasn't run yet this
    //      Monday morning). It is NEVER shown until the server check says
    //      there's nothing better.
    //   2. Macro-cycle state and activity cache — display-only, no
    //      correctness impact.
    // We never display a plan from localStorage directly; showing a stale
    // local plan while waiting for the server caused cross-device
    // discrepancies (Mac sees Sunday workout, iPad doesn't) and auto-sync
    // races (two devices simultaneously re-pushing to ICU).
    const cachedNextBundle = loadCachedNextBundle();
    const localNextWeekPlan: WeeklyPlan | null =
      cachedNextBundle && cachedNextBundle.plan.weekOf <= thisWeek
        ? ensureWorkoutDates(normalizeToSix(cachedNextBundle.plan))
        : null;

    if (localNextWeekPlan && cachedNextBundle?.macroCycle) {
      try { window.localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(cachedNextBundle.macroCycle)); } catch {}
      setCycleInfo(cachedNextBundle.cycle ?? getPhaseForWeekIndex(cachedNextBundle.macroCycle.weekIndex));
      saveNextBundle(null); // consumed — clear so we don't re-promote next load
    } else {
      const cachedCycle = loadCachedCycle();
      if (cachedCycle) setCycleInfo(getPhaseForWeekIndex(cachedCycle.weekIndex));
    }

    // Server is authority. Wait for it before rendering any plan.
    (async () => {
      let serverPlan: WeeklyPlan | null = null;
      let serverCycle: MacroCycleState | null = null;
      try {
        const r = await fetch("/api/ai/weekly-plan/state", { cache: "no-store" });
        const d = await r.json();
        if (d.ok && d.plan && d.plan.weekOf === thisWeek) {
          serverPlan = ensureWorkoutDates(
            normalizeToSix({ weekOf: d.plan.weekOf, summary: d.plan.summary ?? "", workouts: d.plan.workouts })
          );
          serverCycle = d.macroCycle ?? null;
        }
      } catch {
        // Network failure — fall through to local fallback below.
      }

      if (serverPlan) {
        // Server has a plan for this week — always use it. No comparison
        // against local needed: server is truth.
        setPlan(serverPlan);
        setStale(false);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serverPlan)); } catch {}
        if (serverCycle) {
          try { window.localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(serverCycle)); } catch {}
          setCycleInfo(getPhaseForWeekIndex(serverCycle.weekIndex));
        }
        prefetchNextWeekIfNeeded(serverPlan);
        return;
      }

      // Server has nothing for this week. Check if we have a pre-fetched
      // next-week bundle (smooth rollover from last week's prefetch).
      if (localNextWeekPlan) {
        // Show the pre-fetched plan. There is no manual Generate button
        // anymore - plan generation is entirely automatic (the Sunday-night
        // cron, plus ensurePlanProvisioned running server-side on every
        // login/connect/dashboard load - see lib/plan-runner.ts). This read
        // stays read-only; it never itself triggers generation.
        setPlan(localNextWeekPlan);
        setStale(false);
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localNextWeekPlan)); } catch {}
        return;
      }

      // No server plan, no local fallback yet - this is now a rare transient
      // state (e.g. a brand-new athlete whose background auto-provisioning
      // is still running). Nothing to click; the GET call above already
      // triggered provisioning server-side, so a later reload will show it.
      setStale(true);
    })();

    // Load cached activities immediately to prevent flash on refresh
    try {
      const cachedWeek = window.localStorage.getItem(ACTIVITIES_CACHE_WEEK_KEY);
      if (cachedWeek === thisWeek) {
        const raw = window.localStorage.getItem(ACTIVITIES_CACHE_KEY);
        if (raw) {
          setWeekActivities(new Map(JSON.parse(raw) as [string, ActualRide][]));
        }
      }
    } catch {}

    // TP_DISABLED: TrainingPeaks UI removed — backend code preserved in
    // lib/trainingpeaks.ts + app/connect-tp/ for quick re-enabling.
    // To restore: uncomment the block below and re-enable the UI sections
    // marked TP_DISABLED throughout this file and connections-panel.tsx.
    //
    // fetch("/api/trainingpeaks/status", { cache: "no-store" })
    //   .then(r => r.json())
    //   .then(d => {
    //     if (d.connected) { setTpConnected(true); setTpTokenExpired(false); cleanupStaleTPWorkouts(); }
    //     else if (d.tokenExpired) { setTpTokenExpired(true); }
    //   })
    //   .catch(() => {});

    // Check Intervals.icu connection status; if connected, silently clean up
    // any duplicate events that may have accumulated from a past cross-device
    // race. Throttled to once per 4 hours via localStorage so it doesn't run
    // on every single page load — but the user never sees any of this.
    fetch("/api/intervals/status")
      .then(r => r.json())
      .then(d => {
        if (d.connected) {
          setIntervalsConnected(true);
          // Always clean up on page load — the endpoint is cheap (list + delete
          // duplicates only, no new pushes) and covers the past 5 weeks so any
          // old duplicate from a prior regeneration gets swept up immediately.
          fetch("/api/intervals/cleanup", { method: "POST" }).catch(() => {});
        }
      })
      .catch(() => {});

    // Check Strava connection status + handle redirect-back from OAuth
    fetch("/api/strava/status")
      .then(r => r.json())
      .then((d: { connected: boolean; athleteName?: string }) => {
        if (d.connected) { setStravaConnected(true); setStravaName(d.athleteName ?? null); }
      })
      .catch(() => {});
    // Handle Strava OAuth redirect-back
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("strava_connected") === "1") {
      setStravaConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (urlParams.get("strava_error")) {
      setError(`Strava error: ${urlParams.get("strava_error")}`);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Fetch this week's actual Zwift rides to detect completed workouts
    // Fix: include Sunday (day before Monday) so rides on Sunday show as DONE
  const weekStart = addDaysIso(thisWeek, -1);
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
              id: (a.id_str as string | undefined) ?? (a.id != null ? String(a.id) : undefined),
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

  // Pushes every non-rest workout in `normalizedPlan` to TrainingPeaks, first
  // deleting whatever the previously-active plan had pushed - the TP
  // calendar should only ever reflect the plan currently shown here.
  // Re-checks connection status live (fetch, not the `tpConnected` React
  // state) because this can run from the mount effect before that state has
  // had a chance to settle.
  async function pushPlanToTP(normalizedPlan: WeeklyPlan) {
    let connected = tpConnected;
    try {
      const r = await fetch("/api/trainingpeaks/status");
      const d = await r.json();
      connected = !!d.connected;
    } catch { /* fall back to the React state above on network failure */ }
    if (!connected) return;

    // 0. Try to refresh the TP token proactively before pushing
    try { await fetch("/api/trainingpeaks/refresh", { method: "POST" }); } catch {}

    // 1. Delete previously pushed workouts from TP - awaited (not
    // fire-and-forget) so a failed delete doesn't silently lose track of an
    // orphaned entry. Anything that fails even after one retry stays in
    // TP_PUSHED_IDS_KEY so the *next* push attempt tries again instead of
    // abandoning it on TP forever.
    const deleteOne = (id: string | number) =>
      fetch("/api/trainingpeaks/push-workout", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workoutId: id }),
      }).then(r => r.ok).catch(() => false);

    try {
      const prevRaw = window.localStorage.getItem(TP_PUSHED_IDS_KEY);
      if (prevRaw) {
        const prevIds = JSON.parse(prevRaw) as (string | number)[];
        const firstPass = await Promise.all(prevIds.map(async id => ({ id, ok: await deleteOne(id) })));
        const stillFailing = firstPass.filter(r => !r.ok);
        // One retry - TP token refresh above may not have landed before the
        // first attempt fired, so a single retry catches most transient 401s.
        const secondPass = stillFailing.length > 0
          ? await Promise.all(stillFailing.map(async r => ({ id: r.id, ok: await deleteOne(r.id) })))
          : [];
        const stillOrphaned = secondPass.filter(r => !r.ok).map(r => r.id);
        // Keep only the ones we truly couldn't delete - so they're retried
        // on the next push cycle instead of vanishing from our own records
        // while still sitting on the user's TP calendar.
        window.localStorage.setItem(TP_PUSHED_IDS_KEY, JSON.stringify(stillOrphaned));
        if (stillOrphaned.length > 0) {
          setTpPushLog(l => ({ ...l, _cleanup: `${stillOrphaned.length} old workout(s) couldn't be removed from TP - will retry next sync` }));
        } else {
          setTpPushLog(l => { const { _cleanup, ...rest } = l; return rest; });
        }
      }
    } catch {}

    // 2. Push new workouts (awaited so IDs are stored before this function returns,
    //    preventing a race condition if the user regenerates quickly)
    await Promise.all(
      normalizedPlan.workouts
        .filter(w => !isRestDay(w.type))
        .map(w => handlePushToTP(w))
    );
  }

  /**
   * Ongoing (not one-time) cleanup of this app's own stale duplicate pushes
   * on TrainingPeaks - runs every time TP is confirmed connected, same as
   * the Intervals.icu cleanup runs every sync, rather than depending on a
   * single browser's localStorage memory of what it once pushed. That
   * one-off/local-only approach was the actual weak point: it only ever
   * caught ids the CURRENT browser remembered, so a duplicate pushed from a
   * different device/session, or surviving a cleared localStorage, would
   * never get cleaned up and could look "fixed" only to resurface later.
   *
   * Server-truth queries always converge instead: list what TP actually has
   * in a wide date range and delete every match, every time this runs - no
   * memory required, so nothing can permanently slip through.
   *
   * Safety: TP's workout list mixes planned and completed entries in one
   * collection, so this is deliberately conservative about what counts as
   * "ours to delete." A workout is only removed if BOTH are true:
   *   1. Its title carries the exact "Mon Jul 8 · " date-label prefix this
   *      app always adds (see workoutDateLabel/handlePushToTP) - not a
   *      pattern a rider or Garmin would produce on their own.
   *   2. It has no actual/completed data attached (totalTime and distance
   *      are both empty) - i.e. nothing real was ever recorded against it.
   * A workout failing either check - including anything with real ride data
   * merged in, planned or not - is left alone.
   */
  async function cleanupStaleTPWorkouts() {
    const dateLabelPrefix = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} · /;
    const today = todayIso();
    const oldest = addDaysIso(today, -90);
    const newest = addDaysIso(today, 30);
    try {
      const r = await fetch(`/api/trainingpeaks/push-workout?oldest=${oldest}&newest=${newest}`);
      const d = await r.json();
      if (!d.ok || !Array.isArray(d.workouts)) return;
      const stale = (d.workouts as {
        workoutId: string | number;
        title?: string;
        totalTime?: number | null;
        distance?: number | null;
      }[]).filter(w =>
        w.title && dateLabelPrefix.test(w.title) &&
        !(w.totalTime && w.totalTime > 0) &&
        !(w.distance && w.distance > 0)
      );
      if (stale.length === 0) return;
      await Promise.all(stale.map(w =>
        fetch("/api/trainingpeaks/push-workout", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workoutId: w.workoutId }),
        }).catch(() => {})
      ));
    } catch {
      // Best-effort - next time TP shows connected, this runs again.
    }
  }

  // Intervals.icu sync is no longer triggered from the browser at all - it
  // now happens automatically server-side, exactly once per generation, in
  // app/api/ai/weekly-plan/route.ts (see lib/headless-sync.ts for the
  // push-then-delete-duplicates algorithm). This eliminates the cross-device
  // duplicate-event bug that motivated the client-side version's design
  // (query-before-push, full-week cleanup range, etc.) - that client version
  // (pushPlanToIntervals/handlePushToIntervals) has been removed entirely
  // rather than left as an unused, now-conflicting second pusher.
  void pushPlanToTP; // kept for a possible future manual "push this day to TP" action; not auto-called

  /**
   * Generates a plan for `targetWeekOf` and makes it the active, on-screen
   * plan (loading/error state, TP push, localStorage). Used both for the
   * manual "generate new plan" button and for the automatic fallback when
   * the rider returns to a fully stale dashboard (no pre-fetched plan could
   * cover the current week).
   */
  async function generateAndActivate(targetWeekOf: string, previousPlanForAI?: WeeklyPlan | null) {
    setLoading(true);
    setError(null);
    try {
      const macroCycle = loadCachedCycle();
      let riderProfile = null;
      try {
        const raw = window.localStorage.getItem("zwiftRiderProfile");
        if (raw) riderProfile = JSON.parse(raw);
      } catch {}
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          macroCycle,
          previousPlan: previousPlanForAI ?? null,
          riderProfile,
          riderNote: riderNote.trim()
            ? `[Today is ${new Date().toISOString().slice(0,10)} (${new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})})] ${riderNote.trim()}`
            : undefined,
          targetWeekOf,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const normalizedPlan = ensureWorkoutDates(normalizeToSix(data.plan));
        setPlan(normalizedPlan);
        setStale(false);
        setCycleInfo(data.cycle ?? null);
        setRiderNote("");
        // Intervals.icu sync already happened server-side inside the request
        // above (see app/api/ai/weekly-plan/route.ts) - nothing to trigger
        // from here. Record the server's actual result so the UI can show
        // what really happened instead of just "ICU is connected" - a sync
        // failure there is best-effort and never surfaces as a request
        // error, so this is the only place that real outcome is visible.
        setLastIntervalsSync(data.intervalsSync ?? null);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedPlan));
          if (data.macroCycle) {
            window.localStorage.setItem(CYCLE_STORAGE_KEY, JSON.stringify(data.macroCycle));
          }
        } catch {}
        // A freshly (re)generated active plan supersedes any pre-fetched
        // "next" bundle, unless it happens to already be the week right
        // after this one.
        try {
          const cachedNextBundle = loadCachedNextBundle();
          if (!cachedNextBundle || cachedNextBundle.plan.weekOf !== addDaysIso(targetWeekOf, 7)) {
            saveNextBundle(null);
            setNextPlan(null);
          }
        } catch {}
        // Keep the rolling window topped up going forward.
        try { prefetchNextWeekIfNeeded(normalizedPlan); } catch {}
      } else {
        setError(data.error ?? "Could not generate a weekly plan.");
      }
    } catch (e) {
      const detail = e instanceof Error ? `: ${e.message}` : (e ? `: ${String(e)}` : "");
      setError(`Network error reaching the server${detail}.`);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Background pre-fetch of next week's plan, so the rolling 6-day window
   * (see computeForwardWindow) never has to fall back on empty days as the
   * current week's remaining slots run out. Cheap to call speculatively -
   * it no-ops unless the window would actually come up short and nothing
   * matching is cached yet.
   */
  async function prefetchNextWeekIfNeeded(activePlan: WeeklyPlan) {
    const today = todayIso();
    const windowNow = computeForwardWindow(activePlan, null, today, 6);
    if (windowNow.length >= 6) return; // current week alone still covers 6 upcoming days

    const targetWeekOf = addDaysIso(activePlan.weekOf, 7);
    const cachedNext = loadCachedNextBundle();
    if (cachedNext && cachedNext.plan.weekOf === targetWeekOf) {
      setNextPlan(cachedNext.plan);
      return;
    }

    setPrefetchingNext(true);
    try {
      const macroCycle = loadCachedCycle();
      let riderProfile = null;
      try {
        const raw = window.localStorage.getItem("zwiftRiderProfile");
        if (raw) riderProfile = JSON.parse(raw);
      } catch {}
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macroCycle, previousPlan: activePlan, riderProfile, targetWeekOf }),
      });
      const data = await res.json();
      if (data.ok) {
        const normalized = ensureWorkoutDates(normalizeToSix(data.plan));
        saveNextBundle({ plan: normalized, macroCycle: data.macroCycle ?? null, cycle: data.cycle ?? null });
        setNextPlan(normalized);
      }
    } catch {
      // Silent — this is a background convenience prefetch. Worst case, the
      // rolling window shows fewer than 6 days until the next successful
      // attempt (next page load), or the full-stale fallback kicks in once
      // the week actually rolls over with nothing cached.
    } finally {
      setPrefetchingNext(false);
    }
  }

  /** Submit a post-workout feeling score (1–5) for a completed session. */
  async function submitFeelingScore(
    date: string,
    workoutTitle: string,
    category: string,
    score: number,
  ) {
    // Optimistic update
    setFeelingScores(prev => {
      const next = { ...prev, [date]: score };
      try { localStorage.setItem("zwift:feelingScores", JSON.stringify(next)); } catch {}
      return next;
    });
    setFeelingSubmitting(prev => new Set(prev).add(date));
    try {
      await fetch("/api/ai/session-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, workoutTitle, category, feelingScore: score }),
      });
    } catch {
      // best-effort — the score is already saved in localStorage
    } finally {
      setFeelingSubmitting(prev => { const s = new Set(prev); s.delete(date); return s; });
    }
  }

  /** Manual "generate new plan" button - always targets the real current week. */
  async function handleGenerate() {
    const targetWeekOf = currentWeekOf();
    // Always pass the current plan so the AI can make incremental changes
    // (e.g. "add Sunday" after already having changed Friday and Saturday).
    // Without this, each generate starts from scratch and resets prior edits.
    const previousPlanForAI = plan ?? null;
    await generateAndActivate(targetWeekOf, previousPlanForAI);
  }

  // Rolling 6-day-ahead window actually rendered below - see
  // computeForwardWindow's doc comment. Recomputed whenever the active plan,
  // the pre-fetched next-week plan changes (date doesn't need to be a
  // dependency - a stale "today" only matters across a full page reload,
  // which remounts this component anyway).
  const displayWorkouts = useMemo(
    () => computeForwardWindow(plan, nextPlan, todayIso(), 6),
    [plan, nextPlan]
  );

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

  // ── Intervals.icu integration ──────────────────────────────────────────────
  // Push status is no longer tracked client-side - the push itself happens
  // server-side now (see app/api/ai/weekly-plan/route.ts). This state is only
  // whether the rider has connected an account, for the Connect/Change-key UI.
  const [intervalsConnected, setIntervalsConnected] = useState(false);


  // Ref for the bookmarklet anchor. We MUST set href via setAttribute after
  // mount rather than as a JSX prop — React (Next.js) sanitizes javascript:
  // URLs in JSX and replaces them with a throw-Error stub, which is exactly
  // what was being saved to the user's bookmarks bar.
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!bookmarkletRef.current) return;
    const origin = window.location.origin;
    // The bookmarklet runs on app.trainingpeaks.com (same origin as TP cookies),
    // so it can fetch both the token and the athlete profile directly from TP's
    // API without CORS issues. Fetching the profile client-side here avoids a
    // server-to-server call from Vercel to TP (which TP may block or rate-limit).
    // Strategy for getting the TP athlete ID without CORS preflight:
    // 1. /users/v3/token  — GET with credentials:'include' (cookies) → works, gives access_token
    // 2. /users/v3/user   — first try GET with credentials:'include' (cookies, no Authorization
    //    header) → same "simple request" pattern as #1, no preflight. If TP supports cookie auth
    //    on this endpoint too, this is all we need.
    // 3. Fallback: try with Authorization header (triggers preflight — may fail on CORS, but
    //    worth a shot in case TP relaxed their policy).
    // The server never needs to call TP at all when aid is present in the redirect URL.
    const code = `(async()=>{try{const r=await fetch('https://tpapi.trainingpeaks.com/users/v3/token',{credentials:'include',headers:{Accept:'application/json'}});if(!r.ok){alert('TrainingPeaks: not logged in (HTTP '+r.status+') — please log in at app.trainingpeaks.com first');return;}const d=await r.json();const t=d?.token?.access_token;const rt=d?.token?.refresh_token||'';const exp=d?.token?.expires_in||'';if(!t){alert('TrainingPeaks error: no access_token in response. Please try again.');return;}let aid='';try{let pr=await fetch('https://tpapi.trainingpeaks.com/users/v3/user',{credentials:'include',headers:{Accept:'application/json'}});if(!pr.ok)pr=await fetch('https://tpapi.trainingpeaks.com/users/v3/user',{headers:{Authorization:'Bearer '+t,Accept:'application/json'}});if(pr.ok){const pd=await pr.json();const p=pd?.user??pd;aid=String(p?.personId??p?.athleteId??p?.userId??'');}}catch(pe){console.warn('TP profile:',pe);}location.href='${origin}/connect-tp#t='+encodeURIComponent(t)+'&rt='+encodeURIComponent(rt)+'&exp='+exp+'&aid='+encodeURIComponent(aid);}catch(e){alert('TrainingPeaks connection error: '+e.message)}})()`;

    bookmarkletRef.current.setAttribute('href', `javascript:${encodeURIComponent(code)}`);
  }, [showTPModal]);

  // Poll connection status every 2 s while modal is open waiting for bookmarklet.
  //
  // Two things used to make this hang indefinitely even after a genuinely
  // successful connect:
  //  1. The fetch had no cache option, so the browser's HTTP cache could
  //     serve back a stale {connected:false} instead of hitting the network.
  //  2. The whole flow requires switching to another tab (TrainingPeaks) to
  //     click the saved bookmark - browsers throttle setInterval timers in
  //     backgrounded tabs, so the poll could sit un-fired for a long time
  //     while this tab was hidden. A "visibilitychange" listener forces an
  //     immediate check the moment the rider switches back to this tab,
  //     instead of waiting on a throttled interval to eventually tick.
  useEffect(() => {
    if (!tpPolling || tpConnected) return;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/trainingpeaks/status", { cache: "no-store" });
        const data = await res.json() as { connected: boolean };
        if (data.connected) {
          setTpConnected(true);
          setTpPolling(false);
          setShowTPModal(false);
          setTpTokenExpired(false);
        }
      } catch { /* ignore */ }
    };

    const id = setInterval(checkStatus, 2000);
    const onVisible = () => { if (document.visibilityState === "visible") checkStatus(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [tpPolling, tpConnected]);

  // After 45s of waiting with no success, most likely cause is the rider
  // forgot to actually click the bookmark in the other tab (easy to miss,
  // since nothing visually confirms the click worked over there) - a gentle
  // reminder beats leaving them staring at "Waiting..." with no idea why.
  const [tpPollSlow, setTpPollSlow] = useState(false);
  useEffect(() => {
    if (!tpPolling) { setTpPollSlow(false); return; }
    const t = setTimeout(() => setTpPollSlow(true), 45000);
    return () => clearTimeout(t);
  }, [tpPolling]);

  // workoutDateLabel now imported from lib/plan-shape.ts (see import above).

  async function handlePushToTP(w: WeeklyWorkout) {
    const key = `tp_${w.date ?? w.title}`;
    setTpPushState(s => ({ ...s, [key]: "loading" }));
    const dateLabel = workoutDateLabel(w.date);
    const titledWorkout = dateLabel ? `${dateLabel} · ${w.title}` : w.title;
    const pushBody = JSON.stringify({
      workoutDay: w.date ?? new Date().toISOString().slice(0, 10),
      title: titledWorkout,
      description: w.description,
      durationMin: w.durationMin,
      type: w.type,
      targetPower: w.targetPowerPctFtp,
      // Real interval structure, when the AI provided one - this is what
      // makes the pushed workout an actual rideable structured entry in TP
      // (and therefore Zwift's Custom Workouts menu) instead of a plain note.
      structure: w.structure,
    });
    try {
      let res = await fetch("/api/trainingpeaks/push-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pushBody,
      });
      // If expired, try to auto-refresh and retry once
      if ((res.status === 401 || res.status === 403)) {
        const refreshRes = await fetch("/api/trainingpeaks/refresh", { method: "POST" });
        const refreshData = await refreshRes.json() as { ok: boolean; renewed?: boolean };
        if (refreshData.ok && refreshData.renewed) {
          res = await fetch("/api/trainingpeaks/push-workout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: pushBody,
          });
        }
      }
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
        setTpPushLog(l => ({ ...l, [key]: data.error ?? "Error." }));
        // If still expired after refresh attempt — show reconnect banner
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

  const todayWorkoutForBanner = (() => {
    const today = todayIso();
    const w = displayWorkouts.find((x) => x.date === today);
    if (!w || isRestDay(w.type)) return null;
    return { title: w.title, type: w.type, durationMin: w.durationMin };
  })();

  return (
    <div>

      <HeroBanner cycleInfo={cycleInfo} todayWorkout={todayWorkoutForBanner} />

      {/* TP_DISABLED: modal kept for quick re-enable — just remove the `false &&` */}
      {false /* TP_DISABLED */ && showTPModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(14,17,20,0.72)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        } as CSSProperties}
          onClick={() => { setShowTPModal(false); setTpPolling(false); }}
        >
          <div
            className="stat-card"
            style={{ maxWidth: 440, width: "100%", padding: "26px 26px 22px" }}
            onClick={e => e.stopPropagation()}
          >
            <style>{`
              @keyframes tpArrowBounce {
                0%, 100% { transform: translateY(2px); opacity: 0.35; }
                50%       { transform: translateY(-4px); opacity: 1; }
              }
              @keyframes connSpin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
              }
            `}</style>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, background: "#005695",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Connect TrainingPeaks</div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>
                  Two steps · takes about 30 seconds
                </div>
              </div>
              <button
                onClick={() => { setShowTPModal(false); setTpPolling(false); }}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}
              >×</button>
            </div>

            {/* Sets correct expectations up front — this connection no longer
                pushes the AI plan anywhere (that's Intervals.icu's job, done
                automatically server-side - see app/api/ai/weekly-plan/route.ts).
                Without this line, a rider connecting TP for their own outdoor/
                Garmin rides could reasonably expect their indoor workouts to
                show up here too, the way TP used to work in this app before. */}
            <div style={{
              fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6,
              background: "rgba(20,23,26,0.03)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "9px 12px", marginBottom: 18,
            }}>
              This just links your TrainingPeaks account for your own outdoor/Garmin rides.
              Your AI training plan keeps syncing through Intervals.icu → Zwift either way —
              connecting here won&apos;t add or duplicate anything on Zwift.
            </div>

            {/* ── Animated preview: shows the whole drag + click flow in
                a loop before the rider tries it themselves, since "drag
                this to your bookmarks bar" is an unfamiliar action for a
                lot of riders and static arrows only go so far. Pure CSS/SVG,
                no video asset - cheap to keep in sync if the real flow
                ever changes shape. ────────────────────────────────────── */}
            <style>{`
              @keyframes tpdemoDrag {
                0%   { transform: translate(0px,0px); opacity: 0; }
                4%   { opacity: 1; }
                20%  { transform: translate(-22px,-44px); opacity: 1; }
                24%  { transform: translate(-22px,-44px); opacity: 0; }
                100% { transform: translate(-22px,-44px); opacity: 0; }
              }
              @keyframes tpdemoSlot {
                0%, 22%   { fill: transparent; stroke-dasharray: 3,2; opacity: 0.55; }
                26%, 88%  { fill: var(--accent); stroke-dasharray: 0; opacity: 1; }
                94%, 100% { fill: transparent; stroke-dasharray: 3,2; opacity: 0.55; }
              }
              @keyframes tpdemoArrow {
                0%, 20%  { opacity: 0.3; }
                32%, 42% { opacity: 1; }
                52%, 100% { opacity: 0.3; }
              }
              @keyframes tpdemoClick {
                0%, 42%   { opacity: 0; transform: scale(1); }
                46%       { opacity: 1; transform: scale(1); }
                50%       { opacity: 1; transform: scale(0.8); }
                55%, 60%  { opacity: 1; transform: scale(1); }
                65%, 100% { opacity: 0; transform: scale(1); }
              }
              @keyframes tpdemoCheck {
                0%, 50%   { opacity: 0; transform: scale(0.4); }
                57%       { opacity: 1; transform: scale(1.2); }
                62%, 88%  { opacity: 1; transform: scale(1); }
                95%, 100% { opacity: 0; transform: scale(0.4); }
              }
              .tpdemo-drag { animation: tpdemoDrag 7s ease-in-out infinite; }
              .tpdemo-slot { animation: tpdemoSlot 7s ease-in-out infinite; }
              .tpdemo-arrow { animation: tpdemoArrow 7s ease-in-out infinite; }
              .tpdemo-click { animation: tpdemoClick 7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
              .tpdemo-check { animation: tpdemoCheck 7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
            `}</style>
            <div style={{
              marginBottom: 14, padding: "10px 8px", borderRadius: 12,
              border: "1px solid var(--border)", background: "rgba(20,23,26,0.02)",
            }}>
              <svg viewBox="0 0 400 130" width="100%" height="auto" style={{ display: "block" }}>
                {/* Panel A — this dashboard */}
                <rect x="6" y="6" width="178" height="110" rx="10" fill="var(--bg)" stroke="var(--border)" />
                <circle cx="16" cy="17" r="2.2" fill="var(--muted)" />
                <circle cx="24" cy="17" r="2.2" fill="var(--muted)" />
                <circle cx="32" cy="17" r="2.2" fill="var(--muted)" />
                <rect x="44" y="24" width="36" height="11" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.3" className="tpdemo-slot" />
                <rect x="36" y="64" width="118" height="28" rx="8" fill="rgba(47,143,224,0.10)" stroke="var(--accent)" strokeWidth="1.3" />
                <path d="M91 71l-4 5h3l-1 4 4-5h-3l1-4z" fill="var(--accent)" />
                <text x="106" y="82" fontSize="9" fontWeight="700" fill="var(--accent)" textAnchor="middle">Zwift AI → TP</text>

                {/* dragging cursor + ghost copy of the button, animating up into the bookmarks slot */}
                <g className="tpdemo-drag" style={{ transformOrigin: "95px 78px" } as React.CSSProperties}>
                  <rect x="36" y="64" width="118" height="28" rx="8" fill="rgba(47,143,224,0.18)" stroke="var(--accent)" strokeWidth="1" opacity="0.7" />
                  <circle cx="95" cy="78" r="5" fill="var(--text)" />
                </g>

                {/* connector */}
                <path d="M186 62 C 198 62, 202 62, 214 62" stroke="var(--muted)" strokeWidth="1.5" fill="none" markerEnd="url(#tpdemoArrowHead)" className="tpdemo-arrow" />
                <defs>
                  <marker id="tpdemoArrowHead" markerWidth="6" markerHeight="6" refX="4" refY="2" orient="auto">
                    <path d="M0,0 L4,2 L0,4 Z" fill="var(--muted)" />
                  </marker>
                </defs>

                {/* Panel B — TrainingPeaks tab */}
                <rect x="216" y="6" width="178" height="110" rx="10" fill="var(--bg)" stroke="var(--border)" />
                <circle cx="226" cy="17" r="2.2" fill="var(--muted)" />
                <circle cx="234" cy="17" r="2.2" fill="var(--muted)" />
                <circle cx="242" cy="17" r="2.2" fill="var(--muted)" />
                <rect x="254" y="24" width="36" height="11" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.3" className="tpdemo-slot" />
                <rect x="290" y="52" width="20" height="20" rx="6" fill="#005695" />
                <path d="M303 57l-5 6h4l-1 5 5-6h-4l1-5z" fill="white" />
                <text x="305" y="90" fontSize="9" fill="var(--muted)" textAnchor="middle">TrainingPeaks</text>

                {/* click on the saved bookmark in this tab */}
                <g className="tpdemo-click">
                  <circle cx="272" cy="29" r="7" fill="var(--accent)" opacity="0.25" />
                  <circle cx="272" cy="29" r="3.2" fill="var(--text)" />
                </g>

                {/* connected checkmark badge */}
                <g className="tpdemo-check">
                  <circle cx="384" cy="18" r="12" fill="#22c55e" />
                  <path d="M378 18l4 4 8-8" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </div>

            {/* ── Step 1 ──────────────────────────────────────────────── */}
            <div style={{
              marginBottom: 10, padding: "16px", borderRadius: 12,
              border: "1px solid var(--border)", background: "rgba(20,23,26,0.03)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", background: "var(--accent)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>1</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  Save this button to your browser
                  <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11.5, marginLeft: 6 }}>
                    (one time only)
                  </span>
                </div>
              </div>

              {/* Drag zone with animated arrows */}
              <div style={{
                borderRadius: 10, border: "1.5px dashed rgba(47,143,224,0.45)",
                padding: "14px 14px 12px", marginBottom: 10,
                background: "rgba(47,143,224,0.04)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
              }}>
                {/* Bouncing arrows showing direction to drag */}
                <div style={{ display: "flex", gap: 10 }}>
                  {[0, 0.22, 0.44].map((delay, i) => (
                    <svg key={i} width="11" height="16" viewBox="0 0 11 16" fill="none"
                      style={{ animation: `tpArrowBounce 1.4s ease-in-out ${delay}s infinite` }}>
                      <path d="M5.5 14V2M5.5 2L2 5.5M5.5 2L9 5.5"
                        stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", textAlign: "center" }}>
                  Drag this button up to your bookmarks bar
                </div>
                <a
                  ref={bookmarkletRef}
                  draggable
                  onClick={e => e.preventDefault()}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "13px 16px", borderRadius: 9,
                    border: "2px solid var(--accent)", background: "rgba(47,143,224,0.10)",
                    color: "var(--accent)", fontSize: 14, fontWeight: 700,
                    cursor: "grab", textDecoration: "none",
                    userSelect: "none" as const,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  Zwift AI → TP
                </a>
              </div>

              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
                <strong>Bar not visible?</strong> Press{" "}
                <code style={{ background: "rgba(20,23,26,0.07)", padding: "1px 6px", borderRadius: 4, fontSize: 10.5, fontFamily: "monospace" }}>
                  Ctrl+Shift+B
                </code>
                {" "}to show it &nbsp;·&nbsp; Firefox / Safari: right-click the button → <strong>Bookmark Link</strong>
              </div>
            </div>

            {/* ── Step 2 ──────────────────────────────────────────────── */}
            <div style={{
              padding: "16px", borderRadius: 12,
              border: tpPolling ? "1.5px solid rgba(47,143,224,0.35)" : "1px solid var(--border)",
              background: tpPolling ? "rgba(47,143,224,0.04)" : "rgba(20,23,26,0.03)",
              transition: "border-color 0.2s, background 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: tpPolling ? "var(--accent)" : "var(--border, #d8dce0)",
                  color: tpPolling ? "#fff" : "var(--muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  transition: "background 0.2s, color 0.2s",
                }}>2</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  Open TrainingPeaks and click the saved button
                </div>
              </div>

              {!tpPolling ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      window.open("https://app.trainingpeaks.com", "_blank");
                      setTpPolling(true);
                    }}
                    style={{
                      width: "100%", padding: "12px 18px", borderRadius: 8, border: "none",
                      background: "#005695", color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    Open TrainingPeaks →
                  </button>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
                    In the tab that opens, click the <strong>Zwift AI → TP</strong> button you just saved.
                    The dashboard connects automatically — you can close that tab.
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 8,
                    background: "rgba(47,143,224,0.08)",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      style={{ animation: "connSpin 1.5s linear infinite", flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="30 25"/>
                    </svg>
                    <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>
                      Waiting — click <strong>Zwift AI → TP</strong> in your bookmarks bar
                    </span>
                  </div>
                  {tpPollSlow && (
                    <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55, padding: "0 2px" }}>
                      Nothing yet? Make sure you&apos;re logged into TrainingPeaks in that tab, then click the saved button again.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cancel */}
            <button
              type="button"
              onClick={() => { setShowTPModal(false); setTpPolling(false); }}
              style={{
                width: "100%", marginTop: 10, padding: "8px 16px", borderRadius: 7,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted)", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TP_DISABLED: banner kept for quick re-enable — just remove the `false &&` */}
      {false /* TP_DISABLED */ && tpTokenExpired && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
          padding: "10px 16px", borderRadius: 8,
          background: "rgba(232,38,76,0.08)", border: "1px solid rgba(232,38,76,0.3)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8264c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style={{ fontSize: 12.5, color: "#e8264c", fontWeight: 600, flex: 1, lineHeight: 1.5 }}>
            TrainingPeaks token expired — this happens periodically since TP&apos;s token can&apos;t auto-renew.
            {" "}Your AI training plan isn&apos;t affected (it syncs through Intervals.icu, not TP) — reconnecting only matters if you want this dashboard linked to your TrainingPeaks account for outdoor/Garmin rides.
          </span>
          <button
            type="button"
            onClick={() => { setShowTPModal(true); setTpPolling(false); }}
            style={{
              padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(232,38,76,0.4)",
              background: "rgba(232,38,76,0.12)", color: "#e8264c",
              fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            Reconnect →
          </button>
        </div>
      )}

      {/* ── Generating banner — visible across the full page while loading ── */}
      {loading && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "var(--accent)", color: "#fff",
          padding: "10px 20px", textAlign: "center",
          fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          Generating your plan… this takes about 30 seconds
        </div>
      )}

      {/* ── Error banner — fixed at top so it's always visible ── */}
      {error && !loading && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "#dc2626", color: "#fff",
          padding: "10px 20px", textAlign: "center",
          fontSize: 13, fontWeight: 600, letterSpacing: 0.3,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
              borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12,
              fontFamily: "inherit", fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Connections panel — shown only when header CONNECTIONS button clicked ── */}
      {showConnections && (
        <div style={{ marginTop: 36, marginBottom: 24 }}>
          <ConnectionsPanel
            onOpenTPModal={() => setShowTPModal(true)}
            onConnectStrava={() => { window.location.href = "/api/strava/oauth-start"; }}
            onHide={() => setShowConnections(false)}
          />
        </div>
      )}


      {stale && plan && !loading && (
        <div style={{
          marginTop: 16, marginBottom: 12,
          padding: "14px 18px", borderRadius: 10,
          background: "rgba(47,143,224,0.07)", border: "1px solid rgba(47,143,224,0.25)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>📅 This week's plan has ended</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            The plan from {plan.weekOf} has ended — next week's plan is generated automatically; check back shortly.
          </div>
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
            <div style={{ marginTop: 32, marginBottom: 14 }}>
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

          <div className="stat-grid workout-grid" style={{ marginTop: 32 }}>
            {displayWorkouts.map((w, i) => {
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

                // The thumbnail graph must reflect what was actually ridden,
                // not whatever the plan's slot for this date currently says.
                // If the plan gets regenerated *after* a day is already
                // completed (e.g. a mid-week profile-driven regenerate), the
                // AI may synthesize a different placeholder workout for that
                // already-past day (see WEEKLY_PLAN_SYSTEM_PROMPT's handling
                // of a day matching riderNote/today) - real name "Sweet Spot
                // Classic" next to a flat Foundation Ride graph is exactly
                // that mismatch, and it reads as broken/mixed-up data even
                // though each field is individually "correct" for its own
                // source. Building the thumbnail from the real ride instead
                // (same synthesis the bonus-ride branch below already does)
                // guarantees the graph always agrees with the ride name
                // above it, regardless of what the current plan slot says.
                const completedThumbWorkout = {
                  title: actual.name as string,
                  type: (actual.sport as string) === "RUNNING" ? "Easy Run" : (w.type || "Endurance"),
                  durationMin: actual.durationInSeconds > 0
                    ? Math.round((actual.durationInSeconds as number) / 60)
                    : w.durationMin,
                  targetPowerPctFtp: w.targetPowerPctFtp || "65-75%",
                };

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
                      <WorkoutThumbnail
                        workout={completedThumbWorkout}
                        flush
                        realPowerSamples={actual.id ? realPowerByRideId.get(actual.id) : undefined}
                      />
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
                      {/* Post-workout feeling — WhatsApp-style mini chat */}
                      {w.date && (() => {
                        const saved = feelingScores[w.date];
                        const submitting = feelingSubmitting.has(w.date);
                        const SCORES = [
                          { emoji: "💀", label: "Couldn't finish" },
                          { emoji: "😓", label: "Harder than expected" },
                          { emoji: "😐", label: "Got it done" },
                          { emoji: "💪", label: "Strong & controlled" },
                          { emoji: "🚀", label: "Felt great!" },
                        ];
                        const savedScore = saved ? SCORES[saved - 1] : null;
                        return (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                            {/* Coach prompt — left bubble */}
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>🏋️</div>
                              <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500 }}>
                                How did that feel?
                              </div>
                            </div>
                            {/* Rider reply — right side */}
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                              {savedScore ? (
                                <div style={{
                                  display: "flex", alignItems: "center", gap: 7,
                                  background: "rgba(47,143,224,0.13)",
                                  border: "1px solid rgba(47,143,224,0.25)",
                                  borderRadius: "10px 10px 3px 10px",
                                  padding: "6px 11px",
                                }}>
                                  <span style={{ fontSize: 17 }}>{savedScore.emoji}</span>
                                  <div>
                                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>{savedScore.label}</div>
                                    <div style={{ fontSize: 9.5, color: "var(--muted)" }}>✓ Saved</div>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 5 }}>
                                  {SCORES.map((s, idx) => (
                                    <button
                                      key={idx + 1}
                                      type="button"
                                      title={s.label}
                                      onClick={() => !submitting && submitFeelingScore(w.date!, w.title || (actual?.name as string) || "", w.type, idx + 1)}
                                      style={{
                                        width: 34, height: 30,
                                        border: "1px solid var(--border)",
                                        borderRadius: 7,
                                        background: "transparent",
                                        cursor: submitting ? "default" : "pointer",
                                        fontSize: 15, lineHeight: 1,
                                        opacity: submitting ? 0.4 : 1,
                                        transition: "transform 0.1s",
                                      }}
                                    >{s.emoji}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* "Planned" footnote — bottom of card */}
                      <div style={{
                        marginTop: 10, paddingTop: 8,
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
                      <WorkoutThumbnail
                        workout={bonusWorkout}
                        flush
                        realPowerSamples={actual.id ? realPowerByRideId.get(actual.id) : undefined}
                      />
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
              // MyWhoosh-style card: full-bleed thumbnail on top (the power
              // profile is the dominant visual element), centered bold
              // title, a clean duration/TSS/IF line, then description and
              // sync/download actions below.
              const ifTss = w.structure && w.structure.length > 0
                ? computeIfTss(structureToBlocks(w.structure))
                : null;
              const accentColor = ifTss ? zoneForPowerFraction(ifTss.intensityFactor).color : TYPE_BAR_COLOR[colorForType(w.type)];
              const rest = isRestDay(w.type);
              return (
                <div
                  className="stat-card workout-card-elevated"
                  key={i}
                  style={{
                    display: "flex", flexDirection: "column",
                    background: "#fff",
                    border: rest ? "1px dashed #cbd5e1" : "none",
                    // A real border (not a child div) paints at the box's own
                    // edge regardless of this element's overflow:hidden -
                    // a separate inner div was getting clipped/reduced to a
                    // sliver on some cards, this can't be.
                    borderTop: rest ? undefined : `5px solid ${accentColor}`,
                    borderRadius: 20,
                    overflow: "hidden",
                    boxShadow: rest ? "none" : "0 4px 24px rgba(0,0,0,0.08)",
                    ["--card-accent" as string]: accentColor,
                  }}
                >
                  {!rest && (
                    <WorkoutThumbnail workout={w} flush height={160} hideFooter lightGraph />
                  )}
                  <div
                    className="workout-card-body"
                    style={{
                      display: "flex", flexDirection: "column", flex: 1,
                      padding: rest ? "40px 20px" : "20px 24px 24px",
                      justifyContent: rest ? "center" : undefined,
                      alignItems: rest ? "center" : undefined,
                    }}
                  >
                    {rest && <div style={{ fontSize: 40, marginBottom: 10 }}>🛌</div>}
                    <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 600, textAlign: "center", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                      {w.day}{w.date ? ` · ${w.date}` : ""}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", textAlign: "center", lineHeight: 1.25, marginTop: 6 }}>
                      {w.title}
                    </div>

                    {!rest && (
                      <div style={{
                        display: "flex", justifyContent: "center", gap: 18,
                        marginTop: 14, paddingTop: 14, paddingBottom: 14,
                        borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9",
                        fontSize: 15, fontWeight: 700, color: "#64748b",
                      }}>
                        <span>{w.durationMin} min</span>
                        {ifTss && <span>TSS {ifTss.tss}</span>}
                        {ifTss && <span>IF {ifTss.intensityFactor.toFixed(2)}</span>}
                        {w.targetPowerPctFtp && <span style={{ fontWeight: 500 }}>{w.targetPowerPctFtp} FTP</span>}
                      </div>
                    )}

                    {!isRestDay(w.type) && (() => {
                      return (
                        <div style={{ marginTop: "auto", paddingTop: 18 }}>
                          {/* Reflects the server's ACTUAL reported result from the last
                              generate call (see app/api/ai/weekly-plan/route.ts's
                              intervalsSync response field), not just "is ICU connected" -
                              a connected-but-failed push must never look identical to a
                              connected-and-succeeded one. lastIntervalsSync is null until
                              a generate response has actually arrived this session. */}
                          {intervalsConnected && lastIntervalsSync && lastIntervalsSync.errors.length === 0 && (
                            <div style={{ marginBottom: 8, textAlign: "center", fontSize: 11, fontWeight: 600 }}>
                              <span style={{ color: "var(--accent)" }}>
                                ✓ Synced → Intervals.icu → Zwift ({lastIntervalsSync.pushed} pushed{lastIntervalsSync.deleted > 0 ? `, ${lastIntervalsSync.deleted} duplicates removed` : ""})
                              </span>
                            </div>
                          )}
                          {intervalsConnected && lastIntervalsSync && lastIntervalsSync.errors.length > 0 && (
                            <div style={{ marginBottom: 8, textAlign: "center", fontSize: 11, fontWeight: 600 }}>
                              <span style={{ color: "var(--danger)" }} title={lastIntervalsSync.errors.join("; ")}>
                                ⚠ Synced with {lastIntervalsSync.errors.length} error(s) — hover for detail
                              </span>
                            </div>
                          )}
                          {intervalsConnected && !lastIntervalsSync && (
                            <div style={{ marginBottom: 8, textAlign: "center", fontSize: 10, color: "#64748b", opacity: 0.8 }}>
                              Connected — syncs automatically when a plan is generated
                            </div>
                          )}

                          {/* Download .zwo — always available as fallback */}
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ width: "auto", padding: "8px 16px", fontSize: 12, fontWeight: 600 }}
                              onClick={() => handleDownloadZwo(w)}
                            >
                              ↓ Download ZWO
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Session chat feedback ──────────────────────────────────────────
              Past completed sessions appear as a WhatsApp-style coach↔rider
              exchange. The coach bubble shows the planned workout + prescription;
              the rider replies with a 1-5 feeling score. These scores feed the
              rider fingerprint in KV, which the AI injects into future coaching
              prompts so the plan can actually learn this rider over time.
           ─────────────────────────────────────────────────────────────────── */}
          {plan && (() => {
            const today = todayIso();
            const pastCompleted = plan.workouts
              .filter(w => w.date && w.date < today && !isRestDay(w.type) && weekActivities.has(w.date))
              .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
            if (pastCompleted.length === 0) return null;

            const SCORES = [
              { emoji: "💀", label: "Couldn't finish" },
              { emoji: "😓", label: "Harder than expected" },
              { emoji: "😐", label: "Got it done" },
              { emoji: "💪", label: "Strong & controlled" },
              { emoji: "🚀", label: "Felt great!" },
            ];

            return (
              <div style={{ marginTop: 28 }}>
                {/* Chat header */}
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 18, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>🏋️</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Your Coach</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {pastCompleted.filter(w => w.date && feelingScores[w.date]).length}/{pastCompleted.length} sessions rated
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                  {pastCompleted.map((w) => {
                    const saved = w.date ? feelingScores[w.date] : undefined;
                    const submitting = w.date ? feelingSubmitting.has(w.date) : false;
                    const savedScore = saved ? SCORES[saved - 1] : null;

                    return (
                      <div key={w.date}>
                        {/* ── Coach bubble (left) ── */}
                        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "var(--accent)", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, marginTop: 2,
                          }}>🏋️</div>
                          <div style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid var(--border)",
                            borderRadius: "3px 12px 12px 12px",
                            padding: "11px 14px",
                            maxWidth: "85%",
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginBottom: 2 }}>
                              {w.title}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: w.description ? 8 : 0 }}>
                              {w.day} · {w.date} · {w.durationMin} min
                            </div>
                            {w.description && (
                              <div style={{ fontSize: 12, color: "var(--text)", opacity: 0.8, lineHeight: 1.55, fontStyle: "italic" }}>
                                &ldquo;{w.description}&rdquo;
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 9, fontWeight: 600 }}>
                              How did it feel?
                            </div>
                          </div>
                        </div>

                        {/* ── Rider reply (right) ── */}
                        <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 4 }}>
                          {savedScore ? (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 9,
                              background: "rgba(47,143,224,0.14)",
                              border: "1px solid rgba(47,143,224,0.28)",
                              borderRadius: "12px 12px 3px 12px",
                              padding: "9px 14px",
                            }}>
                              <span style={{ fontSize: 22 }}>{savedScore.emoji}</span>
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{savedScore.label}</div>
                                <div style={{ fontSize: 10, color: "var(--muted)" }}>✓ Your coach will remember this</div>
                              </div>
                            </div>
                          ) : (
                            <div style={{
                              background: "rgba(47,143,224,0.06)",
                              border: "1px solid var(--border)",
                              borderRadius: "12px 12px 3px 12px",
                              padding: "9px 12px",
                            }}>
                              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 7, textAlign: "right" }}>
                                Tap to reply
                              </div>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                {SCORES.map((s, idx) => (
                                  <button
                                    key={idx + 1}
                                    type="button"
                                    title={s.label}
                                    onClick={() => !submitting && w.date && submitFeelingScore(w.date, w.title || "", w.type, idx + 1)}
                                    style={{
                                      width: 38, height: 34,
                                      border: "1px solid var(--border)",
                                      borderRadius: 9,
                                      background: "transparent",
                                      cursor: submitting ? "default" : "pointer",
                                      fontSize: 17, lineHeight: 1,
                                      opacity: submitting ? 0.4 : 1,
                                      transition: "transform 0.1s, opacity 0.15s",
                                    }}
                                  >{s.emoji}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}


          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>
            {intervalsConnected
              ? <>
                  <strong style={{ opacity: 0.8, color: "var(--accent)" }}>Intervals.icu connected</strong> — workouts push here automatically and relay onward to Zwift (and Garmin, via the sync you set up once in your own Intervals.icu account). Fall back to{" "}
                  <strong style={{ opacity: 0.8 }}>↓ Download .zwo</strong> at any time.
                </>
              : <>
                  <strong style={{ opacity: 0.8 }}>Connect Intervals.icu</strong> (above) for the easiest path — push workouts straight to your Zwift (and Garmin) calendar automatically. Or use{" "}
                  <strong style={{ opacity: 0.8 }}>↓ Download .zwo</strong> and drop the file into{" "}
                  <code style={{ fontSize: 10 }}>Documents/Zwift/Workouts/&lt;your Zwift ID&gt;/</code>,
                  then open Zwift once.
                </>
            }
          </div>
        </>
      )}

      {/* ── Today's Note, relocated to the bottom of the page as "Talk to
          your coach" - a natural conversation starter after the rider has
          seen the week's cards, rather than the first thing on the page.
          Training Profile access moved to the header nav chip only
          (TrainingProfileNavChip in page.tsx); the old 3rd "Weekly training
          plan" info card's phase caption is folded in below instead of
          taking its own card, per the Coach/Stats page split. ──────────── */}
      <div id="todays-note" className="stat-card todays-note-card" style={{ marginTop: 48 }}>
        <div className="section-title" style={{ margin: "0 0 4px 0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Talk to your coach
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
          {riderNote
            ? <span style={{ color: "var(--accent)", fontWeight: 500 }}>✓ {riderNote.length > 80 ? riderNote.slice(0, 80) + "…" : riderNote}</span>
            : "How are you feeling today? Any notes before tomorrow's session?"}
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
              className="header-card-btn"
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
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 6,
                border: noteOpen ? "1.5px solid var(--accent)" : "1.5px solid #16a34a",
                background: noteOpen
                  ? (riderNote.trim() ? "rgba(47,143,224,0.12)" : "rgba(47,143,224,0.07)")
                  : "#16a34a",
                color: noteOpen ? "var(--accent)" : "#fff",
                fontSize: 12, fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.5 : 1,
                fontFamily: "inherit",
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

          {/* Phase caption - folded in from the old standalone "Weekly
              training plan" info card, which no longer gets its own slot
              now that this section is full-width rather than 1-of-3 cards. */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", textAlign: "center", fontSize: 12, color: "var(--muted)" }}>
            {cycleInfo
              ? (cycleInfo.phase === "Taper" || cycleInfo.phase === "RaceWeek") && cycleInfo.weeksToEvent != null
                ? `${cycleInfo.phase === "RaceWeek" ? "Race week" : "Taper"} · ${cycleInfo.weeksToEvent === 0 ? "event this week" : `${cycleInfo.weeksToEvent} week${cycleInfo.weeksToEvent === 1 ? "" : "s"} to your event`}`
                : `${cycleInfo.phase} phase · Week ${cycleInfo.weekInMesocycle} of 4`
              : "Seven structured sessions, built fresh each week"}
            {" — generated automatically every Sunday night, adjusted by Today's note above."}
          </div>
      </div>{/* end todays-note-card */}

      {/* Training profile - settings/config, not a stat, so it stays on the
          Coach page per the Coach/Stats split, but unobtrusively at the very
          bottom rather than competing with Today's Note/workouts for
          attention. TrainingProfileNavChip (header) targets this id and
          dispatches the open event TrainingProfileCard listens for. */}
      <div id="training-profile" style={{ marginTop: 48 }}>
        <TrainingProfileCard />
      </div>
    </div>
  );
}
