"use client";

import { useEffect, useState, useCallback } from "react";
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
    if (!p.goals)    p.goals    = p.goal  ? [p.goal]  : ["fitness"];
    if (!p.sports)   p.sports   = p.sport ? [p.sport] : ["cycling"];
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

const GOAL_ICONS: Record<TrainingGoal, React.ReactNode> = {
  fitness: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  ftp: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  weight: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
    </svg>
  ),
  event: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  ),
  fun: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  ),
};

const SPORT_ICONS: Record<Sport, React.ReactNode> = {
  cycling: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 0 0-1-1h-1l-3.2 8H15"/><path d="m8 12 2.7-6.8a1 1 0 0 1 .9-.7h.8"/>
      <path d="M15 6h2l2.4 6"/>
    </svg>
  ),
  running: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="4" r="2"/>
      <path d="M6.5 21l2-8 2.5 2.5 2-4.5 3 5.5"/>
      <path d="m11 13-1.5 7.5L13 19l2 2 1.5-7"/>
      <path d="m15 7-3 2-2-2 1.5-3"/>
    </svg>
  ),
  both: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3L4 7l4 4"/><path d="M4 7h10a4 4 0 0 1 0 8H8"/>
      <path d="m16 21 4-4-4-4"/><path d="M20 17H10a4 4 0 0 1 0-8h6"/>
    </svg>
  ),
};

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SelectCards<T extends string>({
  options, labels, icons, selected, onChange, columns,
}: {
  options: T[];
  labels: Record<T, string>;
  icons: Record<T, React.ReactNode>;
  selected: T[];
  onChange: (v: T[]) => void;
  columns?: number;
}) {
  function toggle(val: T) {
    if (selected.includes(val)) {
      if (selected.length === 1) return;
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  }
  const colStyle = columns ? `repeat(${columns}, 1fr)` : "repeat(auto-fill, minmax(130px, 1fr))";
  return (
    <div style={{ display: "grid", gridTemplateColumns: colStyle, gap: 8 }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)} style={{
            position: "relative", padding: "12px 14px 11px", borderRadius: 6,
            border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
            background: active ? "rgba(47,143,224,0.07)" : "var(--panel-solid)",
            cursor: "pointer", textAlign: "left",
            transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
            boxShadow: active ? "0 0 0 3px rgba(47,143,224,0.12)" : "none",
          }}>
            {active && (
              <div style={{
                position: "absolute", top: 8, right: 8, width: 18, height: 18,
                borderRadius: "50%", background: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <CheckIcon />
              </div>
            )}
            <div style={{ marginBottom: 7, opacity: active ? 1 : 0.5, transition: "opacity 0.15s" }}>
              {icons[o]}
            </div>
            <div style={{
              fontSize: 12, fontWeight: active ? 700 : 500, lineHeight: 1.3,
              color: active ? "var(--accent)" : "var(--text)", transition: "color 0.15s",
            }}>
              {labels[o]}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color: "var(--muted)", marginBottom: 10,
    }}>
      {children}
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

  const startEdit = useCallback(() => {
    setDraft(profile ?? DEFAULT);
    setEditing(true);
  }, [profile]);

  function handleSave() {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
  }

  return (
    <div className="section" style={{ marginTop: 36 }}>

      {/* ── Profile card: thin blue top bar + white bg ─────────────────── */}
      {!editing && (
        <div className="stat-card" style={{
          padding: "20px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}>
          {/* Left: eyebrow + headline + sub */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "var(--accent)", marginBottom: 5,
            }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M6 1L7.3 4.4H11L8.3 6.5L9.3 10L6 8.1L2.7 10L3.7 6.5L1 4.4H4.7L6 1Z"/>
              </svg>
              Personalised AI coaching
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: "var(--text)",
              lineHeight: 1.25, letterSpacing: "-0.3px", marginBottom: 5,
            }}>
              {profile
                ? "Your coach knows you. Every plan is built around you."
                : "The more your coach knows you, the better your plan."}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              {profile
                ? "Goals, schedule, and discipline — all factored in every week."
                : "4 quick questions. A plan that fits your life, goals, and schedule."}
            </div>
          </div>

          {/* Right: CTA button */}
          <button type="button" onClick={startEdit} style={{
            flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 6, border: "none",
            background: "var(--accent)", color: "#fff",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap",
          }}>
            {profile ? "Update my profile" : "Set up my profile"}
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Edit form — only when editing ───────────────────────────────── */}
      {editing && (
        <div className="stat-card" style={{ marginTop: 14, padding: "24px 28px" }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 4 }}>
              {profile ? "Edit your training profile" : "Welcome — let's personalise your plan"}
            </div>
            {!profile && (
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                Tell me about your goals and schedule so I can build a training plan that fits your life.
              </div>
            )}
          </div>

          <Divider />

          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 20 }}>
            <div>
              <FieldLabel>Training goals — pick one or more</FieldLabel>
              <SelectCards<TrainingGoal>
                options={["fitness","ftp","weight","event","fun"]}
                labels={GOAL_LABELS} icons={GOAL_ICONS}
                selected={draft.goals ?? [draft.goal ?? "fitness"]}
                onChange={v => setDraft(d => ({ ...d, goals: v }))}
              />
            </div>

            <Divider />

            <div>
              <FieldLabel>Primary discipline</FieldLabel>
              <SelectCards<Sport>
                options={["cycling","running","both"]}
                labels={SPORT_LABELS} icons={SPORT_ICONS}
                selected={draft.sports ?? [draft.sport ?? "cycling"]}
                onChange={v => {
                  let sports = v as Sport[];
                  const prev = draft.sports ?? ["cycling"];
                  const added = sports.filter(s => !prev.includes(s));
                  if (added.includes("both")) {
                    // clicked "Cycling & Running" → only that
                    sports = ["both"];
                  } else if (prev.includes("both") && added.length > 0) {
                    // clicked individual while "both" was active → switch to that individual
                    sports = sports.filter(s => s !== "both");
                  } else if (sports.includes("cycling") && sports.includes("running")) {
                    // both individuals selected → collapse to "both"
                    sports = ["both"];
                  }
                  setDraft(d => ({ ...d, sports }));
                }}
                columns={3}
              />
            </div>

            <Divider />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
              <div>
                <FieldLabel>Days per week</FieldLabel>
                <select className="select" style={{ width: "100%" }}
                  value={draft.daysRange ?? "3-4"}
                  onChange={e => setDraft(d => ({ ...d, daysRange: e.target.value as DaysRange }))}>
                  {(["1-2","2-3","3-4","4-5","5-6"] as DaysRange[]).map(r => (
                    <option key={r} value={r}>{DAYS_RANGE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Session length</FieldLabel>
                <select className="select" style={{ width: "100%" }}
                  value={draft.sessionLength}
                  onChange={e => setDraft(d => ({ ...d, sessionLength: e.target.value as SessionLength }))}>
                  {(Object.entries(SESSION_LENGTH_LABELS) as [SessionLength, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Age (optional)</FieldLabel>
                <input type="number" min={10} max={100} placeholder="e.g. 42"
                  style={{ width: "100%", padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
                  value={draft.ageYears ?? ""}
                  onChange={e => setDraft(d => ({ ...d, ageYears: e.target.value ? Number(e.target.value) : undefined }))}
                />
              </div>
            </div>

            {(draft.goals ?? []).includes("event") && (
              <div>
                <FieldLabel>Target event date</FieldLabel>
                <input type="date"
                  style={{ width: "100%", maxWidth: 260, padding: "8px 10px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
                  value={draft.eventDate ?? ""}
                  onChange={e => setDraft(d => ({ ...d, eventDate: e.target.value || undefined }))}
                />
              </div>
            )}

            <div>
              <FieldLabel>Anything else? (optional)</FieldLabel>
              <textarea rows={2}
                placeholder='e.g. "Can only ride mornings, bad knee — avoid high-cadence sprints"'
                style={{ width: "100%", padding: "10px 12px", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, outline: "none" }}
                value={draft.notes ?? ""}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value || undefined }))}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <button type="button" className="btn" style={{ width: "auto", padding: "9px 28px" }} onClick={handleSave}>
              Save profile
            </button>
            {profile && (
              <button type="button" className="btn btn-secondary" style={{ width: "auto", padding: "9px 18px" }} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
