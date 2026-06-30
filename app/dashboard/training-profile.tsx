"use client";

import { useEffect, useState } from "react";
import {
  type RiderTrainingProfile,
  type TrainingGoal,
  type SessionLength,
  type Sport,
  GOAL_LABELS,
  SESSION_LENGTH_LABELS,
  SPORT_LABELS,
} from "@/lib/rider-profile";
import { getPhaseForWeekIndex } from "@/lib/periodization";

const PROFILE_KEY = "zwiftRiderProfile";
const CYCLE_KEY   = "zwiftMacroCycle";

function loadProfile(): RiderTrainingProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as RiderTrainingProfile) : null;
  } catch { return null; }
}

function saveProfile(p: RiderTrainingProfile) {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}

function loadPhaseLabel(): string | null {
  try {
    const raw = window.localStorage.getItem(CYCLE_KEY);
    if (!raw) return null;
    const cycle = JSON.parse(raw) as { weekIndex: number };
    const { phase, weekInMesocycle } = getPhaseForWeekIndex(cycle.weekIndex);
    return `${phase} · week ${weekInMesocycle}/4`;
  } catch { return null; }
}

const DEFAULT: RiderTrainingProfile = {
  goal: "fitness",
  daysPerWeek: 3,
  sessionLength: "60",
  sport: "cycling",
};

export default function TrainingProfileCard() {
  const [profile, setProfile]   = useState<RiderTrainingProfile | null>(null);
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState<RiderTrainingProfile>(DEFAULT);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (!p) setEditing(true);          // first visit → open form immediately
    else setDraft(p);
    setPhaseLabel(loadPhaseLabel());
  }, []);

  function handleSave() {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
  }

  function handleEdit() {
    setDraft(profile ?? DEFAULT);
    setEditing(true);
  }

  // ── Collapsed summary ──────────────────────────────────────────────────────
  if (!editing && profile) {
    return (
      <div
        className="stat-card"
        style={{ marginTop: 20, padding: "16px 20px" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          {/* Left: goal + availability */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>
              {GOAL_LABELS[profile.goal]}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {profile.daysPerWeek} days/week
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {SESSION_LENGTH_LABELS[profile.sessionLength]}
            </span>
            {profile.sport && profile.sport !== "cycling" && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {SPORT_LABELS[profile.sport]}
              </span>
            )}
            {profile.ageYears && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Age {profile.ageYears}
              </span>
            )}
            {profile.eventDate && (
              <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>
                Event: {new Date(profile.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            {phaseLabel && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--muted)",
                  background: "rgba(20,23,26,0.06)",
                  borderRadius: 999,
                  padding: "2px 9px",
                }}
              >
                {phaseLabel}
              </span>
            )}
            {profile.notes && (
              <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                &ldquo;{profile.notes}&rdquo;
              </span>
            )}
          </div>
          {/* Right: edit button */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "5px 14px", fontSize: 12.5 }}
            onClick={handleEdit}
          >
            Edit profile
          </button>
        </div>
      </div>
    );
  }

  // ── Edit form ──────────────────────────────────────────────────────────────
  return (
    <div className="stat-card" style={{ marginTop: 20, padding: "20px 24px" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
          {profile ? "Edit your training profile" : "Welcome — let's personalize your plan"}
        </div>
        {!profile && (
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Tell me about your goals and schedule so I can build a training plan that actually fits your life.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {/* Goal */}
        <div className="field" style={{ margin: 0 }}>
          <label>Main training goal</label>
          <select
            className="select"
            style={{ width: "100%" }}
            value={draft.goal}
            onChange={e => setDraft(d => ({ ...d, goal: e.target.value as TrainingGoal }))}
          >
            {(Object.entries(GOAL_LABELS) as [TrainingGoal, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Days per week */}
        <div className="field" style={{ margin: 0 }}>
          <label>Days available per week</label>
          <input
            type="number"
            min={1}
            max={7}
            className="field"
            style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, margin: 0 }}
            value={draft.daysPerWeek}
            onChange={e => setDraft(d => ({ ...d, daysPerWeek: Math.max(1, Math.min(7, Number(e.target.value))) }))}
          />
        </div>

        {/* Session length */}
        <div className="field" style={{ margin: 0 }}>
          <label>Typical session length</label>
          <select
            className="select"
            style={{ width: "100%" }}
            value={draft.sessionLength}
            onChange={e => setDraft(d => ({ ...d, sessionLength: e.target.value as SessionLength }))}
          >
            {(Object.entries(SESSION_LENGTH_LABELS) as [SessionLength, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Sport */}
        <div className="field" style={{ margin: 0 }}>
          <label>Primary discipline</label>
          <select
            className="select"
            style={{ width: "100%" }}
            value={draft.sport ?? "cycling"}
            onChange={e => setDraft(d => ({ ...d, sport: e.target.value as Sport }))}
          >
            {(Object.entries(SPORT_LABELS) as [Sport, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Event date */}
        <div className="field" style={{ margin: 0 }}>
          <label>Target event date (optional)</label>
          <input
            type="date"
            style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}
            value={draft.eventDate ?? ""}
            onChange={e => setDraft(d => ({ ...d, eventDate: e.target.value || undefined }))}
          />
        </div>

        {/* Age */}
        <div className="field" style={{ margin: 0 }}>
          <label>Age (optional)</label>
          <input
            type="number"
            min={10}
            max={100}
            placeholder="e.g. 42"
            style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}
            value={draft.ageYears ?? ""}
            onChange={e => setDraft(d => ({ ...d, ageYears: e.target.value ? Number(e.target.value) : undefined }))}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
        <label>Anything else to know? (optional)</label>
        <textarea
          rows={2}
          placeholder='e.g. "Can only ride mornings", "Bad knee — no high-cadence sprints"'
          style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
          value={draft.notes ?? ""}
          onChange={e => setDraft(d => ({ ...d, notes: e.target.value || undefined }))}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", padding: "8px 22px" }}
          onClick={handleSave}
        >
          Save profile
        </button>
        {profile && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto", padding: "8px 16px" }}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
