"use client";

import { useState } from "react";
import type {
  RiderTrainingProfile, TrainingGoal, DaysRange,
  SessionLength, TrainingEnvironment, Sport, EventType,
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
  const [goals, setGoals] = useState<TrainingGoal[]>(initialProfile?.goals ?? ["fitness"]);
  const [daysRange, setDaysRange] = useState<DaysRange>(initialProfile?.daysRange ?? "3-4");
  const [sessionLength, setSessionLength] = useState<SessionLength>(initialProfile?.sessionLength ?? "60");
  const [environment, setEnvironment] = useState<TrainingEnvironment>(initialProfile?.environment ?? "indoor");
  const [sports, setSports] = useState<Sport[]>(initialProfile?.sports ?? ["cycling"]);
  const [ageYears, setAgeYears] = useState<string>(initialProfile?.ageYears ? String(initialProfile.ageYears) : "");
  const [eventDate, setEventDate] = useState<string>(initialProfile?.eventDate ?? "");
  const [eventEndDate, setEventEndDate] = useState<string>(initialProfile?.eventEndDate ?? "");
  const [eventType, setEventType] = useState<EventType | "">(initialProfile?.eventType ?? "");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const isEventGoal = goals.includes("event");
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
      goals,
      daysRange,
      sessionLength,
      environment,
      sports,
      ageYears: ageYears ? parseInt(ageYears, 10) : undefined,
      eventDate: eventDate || undefined,
      eventEndDate: eventEndDate || undefined,
      eventType: (eventType as EventType) || undefined,
    };
    try {
      const res = await fetch("/api/ai/weekly-plan/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderProfile: profile }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSaveState("done");
        setTimeout(() => window.location.href = "/m/profile", 1000);
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  const eventCategories = ["Cycling", "Running", "Triathlon", "Other"] as const;

  return (
    <div style={{ padding: "16px 16px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <a href="/m/profile" style={{
          width: 40, height: 40, borderRadius: 12,
          background: "#111827", border: "1px solid #1e293b",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", color: "#94a3b8", fontSize: 20, flexShrink: 0,
        }}>←</a>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#f8fafc" }}>Training Profile</div>
          <div style={{ fontSize: 15, color: "#475569", marginTop: 2 }}>Tell your coach about yourself</div>
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

      {/* Event details — shown prominently when Event prep is a goal */}
      {isEventGoal && (
        <div style={{
          marginBottom: 22,
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: 18, padding: "18px 16px",
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#f59e0b", marginBottom: 4 }}>
            🏆 Event details
          </div>
          <div style={{ fontSize: 15, color: "#64748b", marginBottom: 16 }}>
            Your coach builds the entire periodization backwards from this event.
            The more detail, the better the plan.
          </div>

          {/* Event type */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#cbd5e1", marginBottom: 10 }}>
              What type of event?
            </div>
            {eventCategories.map(cat => {
              const catEvents = EVENT_TYPES.filter(e => e.category === cat);
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", letterSpacing: ".4px", textTransform: "uppercase", marginBottom: 6 }}>
                    {cat}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {catEvents.map(e => (
                      <button
                        key={e.value}
                        onClick={() => setEventType(eventType === e.value ? "" : e.value)}
                        style={{
                          padding: "10px 12px", textAlign: "left",
                          background: eventType === e.value ? "rgba(245,158,11,0.15)" : "#111827",
                          border: `1px solid ${eventType === e.value ? "rgba(245,158,11,0.45)" : "#1e293b"}`,
                          borderRadius: 12, cursor: "pointer",
                          fontSize: 14, fontWeight: eventType === e.value ? 700 : 500,
                          color: eventType === e.value ? "#fbbf24" : "#64748b",
                          transition: "all .12s",
                        }}
                      >
                        {e.emoji} {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Event start date */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>
              {isMultiDayEvent ? "Event start date" : "Event date"}
            </div>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              style={{
                width: "100%", padding: "14px 16px",
                background: "#0f172a", border: "1px solid #334155",
                borderRadius: 12, color: "#f1f5f9", WebkitTextFillColor: "#f1f5f9",
                fontSize: 17,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                WebkitAppearance: "none" as const,
              }}
            />
          </div>

          {/* End date — only for multi-day events */}
          {isMultiDayEvent && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#cbd5e1", marginBottom: 8 }}>
                Event end date <span style={{ fontWeight: 400, color: "#475569" }}>(optional)</span>
              </div>
              <input
                type="date"
                value={eventEndDate}
                onChange={e => setEventEndDate(e.target.value)}
                style={{
                  width: "100%", padding: "14px 16px",
                  background: "#0f172a", border: "1px solid #334155",
                  borderRadius: 12, color: "#f1f5f9", fontSize: 17,
                  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }}
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
                padding: "14px 18px",
                background: environment === e.value ? "rgba(37,99,235,0.12)" : "#111827",
                border: `1px solid ${environment === e.value ? "#2563eb55" : "#1e293b"}`,
                borderRadius: 14, cursor: "pointer", textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "#f1f5f9" }}>{e.label}</div>
                <div style={{ fontSize: 14, color: "#64748b", marginTop: 2 }}>{e.desc}</div>
              </div>
              {environment === e.value && (
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
              )}
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
            style={{
              width: "100%", padding: "16px 18px",
              background: "#111827", border: "1px solid #334155",
              borderRadius: 14, color: "#f8fafc", WebkitTextFillColor: "#f8fafc",
              fontSize: 18, fontWeight: 600,
              outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              WebkitAppearance: "none" as const,
            }}
          />
          {ageYears && (
            <div style={{
              position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)",
              fontSize: 16, color: "#3b82f6", fontWeight: 700,
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
          width: "100%", padding: "20px",
          background:
            saveState === "done"   ? "#166534" :
            saveState === "error"  ? "#7f1d1d" :
            saveState === "saving" ? "#1d4ed8aa" : "#2563eb",
          color: "#fff", border: "none", borderRadius: 18,
          fontSize: 19, fontWeight: 700,
          cursor: saveState === "idle" || saveState === "error" ? "pointer" : "default",
          boxShadow: saveState === "idle" ? "0 4px 24px #2563eb40" : "none",
          marginTop: 8,
        }}
      >
        {saveState === "idle"   ? "Save profile" :
         saveState === "saving" ? "Saving…" :
         saveState === "done"   ? "✓ Saved!" : "Try again"}
      </button>

      {saveState === "done" && (
        <div style={{ textAlign: "center", fontSize: 15, color: "#4ade80", marginTop: 12 }}>
          Profile updated. Your next plan will reflect these changes.
        </div>
      )}
    </div>
  );
}

function Section({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, color: "#475569", marginBottom: 12 }}>{desc}</div>
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
        padding: "14px 10px", textAlign: "center",
        background: selected ? "rgba(37,99,235,0.15)" : "#111827",
        border: `1px solid ${selected ? "#2563eb66" : "#1e293b"}`,
        borderRadius: 14, cursor: "pointer",
        fontSize: 15, fontWeight: selected ? 700 : 500,
        color: selected ? "#93c5fd" : "#64748b",
        transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}
