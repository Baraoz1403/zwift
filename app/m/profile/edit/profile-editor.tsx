"use client";

import { useState, useEffect } from "react";
import type {
  RiderTrainingProfile, TrainingGoal, DaysRange,
  SessionLength, TrainingEnvironment, Sport, EventType, Gender,
} from "@/lib/rider-profile";

interface Props {
  initialProfile: RiderTrainingProfile | null;
}

const GOALS: { value: TrainingGoal; label: string; emoji: string }[] = [
  { value: "fitness", label: "Improve fitness",  emoji: "💪" },
  { value: "ftp",     label: "Raise FTP",         emoji: "⚡" },
  { value: "weight",  label: "Lose weight",       emoji: "🔥" },
  { value: "event",   label: "Event prep",        emoji: "🏆" },
  { value: "fun",     label: "Ride for fun",      emoji: "😊" },
];

const DAYS: { value: DaysRange; label: string }[] = [
  { value: "1-2", label: "1–2" },
  { value: "2-3", label: "2–3" },
  { value: "3-4", label: "3–4" },
  { value: "4-5", label: "4–5" },
  { value: "5-6", label: "5–6" },
  { value: "6-7", label: "6–7" },
];

const SESSIONS: { value: SessionLength; label: string }[] = [
  { value: "45",     label: "≤45 min" },
  { value: "60",     label: "45–60 min" },
  { value: "90",     label: "60–90 min" },
  { value: "90plus", label: "90+ min" },
];

const ENVS: { value: TrainingEnvironment; label: string; desc: string }[] = [
  { value: "indoor",  label: "Indoor",   desc: "Zwift / trainer" },
  { value: "outdoor", label: "Outdoor",  desc: "Real-world only" },
  { value: "both",    label: "Both",     desc: "Indoor & outdoor" },
];

const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: "cycling", label: "Cycling",  emoji: "🚴" },
  { value: "running", label: "Running",  emoji: "🏃" },
  { value: "both",    label: "Both",     emoji: "🔀" },
];

const EVENT_TYPES: { value: EventType; label: string; emoji: string; category: string }[] = [
  { value: "road-race-1day",  label: "Road race (1-day)",    emoji: "🚴", category: "Cycling" },
  { value: "road-race-stage", label: "Stage race",           emoji: "📅", category: "Cycling" },
  { value: "gravel-race",     label: "Gravel race",          emoji: "🪨", category: "Cycling" },
  { value: "mtb-race",        label: "MTB race",             emoji: "🌲", category: "Cycling" },
  { value: "time-trial",      label: "Time trial (TT)",      emoji: "⏱️", category: "Cycling" },
  { value: "gran-fondo",      label: "Gran Fondo",           emoji: "🏔️", category: "Cycling" },
  { value: "zwift-race",      label: "Zwift race",           emoji: "⚡", category: "Cycling" },
  { value: "run-5k",          label: "5K run",               emoji: "🏃", category: "Running" },
  { value: "run-10k",         label: "10K run",              emoji: "🏃", category: "Running" },
  { value: "half-marathon",   label: "Half marathon",        emoji: "🏃", category: "Running" },
  { value: "marathon",        label: "Marathon",             emoji: "🏃", category: "Running" },
  { value: "sprint-tri",      label: "Sprint triathlon",     emoji: "🏊", category: "Triathlon" },
  { value: "olympic-tri",     label: "Olympic triathlon",    emoji: "🏊", category: "Triathlon" },
  { value: "half-ironman",    label: "70.3 / Half Ironman",  emoji: "🏊", category: "Triathlon" },
  { value: "ironman",         label: "Full Ironman",         emoji: "🏊", category: "Triathlon" },
  { value: "other",           label: "Other event",          emoji: "🏆", category: "Other" },
];

const MULTI_DAY_TYPES: EventType[] = ["road-race-stage", "half-ironman", "ironman", "other"];

