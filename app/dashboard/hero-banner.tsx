"use client";
import { useState, useEffect, useRef } from "react";

const SLIDES = [
  {
    accent: "#00E5FF",
    bg: "linear-gradient(135deg, #0a0e1a 0%, #0d1f3c 60%, #0a1628 100%)",
    tag: "POWERED BY AI",
    lines: ["Your Rides.", "Your Data.", "Your Coach."],
    sub: "Real-time training plans built from your Zwift performance.",
  },
  {
    accent: "#00FF9C",
    bg: "linear-gradient(135deg, #050d0a 0%, #0a1f16 60%, #071a10 100%)",
    tag: "STRUCTURED TRAINING",
    lines: ["Sweet Spot.", "Threshold.", "VO2max."],
    sub: "Progressive 8-week cycles. Every session has a purpose and a target.",
  },
  {
    accent: "#FF6B35",
    bg: "linear-gradient(135deg, #1a0a05 0%, #2d1200 60%, #1a0c05 100%)",
    tag: "ZERO MANUAL STEPS",
    lines: ["Generate.", "Sync.", "Ride."],
    sub: "Plans push to Zwift every Sunday night automatically.",
  },
];

export default function HeroBanner() {
  const [idx, setIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const s = SLIDES[idx];

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setPct(0);
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const p = Math.min(((Date.now() - t0) / 6000) * 100, 100);
      setPct(p);
      if (p >= 100) {
        setIdx((i) => (i + 1) % SLIDES.length);
        if (timer.current) clearInterval(timer.current);
      }
    }, 50);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [idx]);

  return (
    <div style={{
      background: s.bg,
      borderRadius: 16,
      padding: "36px 40px 28px",
      marginBottom: 32,
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${s.accent}22`,
      boxShadow: `0 0 60px ${s.accent}10, 0 16px 48px rgba(0,0,0,0.4)`,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      minHeight: 220,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    }}>
      {/* Grid overlay */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none",
        backgroundImage: `linear-gradient(${s.accent} 1px, transparent 1px), linear-gradient(90deg, ${s.accent} 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }} />
      {/* Glow */}
      <div style={{
        position: "absolute", top: -80, right: "15%",
        width: 350, height: 350, borderRadius: "50%",
        background: `radial-gradient(circle, ${s.accent}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Tag */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${s.accent}18`, border: `1px solid ${s.accent}40`,
          borderRadius: 20, padding: "4px 14px", marginBottom: 20,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.accent, boxShadow: `0 0 8px ${s.accent}` }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: s.accent }}>{s.tag}</span>
        </div>

        {/* Headlines */}
        <div style={{ marginBottom: 14 }}>
          {s.lines.map((line, i) => (
            <div key={i} style={{
              fontSize: 36, fontWeight: 800, lineHeight: 1.1,
              color: i === s.lines.length - 1 ? s.accent : "white",
              textShadow: i === s.lines.length - 1 ? `0 0 24px ${s.accent}60` : "none",
            }}>{line}</div>
          ))}
        </div>

        {/* Sub */}
        <p style={{ fontSize: 15, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>{s.sub}</p>
      </div>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 10, position: "relative", zIndex: 1, marginTop: 20 }}>
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} style={{ border: "none", cursor: "pointer", padding: 0, background: "transparent" }}>
            <div style={{
              position: "relative",
              width: i === idx ? 40 : 8, height: 7, borderRadius: 4,
              background: i === idx ? `${s.accent}35` : "#334155",
              transition: "width 0.3s, background 0.3s",
              overflow: "hidden",
            }}>
              {i === idx && (
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: s.accent, borderRadius: 4,
                }} />
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
