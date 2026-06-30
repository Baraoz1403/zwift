"use client";

import { useEffect, useState } from "react";
import {
  type RiderTrainingProfile,
  type TrainingGoal,
  type SessionLength,
  type Sport,
  type DaysRange,
  GOAL_LABELS,
  SESSION_LENGTH_LABELS,
  SPORT_LABELS,
  DAYS_RANGE_LABELS,
} from "@/lib/rider-profile";
import { getPhaseForWeekIndex } from "@/lib/periodization";

const PROFILE_KEY = "zwiftRiderProfile";
const CYCLE_KEY   = "zwiftMacroCycle";

function loadProfile(): RiderTrainingProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as RiderTrainingProfile;
    // migrate legacy single-value fields
    if (!p.goals) p.goals = p.goal ? [p.goal] : ["fitness"];
    if (!p.sports) p.sports = p.sport ? [p.sport] : ["cycling"];
    if (!p.daysRange) p.daysRange = "3-4";
    return p;
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
  goals: ["fitness"],
  daysRange: "3-4",
  sessionLength: "60",
  sports: ["cycling"],
};

function Toggle<T extends string>({
  options, labels, selected, onChange,
}: {
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  function toggle(val: T) {
    if (selected.includes(val)) {
      if (selected.length === 1) return; // keep at least one
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => toggle(o)}
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: selected.includes(o) ? "2px solid var(--accent)" : "1px solid var(--border)",
            background: selected.includes(o) ? "rgba(255,102,0,0.08)" : "var(--panel-solid)",
            color: selected.includes(o) ? "var(--accent)" : "var(--muted)",
            fontWeight: selected.includes(o) ? 700 : 400,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

export default function TrainingProfileCard() {
  const [profile, setProfile]       = useState<RiderTrainingProfile | null>(null);
  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState<RiderTrainingProfile>(DEFAULT);
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    if (!p) setEditing(true);
    else setDraft(p);
    setPhaseLabel(loadPhaseLabel());
  }, []);

  function handleSave() {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
  }

  // ── Collapsed ──────────────────────────────────────────────────────────────
  if (!editing && profile) {
    return (
      <div className="stat-card" style={{ marginTop: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>
              {(profile.goals ?? [profile.goal ?? "fitness"]).map(g => GOAL_LABELS[g]).join(" · ")}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {DAYS_RANGE_LABELS[profile.daysRange ?? "3-4"]}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              {SESSION_LENGTH_LABELS[profile.sessionLength]}
            </span>
            {(profile.sports ?? [profile.sport ?? "cycling"]).filter(s => s !== "cycling").length > 0 && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {(profile.sports ?? []).map(s => SPORT_LABELS[s]).join(" + ")}
              </span>
            )}
            {profile.ageYears && (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Age {profile.ageYears}</span>
            )}
            {profile.eventDate && (
              <span style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>
                Event: {new Date(profile.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
            {phaseLabel && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "rgba(20,23,26,0.06)", borderRadius: 999, padding: "2px 9px" }}>
                {phaseLabel}
              </span>
            )}
            {profile.notes && (
              <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                &ldquo;{profile.notes}&rdquo;
              </span>
            )}
          </div>
          <button type="button" className="btn btn-secondary" style={{ width: "auto", padding: "5px 14px", fontSize: 12.5 }} onClick={() => { setDraft(profile); setEditing(true); }}>
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
          {profile ? "Edit your training profile" : "Welcome — let\'s personalise your plan"}
        </div>
        {!profile && (
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Tell me about your goals and schedule so I can build a training plan that actually fits your life.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Goals */}
        <div className="field" style={{ margin: 0 }}>
          <label>Training goals (pick one or more)</label>
          <Toggle<TrainingGoal>
            options={["fitness","ftp","weight","event","fun"]}
            labels={GOAL_LABELS}
            selected={draft.goals ?? [draft.goal ?? "fitness"]}
            onChange={v => setDraft(d => ({ ...d, goals: v }))}
          />
        </div>

        {/* Disciplines */}
        <div className="field" style={{ margin: 0 }}>
          <label>Primary discipline (pick one or more)</label>
          <Toggle<Sport>
            options={["cycling","running","both"]}
            labels={SPORT_LABELS}
            selected={draft.sports ?? [draft.sport ?? "cycling"]}
            onChange={v => setDraft(d => ({ ...d, sports: v }))}
          />
        </div>

        {/* Row: days range + session length + age */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Days per week</label>
            <select
              className="select"
              style={{ width: "100%" }}
              value={draft.daysRange ?? "3-4"}
              onChange={e => setDraft(d => ({ ...d, daysRange: e.target.value as DaysRange }))}
            >
              {(["1-2","2-3","3-4","4-5","5-6"] as DaysRange[]).map(r => (
                <option key={r} value={r}>{DAYS_RANGE_LABELS[r]}</option>
              ))}
            </select>
          </div>

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

          <div className="field" style={{ margin: 0 }}>
            <label>Age (optional)</label>
            <input
              type="number" min={10} max={100} placeholder="e.g. 42"
              style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}
              value={draft.ageYears ?? ""}
              onChange={e => setDraft(d => ({ ...d, ageYears: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
        </div>

        {/* Event date */}
        {(draft.goals ?? []).includes("event") && (
          <div className="field" style={{ margin: 0 }}>
            <label>Target event date</label>
            <input
              type="date"
              style={{ width: "100%", maxWidth: 260, padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13 }}
              value={draft.eventDate ?? ""}
              onChange={e => setDraft(d => ({ ...d, eventDate: e.target.value || undefined }))}
            />
          </div>
        )}

        {/* Notes */}
        <div className="field" style={{ margin: 0 }}>
          <label>Anything else to know? (optional)</label>
          <textarea
            rows={2}
            placeholder='e.g. "Can only ride mornings", "Bad knee — no high-cadence sprints"'
            style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
            value={draft.notes ?? ""}
            onChange={e => setDraft(d => ({ ...d, notes: e.target.value || undefined }))}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button type="button" className="btn" style={{ width: "auto", padding: "8px 22px" }} onClick={handleSave}>
          Save profile
        </button>
        {profile && (
          <button type="button" className="btn btn-secondary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
