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

const PHASE_ORDER: Array<"Base" | "Build" | "Recovery" | "Taper" | "RaceWeek"> = [
  "Base", "Build", "Recovery", "Taper", "RaceWeek",
];

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
    ? riderProfile.goals.map((g) => GOAL_LABELS[g]).join("  ·  ")
    : "Building fitness";
  const daysLabel = riderProfile?.daysRange ? DAYS_RANGE_LABELS[riderProfile.daysRange] : null;

  const phaseColor = PHASE_COLORS[phase] ?? "#3b82f6";

  const r = 28;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));
  const phasePct = Math.round(arcPct * 100);

  const wkgLabel = wPerKg == null ? null
    : wPerKg < 2.5 ? "Beginner"
    : wPerKg < 3.0 ? "Novice"
    : wPerKg < 3.5 ? "Intermediate"
    : wPerKg < 4.0 ? "Trained"
    : "Advanced";

  function openEditor() {
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
  }

  return (
    <>
      <style>{`
        @keyframes phasePulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.12); }
        }
        @keyframes liveDot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
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
          width: "100%", maxWidth: 1100, margin: "0 auto 40px", boxSizing: "border-box",
          borderRadius: 16,
          border: `1px solid ${hover ? `${phaseColor}55` : "rgba(15,23,42,0.10)"}`,
          boxShadow: hover
            ? `0 16px 48px rgba(0,0,0,0.14), 0 0 0 1px ${phaseColor}22`
            : "0 4px 20px rgba(0,0,0,0.08), 0 0 0 1px rgba(47,143,224,0.08)",
          overflow: "hidden",
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          transform: hover ? "translateY(-2px)" : "translateY(0)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        }}
      >
        {/* ══════════════════════════════════════════════
            TOP HALF — dark gradient, identity section
            ══════════════════════════════════════════════ */}
        <div style={{
          padding: "26px 32px 22px",
          background: `linear-gradient(135deg, #0f172a 0%, #1e293b 50%, ${phaseColor}33 100%)`,
          position: "relative", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
        }}>
          {/* Top accent strip — full-width solid, identical to .stat-card::before */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "2.5px",
            background: phaseColor,
          }} />

          {/* Ambient glow */}
          <div style={{
            position: "absolute", top: -60, right: -40, width: 280, height: 280, borderRadius: "50%",
            background: `radial-gradient(circle, ${phaseColor}22 0%, transparent 65%)`,
            pointerEvents: "none",
            animation: "phasePulse 6s ease-in-out infinite",
          }} />

          {/* ── Identity ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative", zIndex: 1 }}>
            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                position: "absolute", inset: -2.5, borderRadius: "50%",
                background: `conic-gradient(from 180deg, ${phaseColor} 0%, ${phaseColor}44 45%, transparent 60%)`,
              }} />
              <div style={{ position: "absolute", inset: 1, borderRadius: "50%", background: "#1e293b" }} />
              <div style={{
                position: "relative",
                width: 64, height: 64, borderRadius: "50%",
                background: `linear-gradient(135deg, ${phaseColor}40, ${phaseColor}20)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, fontWeight: 900, color: "#fff",
                letterSpacing: "-0.5px",
              }}>
                {initialsFor(firstName)}
              </div>
            </div>

            {/* Name + goals */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>
                  {firstName ?? "Rider"}
                </div>
                {/* LIVE */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: `${phaseColor}30`, border: `1px solid ${phaseColor}60`,
                  borderRadius: 20, padding: "2px 8px",
                  fontSize: 9.5, fontWeight: 800, color: phaseColor,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%", background: phaseColor,
                    animation: "liveDot 2s ease-in-out infinite",
                  }} />
                  Live
                </div>
              </div>

              {/* Goals */}
              <div style={{
                fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, maxWidth: 400,
              }}>
                {hasProfile ? goalLabel : "Click to set up your training profile"}
              </div>

              {/* W/kg pill */}
              {wkgLabel && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 8, background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 6, padding: "3px 10px",
                  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.75)",
                }}>
                  <span style={{ color: phaseColor }}>▲</span>
                  {wkgLabel}
                </div>
              )}
            </div>
          </div>

          {/* ── Phase badge (top-right of dark section) ── */}
          <div style={{
            position: "relative", zIndex: 1, flexShrink: 0,
            display: "flex", alignItems: "center", gap: 14,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: "12px 18px",
          }}>
            {/* Phase arc */}
            <div style={{ position: "relative", width: 68, height: 68 }}>
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                boxShadow: `0 0 18px ${phaseColor}50`,
              }} />
              <svg width={68} height={68} viewBox="0 0 68 68">
                <defs>
                  <linearGradient id={`arcG-${phase}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={phaseColor} />
                    <stop offset="100%" stopColor={phaseColor} stopOpacity="0.5" />
                  </linearGradient>
                </defs>
                <circle cx={34} cy={34} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={5} />
                <circle cx={34} cy={34} r={r} fill="none"
                  stroke={`url(#arcG-${phase})`} strokeWidth={5} strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - arcPct)}
                  transform="rotate(-90 34 34)"
                  style={{ filter: `drop-shadow(0 0 5px ${phaseColor})` }}
                />
                <text x={34} y={39} textAnchor="middle" fontSize={13} fontWeight={900} fill={phaseColor}
                  style={{ fontFamily: "system-ui, sans-serif" }}>{phasePct}%</text>
              </svg>
            </div>

            <div>
              <div style={{
                fontSize: 10, fontWeight: 800, color: phaseColor,
                textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4,
              }}>
                {PHASE_LABELS[phase]} phase
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                Week {weekInMesocycle}
                <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.45)", marginLeft: 3 }}>/ 4</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                {4 - weekInMesocycle === 0 ? "Final week" : `${4 - weekInMesocycle} week${4 - weekInMesocycle === 1 ? "" : "s"} remaining`}
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            BOTTOM HALF — white, stats + actions
            ══════════════════════════════════════════════ */}
        <div style={{
          background: "#fff",
          padding: "20px 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 20, flexWrap: "wrap",
        }}>

          {/* Stats row */}
          {hasProfile && (
            <div style={{ display: "flex", alignItems: "stretch", gap: 0, flexWrap: "wrap" }}>
              {[
                ftp != null && {
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={phaseColor}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  ),
                  value: `${ftp}W`,
                  label: "FTP",
                },
                wPerKg != null && {
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={phaseColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                    </svg>
                  ),
                  value: wPerKg.toFixed(1),
                  label: "W/kg",
                },
                daysLabel && {
                  icon: (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={phaseColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  ),
                  value: daysLabel,
                  label: "Days / week",
                },
              ].filter(Boolean).map((stat, i, arr) => stat && (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "0 28px 0 0",
                  marginRight: i < arr.length - 1 ? 28 : 0,
                  borderRight: i < arr.length - 1 ? "1px solid rgba(15,23,42,0.10)" : "none",
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `${phaseColor}12`,
                    border: `1px solid ${phaseColor}28`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {stat.icon}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 26, fontWeight: 900, color: "#0f172a",
                      lineHeight: 1, letterSpacing: "-0.5px",
                    }}>{stat.value}</div>
                    <div style={{
                      fontSize: 10.5, fontWeight: 700, color: "#64748b",
                      textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2,
                    }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Right: phase journey + edit */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0, flexWrap: "wrap" }}>

            {/* Phase journey */}
            {hasProfile && (
              <div style={{
                display: "flex", alignItems: "center", gap: 2,
                background: "rgba(15,23,42,0.03)",
                border: "1px solid rgba(15,23,42,0.08)",
                borderRadius: 10, padding: "8px 12px",
              }}>
                {PHASE_ORDER.map((p, i) => {
                  const isActive = p === phase;
                  const isPast = PHASE_ORDER.indexOf(phase) > i;
                  const color = PHASE_COLORS[p];
                  return (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <div style={{
                        borderRadius: 6, padding: isActive ? "4px 10px" : "4px 8px",
                        background: isActive ? `${color}20` : "transparent",
                        border: `1px solid ${isActive ? `${color}55` : "transparent"}`,
                        position: "relative",
                      }}>
                        <div style={{
                          fontSize: 10, fontWeight: isActive ? 800 : 500,
                          color: isActive ? color : isPast ? `${color}99` : "#94a3b8",
                          whiteSpace: "nowrap",
                        }}>
                          {p === "RaceWeek" ? "Race" : p}
                        </div>
                        {isActive && (
                          <div style={{
                            position: "absolute", bottom: -1, left: "50%",
                            transform: "translateX(-50%)",
                            width: 3, height: 3, borderRadius: "50%",
                            background: color,
                          }} />
                        )}
                      </div>
                      {i < PHASE_ORDER.length - 1 && (
                        <div style={{ width: 8, height: 1, background: "rgba(15,23,42,0.12)" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edit button */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openEditor(); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "10px 20px", borderRadius: 9,
                background: hover
                  ? `linear-gradient(135deg, ${phaseColor} 0%, ${phaseColor}cc 100%)`
                  : "#fff",
                border: `1.5px solid ${hover ? phaseColor : "rgba(15,23,42,0.14)"}`,
                color: hover ? "#fff" : "#0f172a",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                fontFamily: "system-ui, sans-serif",
                boxShadow: hover ? `0 4px 14px ${phaseColor}40` : "none",
                transition: "all 0.2s ease",
              }}
            >
              {hasProfile ? "Edit profile" : "Set up profile"}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
