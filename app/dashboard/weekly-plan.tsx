"use client";

import { useEffect, useState } from "react";
import { IconCalendar, IconBolt } from "./icons";
import { generateZwoXml, zwoFileName, isRestDay } from "@/lib/zwo";

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

// The app has no database (every other feature here is either live Zwift
// data or a per-process in-memory cache), so "upload the plan to the
// account on the site" - the actual ask - means persisting it somewhere
// that survives reloads without needing a backend yet. localStorage, keyed
// per browser, does exactly that: once generated, the plan is still there
// next time this rider opens the dashboard on this device, until they
// generate a new one or a new week starts.
const STORAGE_KEY = "zwiftWeeklyPlan";
// Zwift's API has no birthdate field, so age (used to lean toward extra
// recovery for older riders) only ever comes from the rider typing it in
// here - stored the same pragmatic way as the plan itself, in localStorage.
const AGE_STORAGE_KEY = "zwiftRiderAge";

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
  const [age, setAge] = useState<string>("");

  useEffect(() => {
    const cached = loadCachedPlan();
    if (cached) {
      setPlan(cached);
      setStale(cached.weekOf !== currentWeekOf());
    }
    try {
      const savedAge = window.localStorage.getItem(AGE_STORAGE_KEY);
      if (savedAge) setAge(savedAge);
    } catch {
      // localStorage unavailable - age input just starts blank.
    }
  }, []);

  function handleAgeChange(value: string) {
    setAge(value);
    try {
      if (value) window.localStorage.setItem(AGE_STORAGE_KEY, value);
      else window.localStorage.removeItem(AGE_STORAGE_KEY);
    } catch {
      // Non-fatal - age just won't persist across reloads in this case.
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const ageYears = age ? Number(age) : undefined;
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageYears }),
      });
      const data = await res.json();
      if (data.ok) {
        setPlan(data.plan);
        setStale(false);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data.plan));
        } catch {
          // localStorage can fail (private mode, quota) - the plan still
          // renders for this session even if it won't persist across reloads.
        }
      } else {
        setError(data.error ?? "Could not generate a weekly plan.");
      }
    } catch {
      setError("Network error reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  // Turns one of the AI's planned sessions into a real, structured Zwift
  // workout file (.zwo) - warmup ramp, the actual interval/steady-state
  // blocks, cooldown ramp - instead of just a text description, and
  // downloads it named by the date it's planned for. A browser app can't
  // write straight into Zwift's local Workouts folder, so this is a
  // one-time manual drop-in until Zwift's Training Connections API is
  // approved (see the note below the plan).
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
        <h2 style={{ fontSize: 16, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <IconCalendar size={16} />
          Weekly training plan
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
            Age (optional)
            <input
              type="number"
              min={1}
              max={110}
              value={age}
              onChange={(e) => handleAgeChange(e.target.value)}
              placeholder="years"
              style={{ width: 56, padding: "4px 6px", fontSize: 12.5 }}
            />
          </label>
          <button
            type="button"
            className="btn"
            style={{ width: "auto", padding: "8px 18px" }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading
              ? "Building your plan..."
              : plan
                ? "Regenerate this week's plan"
                : "Generate this week's plan"}
          </button>
        </div>
      </div>

      {stale && plan && !loading && (
        <div className="notice" style={{ marginTop: 4, marginBottom: 12 }}>
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
            <div
              className="notice"
              style={{ marginTop: 4, marginBottom: 14, color: "var(--text)", lineHeight: 1.6 }}
            >
              {plan.summary}
            </div>
          )}

          <div className="stat-grid stat-grid-compact">
            {plan.workouts.map((w, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-card-head">
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
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, lineHeight: 1.5 }}>
                  {w.description}
                </div>
                {!isRestDay(w.type) && (
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "auto", padding: "5px 12px", fontSize: 11.5, marginTop: 10 }}
                    onClick={() => handleDownloadZwo(w)}
                  >
                    Download .zwo
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>
            Each session above can be downloaded as a real Zwift workout file (.zwo) - drop
            it into your Documents/Zwift/Workouts/&lt;your Zwift ID&gt; folder and it shows
            up in Zwift&apos;s own workout list, ready to ride. This plan itself is saved in
            your browser, not pushed to your Zwift account automatically yet - true
            auto-sync needs Zwift&apos;s official Training Connections API, which is still
            pending their approval.
          </div>
        </>
      )}
    </div>
  );
}
