"use client";

import { useEffect, useState, useCallback } from "react";
import {
  type RiderTrainingProfile,
  type TrainingGoal,
  type SessionLength,
  type Sport,
  type DaysRange,
  type TrainingEnvironment,
  GOAL_LABELS,
  SESSION_LENGTH_LABELS,
  SPORT_LABELS,
  DAYS_RANGE_LABELS,
  ENVIRONMENT_LABELS,
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
    if (!p.environment) p.environment = "indoor";
    return p;
  } catch { return null; }
}

function saveProfile(p: RiderTrainingProfile) {
  try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
  // Tell WeeklyPlan a profile save just happened, so it can immediately
  // regenerate this week's plan with the new values instead of waiting for
  // some other unrelated trigger (a daily note, or the week rolling over)
  // to happen to pick it up. This is the other half of "the system should
  // understand new information and run a new plan immediately" - the daily
  // note side of that already worked (see handleGenerate in weekly-plan.tsx);
  // saving the profile itself never triggered anything on its own before.
  try { window.dispatchEvent(new CustomEvent("zwift:profile-saved")); } catch {}
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
  environment: "indoor",
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

const ENVIRONMENT_ICONS: Record<TrainingEnvironment, React.ReactNode> = {
  indoor: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>
    </svg>
  ),
  outdoor: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.9" y1="4.9" x2="7" y2="7"/><line x1="17" y1="17" x2="19.1" y2="19.1"/>
      <line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/>
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
    <div style={{ display: "grid", gridTemplateColumns: colStyle, gap: 10 }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)} style={{
            position: "relative", padding: "14px 14px 12px", borderRadius: 10,
            border: `1.5px solid ${active ? "rgba(47,143,224,0.7)" : "var(--border)"}`,
            background: active
              ? "linear-gradient(135deg, rgba(47,143,224,0.13) 0%, rgba(47,143,224,0.06) 100%)"
              : "#fff",
            cursor: "pointer", textAlign: "left",
            transition: "all 0.18s ease",
            boxShadow: active
              ? "0 0 0 3px rgba(47,143,224,0.15), 0 4px 12px rgba(47,143,224,0.12)"
              : "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {/* Active check badge */}
            {active && (
              <div style={{
                position: "absolute", top: 8, right: 8, width: 20, height: 20,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #2f8fe0, #1a6bb5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 6px rgba(47,143,224,0.4)",
              }}>
                <CheckIcon />
              </div>
            )}
            {/* Icon — colored when active */}
            <div style={{
              marginBottom: 8,
              color: active ? "#2f8fe0" : "var(--muted)",
              transition: "color 0.18s",
              filter: active ? "drop-shadow(0 0 4px rgba(47,143,224,0.4))" : "none",
            }}>
              {icons[o]}
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: active ? 700 : 500, lineHeight: 1.3,
              color: active ? "#1a6bb5" : "var(--text)", transition: "color 0.18s",
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
    if (p) setDraft(p);
    setPhaseLabel(loadPhaseLabel());

    // Reconcile against the server's copy (mirrored to KV whenever any
    // device saves a profile - see saveProfile below). Local storage alone
    // used to be the only source of truth, so an edit made on one device
    // (say, a phone) was invisible to another (the work computer) until
    // that second device happened to trigger its own regenerate - the same
    // "not actually web-synced" gap that affected the weekly plan itself
    // (see /api/ai/weekly-plan/state's doc comment). If the server has a
    // profile and it differs from what's cached locally, the server wins.
    (async () => {
      try {
        const r = await fetch("/api/ai/weekly-plan/state", { cache: "no-store" });
        const d = await r.json();
        if (!d.ok || !d.riderProfile) return;
        const server = d.riderProfile as RiderTrainingProfile;
        if (JSON.stringify(server) === JSON.stringify(p)) return; // already in sync
        try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(server)); } catch {}
        setProfile(server);
        setDraft(server);
        // A server-side profile means this isn't actually a new rider, even
        // if this particular device's local cache was empty - don't show
        // the "let's set up your profile" first-run wizard in that case.
        setEditing(false);
      } catch {
        // No server reachable - local cache (if any) stands as-is.
      }
    })();
  }, []);

  // Tell the wrapper div in weekly-plan.tsx when we're editing so it can
  // span the full grid width (grid-column only works on direct grid children;
  // our inner stat-card is one level too deep for gridColumn to take effect).
  useEffect(() => {
    const el = document.getElementById('training-profile');
    if (el) el.setAttribute('data-editing', String(editing));
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraft(profile ?? DEFAULT);
    setEditing(true);
  }, [profile]);

  // Nav chip event — open the edit form when the header button is clicked
  useEffect(() => {
    const open = () => startEdit();
    window.addEventListener("zwift:open-training-profile", open);
    return () => window.removeEventListener("zwift:open-training-profile", open);
  }, [startEdit]);

  function handleSave() {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
  }

  // Collapsed summary view removed — PhaseCard (phase-card.tsx) now shows
  // the at-a-glance summary directly under the hero banner and IS the click
  // target that opens this edit form (dispatches "zwift:open-training-
  // profile", handled by startEdit() below). This component now renders
  // nothing until editing is actually open.
  return (
    <>
      {/* ── Edit form — only when editing ───────────────────────────────── */}
      {editing && (
        <div className="stat-card" style={{ padding: 0, gridColumn: "1 / -1", overflow: "hidden" }}>

          {/* ── Card header strip ── */}
          <div style={{
            padding: "20px 28px 18px",
            background: "linear-gradient(135deg, rgba(47,143,224,0.06) 0%, rgba(47,143,224,0.02) 100%)",
            borderBottom: "1px solid rgba(47,143,224,0.12)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "relative", overflow: "hidden",
          }}>
            {/* Accent strip at very top */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 3,
              background: "linear-gradient(90deg, #2f8fe0 0%, #2f8fe0cc 40%, #2f8fe055 75%, transparent 100%)",
            }} />
            {/* Ambient glow */}
            <div style={{
              position: "absolute", top: -40, right: -20, width: 160, height: 160,
              borderRadius: "50%", background: "radial-gradient(circle, rgba(47,143,224,0.08) 0%, transparent 65%)",
              pointerEvents: "none",
            }} />

            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                {/* Icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "linear-gradient(135deg, #2f8fe0 0%, #1a6bb5 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 3px 8px rgba(47,143,224,0.35)",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)", letterSpacing: "-0.2px" }}>
                  {profile ? "Training Profile" : "Welcome — Set Up Your Profile"}
                </div>
                {phaseLabel && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "#2f8fe0",
                    background: "rgba(47,143,224,0.10)", border: "1px solid rgba(47,143,224,0.25)",
                    borderRadius: 20, padding: "2px 9px", letterSpacing: "0.03em",
                  }}>
                    {phaseLabel}
                  </div>
                )}
              </div>
              {!profile && (
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, paddingLeft: 42 }}>
                  Tell me your goals and schedule — I'll build a plan that fits your life.
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                flexShrink: 0, marginLeft: 16,
                width: 32, height: 32, borderRadius: 8,
                border: "1px solid var(--border)",
                background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "var(--muted)",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(47,143,224,0.08)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(47,143,224,0.4)";
                (e.currentTarget as HTMLButtonElement).style.color = "#2f8fe0";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "#fff";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div style={{ padding: "24px 28px" }}>
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

            <div>
              <FieldLabel>Where do you train?</FieldLabel>
              <SelectCards<TrainingEnvironment>
                options={["indoor","outdoor","both"]}
                labels={ENVIRONMENT_LABELS} icons={ENVIRONMENT_ICONS}
                selected={[draft.environment ?? "indoor"]}
                onChange={v => setDraft(d => ({ ...d, environment: v[v.length - 1] as TrainingEnvironment }))}
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
                  {(["1-2","2-3","3-4","4-5","5-6","6-7"] as DaysRange[]).map(r => (
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
                  style={{ width: "100%", padding: "8px 10px", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
                  value={draft.ageYears ?? ""}
                  onChange={e => setDraft(d => ({ ...d, ageYears: e.target.value ? Number(e.target.value) : undefined }))}
                />
              </div>
            </div>

            {(draft.goals ?? []).includes("event") && (
              <div>
                <FieldLabel>Target event date</FieldLabel>
                <input type="date"
                  style={{ width: "100%", maxWidth: 260, padding: "8px 10px", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, outline: "none" }}
                  value={draft.eventDate ?? ""}
                  onChange={e => setDraft(d => ({ ...d, eventDate: e.target.value || undefined }))}
                />
              </div>
            )}

            <div>
              <FieldLabel>Anything else? (optional)</FieldLabel>
              <textarea rows={2}
                placeholder='e.g. "Can only ride mornings, bad knee — avoid high-cadence sprints"'
                style={{ width: "100%", padding: "10px 12px", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, outline: "none" }}
                value={draft.notes ?? ""}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value || undefined }))}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            {/* Save — gradient, prominent */}
            <button
              type="button"
              onClick={handleSave}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "10px 28px", borderRadius: 9, border: "none",
                background: "linear-gradient(135deg, #2f8fe0 0%, #1a6bb5 100%)",
                color: "#fff", fontSize: 13.5, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 14px rgba(47,143,224,0.35)",
                transition: "opacity 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Save profile
            </button>

            {/* Cancel — clean secondary */}
            {profile && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "10px 20px", borderRadius: 9,
                  border: "1.5px solid var(--border)",
                  background: "#fff", color: "var(--muted)",
                  fontSize: 13.5, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(47,143,224,0.4)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#2f8fe0";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
                }}
              >
                Cancel
              </button>
            )}
          </div>
          </div>{/* end padding wrapper */}
        </div>
      )}
    </>
  );
}
