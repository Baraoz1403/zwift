"use client";
import { useState, useEffect, useRef } from "react";

export interface HeroBannerCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
  weeksToEvent?: number | null;
}

export interface HeroBannerTodayWorkout {
  title: string;
  type: string;
  durationMin: number;
}

const PHASE_GOAL: Record<HeroBannerCycleInfo["phase"], string> = {
  Base: "Building your aerobic engine — steady miles, low stress.",
  Build: "Progressive overload — each week a little harder than the last.",
  Recovery: "A deliberate down week — let adaptation catch up to training.",
  Taper: "Dialing back volume while keeping the sharpness.",
  RaceWeek: "Minimal stress, maximum freshness — save it for race day.",
};

const PHASE_INSIGHT: Record<HeroBannerCycleInfo["phase"], string> = {
  Base: "Base weeks are where your ceiling gets built — don't skip the easy days.",
  Build: "Fatigue will build this week. Trust the plan, recover hard between sessions.",
  Recovery: "Absorb the fitness you've built. Fighting the rest just delays it.",
  Taper: "Less volume now protects the fitness you already earned.",
  RaceWeek: "Short, sharp, and done. Everything you need is already in the bank.",
};

/**
 * Integrated Coach-page banner - phase/week status, today's workout, and a
 * short coaching insight, rotating every 6s. Rewritten from an earlier
 * standalone dark marketing-style version (rotating slides of generic
 * feature copy, glow effects, no real rider data) into something driven by
 * this rider's actual state and styled to match the rest of the page
 * (white card + the same shadow language as the workout cards) instead of
 * looking like a separate promotional element bolted onto a light page.
 *
 * Rendered inside weekly-plan.tsx (not page.tsx) because the data it needs
 * - cycleInfo, today's workout - already lives in that component's client
 * state; page.tsx is a server component with no access to it without a new
 * API round-trip.
 */
export default function HeroBanner({
  cycleInfo,
  todayWorkout,
}: {
  cycleInfo: HeroBannerCycleInfo | null;
  todayWorkout: HeroBannerTodayWorkout | null;
}) {
  const [slide, setSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phase = cycleInfo?.phase ?? "Base";
  const weekInMesocycle = cycleInfo?.weekInMesocycle ?? 1;

  const headline =
    (cycleInfo?.phase === "Taper" || cycleInfo?.phase === "RaceWeek") && cycleInfo.weeksToEvent != null
      ? `${cycleInfo.phase === "RaceWeek" ? "Race Week" : "Taper"}`
      : `${phase} Phase · Week ${weekInMesocycle} of 4`;

  const messages = [
    { label: "This week", text: PHASE_GOAL[phase] },
    {
      label: "Today",
      text: todayWorkout
        ? `${todayWorkout.title} — ${todayWorkout.durationMin} min`
        : "Rest day — no session scheduled.",
    },
    { label: "Coach's note", text: PHASE_INSIGHT[phase] },
  ];

  useEffect(() => {
    if (timerRef.current != null) clearInterval(timerRef.current);
    setProgress(0);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / 6000) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        setSlide((s) => (s + 1) % messages.length);
        if (timerRef.current != null) clearInterval(timerRef.current);
      }
    }, 50);
    return () => { if (timerRef.current != null) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));
  const r = 42;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        padding: "28px 36px",
        marginBottom: 32,
        minHeight: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 32,
        flexWrap: "wrap",
      }}
    >
      {/* Left: phase/week headline + rotating message + dots */}
      <div style={{ flex: "1 1 320px", minWidth: 260 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#3b82f6" }}>
          {messages[slide].label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", marginTop: 6, lineHeight: 1.2 }}>
          {headline}
        </div>
        <p
          key={slide}
          className="hero-banner-fade"
          style={{ fontSize: 15, color: "#64748b", lineHeight: 1.6, margin: "12px 0 20px", maxWidth: 460 }}
        >
          {messages[slide].text}
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          {messages.map((_, j) => (
            <button
              key={j}
              onClick={() => setSlide(j)}
              style={{ border: "none", cursor: "pointer", padding: 0, background: "transparent" }}
              aria-label={`Show message ${j + 1}`}
            >
              <div style={{ position: "relative", width: j === slide ? 32 : 7, height: 7, borderRadius: 4, background: "#e2e8f0", transition: "width .3s", overflow: "hidden" }}>
                {j === slide && (
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress}%`, background: "#3b82f6", borderRadius: 4 }} />
                )}
                {j < slide && <div style={{ position: "absolute", inset: 0, background: "#3b82f6" }} />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: simple week-progress arc */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <svg width={104} height={104} viewBox="0 0 104 104">
          <circle cx={52} cy={52} r={r} fill="none" stroke="#f1f5f9" strokeWidth={10} />
          <circle
            cx={52} cy={52} r={r} fill="none"
            stroke="#3b82f6" strokeWidth={10} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - arcPct)}
            transform="rotate(-90 52 52)"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
          <text x={52} y={48} textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f172a">
            {weekInMesocycle}
          </text>
          <text x={52} y={66} textAnchor="middle" fontSize={10} fontWeight={600} fill="#94a3b8" letterSpacing="0.04em">
            OF 4
          </text>
        </svg>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Mesocycle week
        </div>
      </div>

      <style>{`
        @keyframes heroBannerFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-banner-fade {
          animation: heroBannerFadeIn 0.35s ease;
        }
      `}</style>
    </div>
  );
}
