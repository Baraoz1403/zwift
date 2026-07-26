"use client";

import { useState } from "react";
import type { RiderTrainingProfile, TrainingGoal, DaysRange, SessionLength, TrainingEnvironment, Sport } from "@/lib/rider-profile";

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
  { value: "1-2", label: "1–2 days" },
  { value: "2-3", label: "2–3 days" },
  { value: "3-4", label: "3–4 days" },
  { value: "4-5", label: "4–5 days" },
  { value: "5-6", label: "5–6 days" },
  { value: "6-7", label: "6–7 days" },
];

const SESSIONS: { value: SessionLength; label: string }[] = [
  { value: "45",     label: "Up to 45 min" },
  { value: "60",     label: "45–60 min" },
  { value: "90",     label: "60–90 min" },
  { value: "90plus", label: "90+ min" },
];

const ENVS: { value: TrainingEnvironment; label: string; desc: string }[] = [
  { value: "indoor",  label: "Indoor",   desc: "Zwift / trainer only" },
  { value: "outdoor", label: "Outdoor",  desc: "Real-world rides" },
  { value: "both",    label: "Both",     desc: "Mix of indoor & outdoor" },
];

const SPORTS: { value: Sport; label: string }[] = [
  { value: "cycling", label: "Cycling 🚴" },
  { value: "running", label: "Running 🏃" },
  { value: "both",    label: "Both" },
];

export default function MobileProfileEditor({ initialProfile }: Props) {
  const [goals, setGoals] = useState<TrainingGoal[]>(initialProfile?.goals ?? ["fitness"]);
  const [daysRange, setDaysRange] = useState<DaysRange>(initialProfile?.daysRange ?? "3-4");
  const [sessionLength, setSessionLength] = useState<SessionLength>(initialProfile?.sessionLength ?? "60");
  const [environment, setEnvironment] = useState<TrainingEnvironment>(initialProfile?.environment ?? "indoor");
  const [sports, setSports] = useState<Sport[]>(initialProfile?.sports ?? ["cycling"]);
  const [ageYears, setAgeYears] = useState<string>(initialProfile?.ageYears ? String(initialProfile.ageYears) : "");
  const [eventDate, setEventDate] = useState<string>(initialProfile?.eventDate ?? "");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "done" | "error">("idle");

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

  return (
    <div style={{ padding: "16px 16px 40px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <a href="/m/profile" style={{
          width: 36, height: 36, borderRadius: 10,
          background: "#111827", border: "1px solid #1e293b",
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", color: "#94a3b8", fontSize: 18, flexShrink: 0,
        }}>←</a>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc" }}>Training Profile</div>
          <div style={{ fontSize: 13, color: "#475569" }}>Tell your coach about yourself</div>
        </div>
      </div>

      {/* Goals */}
      <Section label="Goals" desc="What do you want to achieve?">
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

      {/* Sports */}
      <Section label="Sport" desc="What do you train?">
        <div style={{ display: "flex", gap: 8 }}>
          {SPORTS.map(s => (
            <ToggleCard
              key={s.value}
              selected={sports.includes(s.value)}
              onClick={() => setSports([s.value])}
              label={s.label}
              flex
            />
          ))}
        </div>
      </Section>

      {/* Days per week */}
      <Section label="Days per week" desc="How many training sessions?">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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
                padding: "13px 16px",
                background: environment === e.value ? "rgba(37,99,235,0.12)" : "#111827",
                border: `1px solid ${environment === e.value ? "#2563eb55" : "#1e293b"}`,
                borderRadius: 14, cursor: "pointer", textAlign: "left",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>{e.label}</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>{e.desc}</div>
              </div>
              {environment === e.value && (
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* Age */}
      <Section label="Age (optional)" desc="Helps tailor recovery weeks">
        <input
          type="number"
          value={ageYears}
          onChange={e => setAgeYears(e.target.value)}
          placeholder="e.g. 42"
          min={15} max={90}
          style={{
            width: "100%", padding: "14px 16px",
            background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 14, color: "#f1f5f9", fontSize: 16,
            outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          }}
        />
      </Section>

      {/* Event date */}
      <Section label="Target event (optional)" desc="Race or goal date for periodization">
        <input
          type="date"
          value={eventDate}
          onChange={e => setEventDate(e.target.value)}
          style={{
            width: "100%", padding: "14px 16px",
            background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 14, color: "#f1f5f9", fontSize: 16,
            outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          }}
        />
      </Section>

      {/* Save */}
      <button
        onClick={save}
        disabled={saveState === "saving" || saveState === "done"}
        style={{
          width: "100%", padding: "18px",
          background:
            saveState === "done"   ? "#166534" :
            saveState === "error"  ? "#7f1d1d" :
            saveState === "saving" ? "#1d4ed8aa" : "#2563eb",
          color: "#fff", border: "none", borderRadius: 18,
          fontSize: 17, fontWeight: 700,
          cursor: saveState === "idle" || saveState === "error" ? "pointer" : "default",
          boxShadow: saveState === "idle" ? "0 4px 20px #2563eb40" : "none",
          marginTop: 8,
        }}
      >
        {saveState === "idle"   ? "Save profile" :
         saveState === "saving" ? "Saving…" :
         saveState === "done"   ? "✓ Saved!" : "Try again"}
      </button>

      {saveState === "done" && (
        <div style={{ textAlign: "center", fontSize: 13, color: "#4ade80", marginTop: 10 }}>
          Profile updated. Your next plan will reflect these changes.
        </div>
      )}
    </div>
  );
}

function Section({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#475569", marginBottom: 10 }}>{desc}</div>
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
        padding: "13px 10px", textAlign: "center",
        background: selected ? "rgba(37,99,235,0.15)" : "#111827",
        border: `1px solid ${selected ? "#2563eb55" : "#1e293b"}`,
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