export default function MobileProfileEditor({ initialProfile }: Props) {
  const [goals, setGoals]               = useState<TrainingGoal[]>(initialProfile?.goals ?? ["fitness"]);
  const [daysRange, setDaysRange]       = useState<DaysRange>(initialProfile?.daysRange ?? "3-4");
  const [sessionLength, setSessionLength] = useState<SessionLength>(initialProfile?.sessionLength ?? "60");
  const [environment, setEnvironment]   = useState<TrainingEnvironment>(initialProfile?.environment ?? "indoor");
  const [sports, setSports]             = useState<Sport[]>(initialProfile?.sports ?? ["cycling"]);
  const [gender, setGender]             = useState<Gender | "">(initialProfile?.gender ?? "");
  const [ageYears, setAgeYears]         = useState<string>(initialProfile?.ageYears ? String(initialProfile.ageYears) : "");
  const [eventDate, setEventDate]       = useState<string>(initialProfile?.eventDate ?? "");
  const [eventEndDate, setEventEndDate] = useState<string>(initialProfile?.eventEndDate ?? "");
  const [eventType, setEventType]       = useState<EventType | "">(initialProfile?.eventType ?? "");
  const [saveState, setSaveState]       = useState<"idle" | "saving" | "done" | "error">("idle");
  const [backHref, setBackHref]         = useState("/m/profile");

  // No scroll-height state needed — the outer div uses position:absolute with
  // explicit edges, which gives iOS Safari a definite clientHeight without any
  // CSS height:100% ambiguity.

  // On tablet (/tablet/profile/edit) the back button must go to /tablet/profile.
  // Using useEffect avoids SSR/hydration mismatch (server always returns /m/profile).
  useEffect(() => {
    if (window.location.pathname.startsWith("/tablet")) {
      setBackHref("/tablet/profile");
    }
  }, []);

  const isEventGoal    = goals.includes("event");
  const isMultiDayEvent = eventType && MULTI_DAY_TYPES.includes(eventType as EventType);

  function toggleGoal(g: TrainingGoal) {
    setGoals(prev =>
      prev.includes(g) ? (prev.length > 1 ? prev.filter(x => x !== g) : prev) : [...prev, g]
    );
  }

  async function save() {
    if (saveState === "saving") return;
    setSaveState("saving");
    const profile: RiderTrainingProfile = {
      goals, daysRange, sessionLength, environment, sports,
      gender: (gender as Gender) || undefined,
      ageYears: ageYears ? parseInt(ageYears, 10) : undefined,
      eventDate: eventDate || undefined,
      eventEndDate: eventEndDate || undefined,
      eventType: (eventType as EventType) || undefined,
    };
    try {
      const res  = await fetch("/api/ai/weekly-plan/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderProfile: profile }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveState("done");
        const prefix = window.location.pathname.startsWith("/tablet/") ? "/tablet" : "/m";
        setTimeout(() => window.location.href = `${prefix}/profile`, 1000);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  const eventCategories = ["Cycling", "Running", "Triathlon", "Other"] as const;

  // Input style — no WebkitBoxShadow inline: the .m-input CSS class handles it per-theme
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "15px 16px",
    background: "transparent",
    border: "1px solid var(--m-border)",
    borderRadius: 4,
    fontSize: 17, fontWeight: 500,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
    WebkitAppearance: "none",
  };

  return (
    <div
      style={{
        // position:absolute with explicit edges fills the nearest positioned ancestor
        // (mobile layout content div OR tablet-scroll-area), giving iOS Safari a
        // definite clientHeight. This is the most reliable cross-device scroll fix.
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflowY: "scroll",
        overscrollBehavior: "contain",
      }}
    >
    <div style={{ padding: "16px 16px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <a href={backHref} style={{
          width: 40, height: 40, borderRadius: 4,
          background: "var(--m-card)", border: "1px solid var(--m-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", color: "var(--m-muted)", fontSize: 20, flexShrink: 0,
        }}>←</a>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--m-text)" }}>Training Profile</div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", marginTop: 2 }}>Tell your coach about yourself</div>
        </div>
      </div>

      {/* Goals */}
      <Section label="Goals" desc="What do you want to achieve? Pick all that apply.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {GOALS.map(g => (
            <ToggleCard
              key={g.value}
              selected={goals.includes(g.value)}
              onClick={() => toggleGoal(g.value)}
              label={`${g.emoji} ${g.label}`}
            />
          ))}
        </div>
      </Section>

      {/* Sport */}
      <Section label="Sport" desc="What disciplines do you train?">
        <div style={{ display: "flex", gap: 8 }}>
          {SPORTS.map(s => (
            <ToggleCard
              key={s.value}
              selected={sports.includes(s.value)}
              onClick={() => setSports([s.value])}
              label={`${s.emoji} ${s.label}`}
              flex
            />
          ))}
        </div>
      </Section>

      {/* Event details */}
      {isEventGoal && (
        <div style={{
          marginBottom: 22,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 4, padding: "18px 16px",
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b", marginBottom: 4 }}>
            🏆 Event details
          </div>
          <div style={{ fontSize: 14, color: "var(--m-muted)", marginBottom: 16 }}>
            Your coach builds the entire periodization backwards from this event.
          </div>

          {/* Event type */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 10 }}>
              What type of event?
            </div>
            {eventCategories.map(cat => {
              const catEvents = EVENT_TYPES.filter(e => e.category === cat);
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--m-muted)", letterSpacing: ".4px", textTransform: "uppercase", marginBottom: 6 }}>
                    {cat}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {catEvents.map(e => (
                      <button
                        key={e.value}
                        onClick={() => setEventType(eventType === e.value ? "" : e.value)}
                        style={{
                          position: "relative",
                          padding: "10px 12px", textAlign: "left",
                          background: eventType === e.value ? "rgba(22,163,74,0.12)" : "var(--m-card)",
                          border: `2px solid ${eventType === e.value ? "#16a34a" : "var(--m-border)"}`,
                          borderRadius: 4, cursor: "pointer",
                          fontSize: 13, fontWeight: eventType === e.value ? 700 : 500,
                          color: eventType === e.value ? "#22c55e" : "var(--m-muted)",
                        }}
                      >
                        {e.emoji} {e.label}
                        {eventType === e.value && (
                          <span style={{
                            position: "absolute", top: 4, right: 4,
                            width: 16, height: 16, borderRadius: 3,
                            background: "#16a34a",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, color: "#fff", fontWeight: 900,
                          }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Event start date */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 8 }}>
              {isMultiDayEvent ? "Event start date" : "Event date"}
            </div>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="m-input"
              style={inputStyle}
            />
          </div>

          {isMultiDayEvent && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--m-text)", marginBottom: 8 }}>
                Event end date <span style={{ fontWeight: 400, color: "var(--m-muted)" }}>(optional)</span>
              </div>
              <input
                type="date"
                value={eventEndDate}
                onChange={e => setEventEndDate(e.target.value)}
                className="m-input"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      )}

      {/* Days per week */}
      <Section label="Days per week" desc="How many training sessions?">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {DAYS.map(d => (
            <ToggleCard
              key={d.value}
              selected={daysRange === d.value}
              onClick={() => setDaysRange(d.value)}
              label={d.label}
            />
          ))}
        </div>
      </Section>

      {/* Session length */}
      <Section label="Session length" desc="Typical workout duration">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {SESSIONS.map(s => (
            <ToggleCard
              key={s.value}
              selected={sessionLength === s.value}
              onClick={() => setSessionLength(s.value)}
              label={s.label}
            />
          ))}
        </div>
      </Section>

      {/* Environment */}
      <Section label="Environment" desc="Where do you train?">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ENVS.map(e => (
            <button
              key={e.value}
              onClick={() => setEnvironment(e.value)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px",
                background: environment === e.value ? "rgba(22,163,74,0.10)" : "var(--m-card)",
                border: `2px solid ${environment === e.value ? "#16a34a" : "var(--m-border)"}`,
                borderRadius: 4, cursor: "pointer", textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: environment === e.value ? "#22c55e" : "var(--m-text)" }}>
                  {e.label}
                </div>
                <div style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 2 }}>{e.desc}</div>
              </div>
              {environment === e.value ? (
                <div style={{
                  width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                  background: "#16a34a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, color: "#fff", fontWeight: 900,
                }}>✓</div>
              ) : (
                <div style={{
                  width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                  border: "2px solid var(--m-border)",
                }} />
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* Gender */}
      <Section label="Biological sex" desc="Affects W/kg benchmarks and recovery pacing — optional">
        <div style={{ display: "flex", gap: 10 }}>
          {(["male", "female"] as Gender[]).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(prev => prev === g ? "" : g)}
              style={{
                flex: 1, padding: "15px 10px", borderRadius: 4,
                fontSize: 16, fontWeight: gender === g ? 700 : 500,
                background: gender === g ? "rgba(255,90,31,0.1)" : "transparent",
                border: `1px solid ${gender === g ? "#FF5A1F" : "var(--m-border)"}`,
                color: gender === g ? "#FF5A1F" : "var(--m-text)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {g === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
      </Section>

      {/* Age */}
      <Section label="Age" desc="Helps calibrate recovery weeks and intensity zones">
        <div style={{ position: "relative" }}>
          <input
            type="number"
            value={ageYears}
            onChange={e => setAgeYears(e.target.value)}
            placeholder="Your age (e.g. 42)"
            min={15} max={90}
            className="m-input"
            style={inputStyle}
          />
          {ageYears && (
            <div style={{
              position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
              fontSize: 14, color: "#FF5A1F", fontWeight: 700, pointerEvents: "none",
            }}>
              years old
            </div>
          )}
        </div>
      </Section>

      {/* Save */}
      <button
        onClick={save}
        disabled={saveState === "saving" || saveState === "done"}
        style={{
          width: "100%", padding: "18px",
          background:
            saveState === "done"   ? "#16a34a" :
            saveState === "error"  ? "#dc2626" :
            saveState === "saving" ? "#FF5A1Faa" : "#FF5A1F",
          color: "#fff", border: "none", borderRadius: 4,
          fontSize: 17, fontWeight: 700,
          cursor: saveState === "idle" || saveState === "error" ? "pointer" : "default",
          marginTop: 8,
        }}
      >
        {saveState === "idle"   ? "Save profile" :
         saveState === "saving" ? "Saving…" :
         saveState === "done"   ? "✓ Saved!" : "Try again"}
      </button>

      {saveState === "done" && (
        <div style={{ textAlign: "center", fontSize: 14, color: "#22c55e", marginTop: 12 }}>
          Profile updated. Your next plan will reflect these changes.
        </div>
      )}
    </div> {/* end padding wrapper */}
    </div>
  );
}

function Section({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--m-text)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: "var(--m-muted)", marginBottom: 12 }}>{desc}</div>
      {children}
    </div>
  );
}

function ToggleCard({ selected, onClick, label, flex }: {
  selected: boolean; onClick: () => void; label: string; flex?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: flex ? 1 : undefined,
        position: "relative",
        padding: "13px 10px", textAlign: "center",
        background: selected ? "rgba(22,163,74,0.12)" : "var(--m-card)",
        border: `2px solid ${selected ? "#16a34a" : "var(--m-border)"}`,
        borderRadius: 4, cursor: "pointer",
        fontSize: 14, fontWeight: selected ? 700 : 500,
        color: selected ? "#22c55e" : "var(--m-muted)",
        transition: "all .15s",
      }}
    >
      {label}
      {selected && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          width: 18, height: 18, borderRadius: 3,
          background: "#16a34a",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#fff", fontWeight: 900,
        }}>✓</span>
      )}
    </button>
  );
}
