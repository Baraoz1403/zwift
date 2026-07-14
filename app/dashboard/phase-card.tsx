"use client";

import { useState } from "react";
import { type RiderTrainingProfile, GOAL_LABELS, DAYS_RANGE_LABELS } from "@/lib/rider-profile";

export interface PhaseCardCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
}

const PHASE_COLORS: Record<string, string> = {
  Base:      "#3b82f6",
  Build:     "#f59e0b",
  Recovery:  "#22c55e",
  Taper:     "#a855f7",
  RaceWeek:  "#ef4444",
};

const PHASE_LABELS: Record<string, string> = {
  Base:      "Base",
  Build:     "Build",
  Recovery:  "Recovery",
  Taper:     "Taper",
  RaceWeek:  "Race Week",
};

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function PhaseCard({
  firstName,
  ftp,
  weightKg,
  riderProfile,
  cycleInfo,
}: {
  firstName: string | null;
  ftp: number | null;
  weightKg: number | null;
  riderProfile: RiderTrainingProfile | null;
  cycleInfo: PhaseCardCycleInfo | null;
}) {
  const [hover, setHover] = useState(false);
  const phase = cycleInfo?.phase ?? "Base";
  const weekInMesocycle = cycleInfo?.weekInMesocycle ?? 1;
  const wPerKg = ftp && weightKg && weightKg > 0 ? ftp / weightKg : null;
  const hasProfile = riderProfile != null;
  const goalLabel = riderProfile?.goals?.length
    ? riderProfile.goals.map((g) => GOAL_LABELS[g]).join(" · ")
    : "Building fitness";
  const daysLabel = riderProfile?.daysRange ? DAYS_RANGE_LABELS[riderProfile.daysRange] : null;

  const phaseColor = PHASE_COLORS[phase] ?? "#3b82f6";

  // Phase progress arc — 28px radius, centered in 64×64 viewBox
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));
  const phasePct = Math.round(arcPct * 100);

  function openEditor() {
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
  }

  return (
    <>
      {/* ── Keyframes injected once ── */}
      <style>{`
        @keyframes phaseGlow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 0.9; transform: scale(1.08); }
        }
        @keyframes avatarPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${phaseColor}40; }
          50%       { box-shadow: 0 0 0 8px ${phaseColor}00; }
        }
      `}</style>

      <div
        role="button"
        tabIndex={0}
        onClick={openEditor}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor(); } }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={hasProfile ? "Click to edit your training profile" : "Click to set up your training profile"}
        style={{
          width: "100%", maxWidth: 1100, margin: "0 auto", boxSizing: "border-box",
          // Glass-depth card: layered gradient + translucent surface
          background: hover
            ? "linear-gradient(135deg, var(--panel) 0%, rgba(47,143,224,0.07) 60%, rgba(47,143,224,0.03) 100%)"
            : "linear-gradient(135deg, var(--panel) 0%, rgba(47,143,224,0.04) 100%)",
          borderRadius: 16,
          border: `1px solid ${hover ? `${phaseColor}50` : "rgba(47,143,224,0.15)"}`,
          boxShadow: hover
            ? `0 20px 48px rgba(0,0,0,0.12), 0 0 0 1px ${phaseColor}20, inset 0 1px 0 rgba(255,255,255,0.08)`
            : "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.06)",
          position: "relative",
          overflow: "hidden",
          marginBottom: 40,
          fontFamily: "system-ui, sans-serif",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          cursor: "pointer",
          transform: hover ? "translateY(-3px)" : "translateY(0)",
          transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease",
        }}
      >
        {/* Top accent strip */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${phaseColor} 0%, ${phaseColor}80 50%, transparent 100%)`,
          zIndex: 2,
        }} />

        {/* Background ambient glow — moves with phase color */}
        <div style={{
          position: "absolute", top: -120, right: -60, width: 320, height: 320, borderRadius: "50%",
          background: `radial-gradient(circle, ${phaseColor}12 0%, transparent 65%)`,
          pointerEvents: "none",
          animation: "phaseGlow 6s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: "30%", width: 200, height: 200, borderRadius: "50%",
          background: `radial-gradient(circle, ${phaseColor}08 0%, transparent 65%)`,
          pointerEvents: "none",
        }} />

        {/* ── LEFT: Avatar + identity ── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {/* Avatar with gradient ring */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {/* Outer glow ring */}
            <div style={{
              position: "absolute", inset: -3, borderRadius: "50%",
              background: `conic-gradient(from 180deg, ${phaseColor} 0%, ${phaseColor}60 35%, transparent 60%)`,
              animation: "avatarPulse 3s ease-in-out infinite",
            }} />
            {/* Inner ring separator */}
            <div style={{
              position: "absolute", inset: 1, borderRadius: "50%",
              background: "var(--panel)",
            }} />
            {/* Avatar body */}
            <div style={{
              position: "relative",
              width: 68, height: 68, borderRadius: "50%",
              background: `linear-gradient(135deg, ${phaseColor}30 0%, ${phaseColor}18 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 900, color: phaseColor,
              letterSpacing: "-0.5px",
            }}>
              {initialsFor(firstName)}
            </div>
          </div>

          {/* Name + goals */}
          <div>
            <div style={{
              fontSize: 28, fontWeight: 900, color: "var(--text)", lineHeight: 1.1,
              letterSpacing: "-0.5px",
            }}>
              {firstName ?? "Rider"}
            </div>
            <div style={{
              fontSize: 13.5, color: "var(--muted)", lineHeight: 1.4, marginTop: 4,
              maxWidth: 320, opacity: 0.85,
            }}>
              {hasProfile ? goalLabel : "No training profile yet — click to set one up"}
            </div>
          </div>
        </div>

        {/* ── CENTER: Stats ── */}
        {hasProfile && (
          <div style={{
            position: "relative", zIndex: 1,
            display: "flex", alignItems: "center", gap: 0,
            background: "rgba(47,143,224,0.04)",
            border: "1px solid rgba(47,143,224,0.12)",
            borderRadius: 12, overflow: "hidden",
            flexWrap: "wrap",
          }}>
            {[
              ftp != null && {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
                value: `${ftp}W`,
                label: "FTP",
              },
              wPerKg != null && {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
                value: wPerKg.toFixed(1),
                label: "W/kg",
              },
              daysLabel && {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                value: daysLabel,
                label: "days / week",
              },
            ].filter(Boolean).map((stat, i, arr) => stat && (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "16px 24px",
                borderRight: i < arr.length - 1 ? "1px solid rgba(47,143,224,0.1)" : "none",
                position: "relative",
              }}>
                <div style={{ color: phaseColor, opacity: 0.75 }}>{stat.icon}</div>
                <div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: "var(--text)",
                    lineHeight: 1.05, letterSpacing: "-0.3px",
                  }}>{stat.value}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2,
                  }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RIGHT: Phase arc + Edit ── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>

          {hasProfile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              background: `linear-gradient(135deg, ${phaseColor}12 0%, ${phaseColor}06 100%)`,
              border: `1px solid ${phaseColor}30`,
              borderRadius: 12, padding: "12px 18px",
            }}>
              {/* Phase progress ring — larger, gradient stroke, glow */}
              <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                {/* Glow behind ring */}
                <div style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  boxShadow: `0 0 18px ${phaseColor}40`,
                  pointerEvents: "none",
                }} />
                <svg width={64} height={64} viewBox="0 0 64 64">
                  <defs>
                    <linearGradient id={`arcGrad-${phase}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={phaseColor} stopOpacity="1" />
                      <stop offset="100%" stopColor={phaseColor} stopOpacity="0.6" />
                    </linearGradient>
                  </defs>
                  {/* Track */}
                  <circle cx={32} cy={32} r={r} fill="none"
                    stroke="rgba(150,150,150,0.1)" strokeWidth={5} />
                  {/* Progress arc */}
                  <circle
                    cx={32} cy={32} r={r} fill="none"
                    stroke={`url(#arcGrad-${phase})`}
                    strokeWidth={5} strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - arcPct)}
                    transform="rotate(-90 32 32)"
                    style={{ filter: `drop-shadow(0 0 4px ${phaseColor}80)` }}
                  />
                  {/* Center percent */}
                  <text
                    x={32} y={37} textAnchor="middle"
                    fontSize={13} fontWeight={800}
                    fill={phaseColor}
                    style={{ fontFamily: "system-ui, sans-serif" }}
                  >{phasePct}%</text>
                </svg>
              </div>

              {/* Phase label */}
              <div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: phaseColor,
                  textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3,
                }}>
                  {PHASE_LABELS[phase]} phase
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                  Week {weekInMesocycle}
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", marginLeft: 3 }}>
                    / 4
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, opacity: 0.7 }}>
                  {4 - weekInMesocycle === 0 ? "Final week" : `${4 - weekInMesocycle} week${4 - weekInMesocycle === 1 ? "" : "s"} remaining`}
                </div>
              </div>
            </div>
          )}

          {/* Edit button */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "11px 18px", borderRadius: 10,
            background: hover
              ? `linear-gradient(135deg, ${phaseColor} 0%, ${phaseColor}cc 100%)`
              : `${phaseColor}12`,
            border: `1px solid ${hover ? phaseColor : `${phaseColor}30`}`,
            color: hover ? "#fff" : phaseColor,
            fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
            transition: "all 0.2s ease",
            boxShadow: hover ? `0 4px 14px ${phaseColor}40` : "none",
          }}>
            {hasProfile ? "Edit profile" : "Set up profile"}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
