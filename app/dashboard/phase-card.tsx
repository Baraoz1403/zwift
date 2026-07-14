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

/** Canonical training cycle order */
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
    ? riderProfile.goals.map((g) => GOAL_LABELS[g]).join(" · ")
    : "Building fitness";
  const daysLabel = riderProfile?.daysRange ? DAYS_RANGE_LABELS[riderProfile.daysRange] : null;

  const phaseColor = PHASE_COLORS[phase] ?? "#3b82f6";

  // Phase progress arc — 26px radius, centered in 64×64 viewBox
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));
  const phasePct = Math.round(arcPct * 100);

  // W/kg classification label
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
      {/* ── Keyframes injected once ── */}
      <style>{`
        @keyframes phaseGlow {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50%       { opacity: 0.85; transform: scale(1.1); }
        }
        @keyframes avatarPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${phaseColor}40; }
          50%       { box-shadow: 0 0 0 10px ${phaseColor}00; }
        }
        @keyframes liveBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
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
          background: hover
            ? `linear-gradient(135deg, var(--panel) 0%, ${phaseColor}0f 55%, ${phaseColor}06 100%)`
            : `linear-gradient(135deg, var(--panel) 0%, ${phaseColor}07 100%)`,
          borderRadius: 18,
          border: `1px solid ${hover ? `${phaseColor}55` : `${phaseColor}20`}`,
          boxShadow: hover
            ? `0 24px 56px rgba(0,0,0,0.14), 0 0 0 1px ${phaseColor}22, inset 0 1px 0 rgba(255,255,255,0.09)`
            : `0 6px 28px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.07)`,
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
        {/* ── Top accent strip — full width gradient ── */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${phaseColor} 0%, ${phaseColor}cc 35%, ${phaseColor}55 70%, ${phaseColor}11 100%)`,
          zIndex: 3,
        }} />

        {/* ── Shimmer on hover ── */}
        {hover && (
          <div style={{
            position: "absolute", top: 0, bottom: 0, width: "25%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)",
            animation: "shimmer 1.5s ease-in-out",
            pointerEvents: "none", zIndex: 1,
          }} />
        )}

        {/* ── Dot grid texture ── */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `radial-gradient(circle, ${phaseColor}18 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
          opacity: hover ? 0.65 : 0.35,
          transition: "opacity 0.3s ease",
        }} />

        {/* ── Large ambient glow top-right ── */}
        <div style={{
          position: "absolute", top: -100, right: -80, width: 380, height: 380, borderRadius: "50%",
          background: `radial-gradient(circle, ${phaseColor}15 0%, transparent 65%)`,
          pointerEvents: "none", zIndex: 0,
          animation: "phaseGlow 7s ease-in-out infinite",
        }} />

        {/* ── Secondary glow bottom-left ── */}
        <div style={{
          position: "absolute", bottom: -60, left: "25%", width: 240, height: 240, borderRadius: "50%",
          background: `radial-gradient(circle, ${phaseColor}09 0%, transparent 65%)`,
          pointerEvents: "none", zIndex: 0,
        }} />

        {/* ── LEFT: Avatar + identity ── */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {/* Avatar with gradient ring */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            {/* Conic ring */}
            <div style={{
              position: "absolute", inset: -3, borderRadius: "50%",
              background: `conic-gradient(from 180deg, ${phaseColor} 0%, ${phaseColor}55 40%, transparent 60%)`,
              animation: "avatarPulse 3s ease-in-out infinite",
            }} />
            {/* Ring separator */}
            <div style={{
              position: "absolute", inset: 1, borderRadius: "50%",
              background: "var(--panel)",
            }} />
            {/* Avatar body */}
            <div style={{
              position: "relative",
              width: 70, height: 70, borderRadius: "50%",
              background: `linear-gradient(135deg, ${phaseColor}35 0%, ${phaseColor}18 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 23, fontWeight: 900, color: phaseColor,
              letterSpacing: "-0.5px",
            }}>
              {initialsFor(firstName)}
            </div>
          </div>

          {/* Name + goals + classification */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
              <div style={{
                fontSize: 28, fontWeight: 900, color: "var(--text)", lineHeight: 1.1,
                letterSpacing: "-0.5px",
              }}>
                {firstName ?? "Rider"}
              </div>
              {/* LIVE badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                background: `${phaseColor}18`, border: `1px solid ${phaseColor}40`,
                borderRadius: 20, padding: "2px 8px",
                fontSize: 9.5, fontWeight: 800, color: phaseColor,
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: phaseColor,
                  animation: "liveBlink 2s ease-in-out infinite",
                }} />
                Live
              </div>
            </div>
            <div style={{
              fontSize: 13, color: "var(--muted)", lineHeight: 1.4, marginTop: 2,
              maxWidth: 320, opacity: 0.85,
            }}>
              {hasProfile ? goalLabel : "No training profile yet — click to set one up"}
            </div>
            {wkgLabel && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                marginTop: 7,
                background: "rgba(47,143,224,0.07)",
                border: "1px solid rgba(47,143,224,0.16)",
                borderRadius: 6, padding: "3px 9px",
                fontSize: 11, fontWeight: 700, color: "var(--muted)",
                letterSpacing: "0.04em",
              }}>
                <span style={{ color: phaseColor, fontSize: 10 }}>▲</span>
                {wkgLabel} · {wPerKg?.toFixed(1)} W/kg
              </div>
            )}
          </div>
        </div>

        {/* ── CENTER: Stats ── */}
        {hasProfile && (
          <div style={{
            position: "relative", zIndex: 2,
            display: "flex", alignItems: "stretch", gap: 0,
            background: `linear-gradient(135deg, rgba(47,143,224,0.05), rgba(47,143,224,0.02))`,
            border: "1px solid rgba(47,143,224,0.13)",
            borderRadius: 14, overflow: "hidden",
            flexWrap: "wrap",
          }}>
            {[
              ftp != null && {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                ),
                value: `${ftp}W`,
                label: "FTP",
                sub: null,
              },
              wPerKg != null && {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
                  </svg>
                ),
                value: wPerKg.toFixed(1),
                label: "W/kg",
                sub: null,
              },
              daysLabel && {
                icon: (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                ),
                value: daysLabel,
                label: "days / week",
                sub: null,
              },
            ].filter(Boolean).map((stat, i, arr) => stat && (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "16px 22px",
                borderRight: i < arr.length - 1 ? "1px solid rgba(47,143,224,0.10)" : "none",
                position: "relative",
              }}>
                {/* Subtle inner glow on icon */}
                <div style={{
                  color: phaseColor, opacity: 0.8,
                  filter: `drop-shadow(0 0 4px ${phaseColor}60)`,
                }}>{stat.icon}</div>
                <div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: "var(--text)",
                    lineHeight: 1.05, letterSpacing: "-0.3px",
                  }}>{stat.value}</div>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2,
                  }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RIGHT: Phase arc + phase journey + Edit ── */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>

          {hasProfile && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 10,
              alignItems: "stretch",
            }}>
              {/* Phase arc + label row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 14,
                background: `linear-gradient(135deg, ${phaseColor}14 0%, ${phaseColor}07 100%)`,
                border: `1px solid ${phaseColor}32`,
                borderRadius: 13, padding: "12px 18px",
              }}>
                {/* Phase progress ring */}
                <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    boxShadow: `0 0 20px ${phaseColor}44`,
                    pointerEvents: "none",
                  }} />
                  <svg width={64} height={64} viewBox="0 0 64 64">
                    <defs>
                      <linearGradient id={`arcGrad-${phase}`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={phaseColor} stopOpacity="1" />
                        <stop offset="100%" stopColor={phaseColor} stopOpacity="0.55" />
                      </linearGradient>
                    </defs>
                    {/* Track */}
                    <circle cx={32} cy={32} r={r} fill="none"
                      stroke="rgba(150,150,150,0.12)" strokeWidth={5} />
                    {/* Progress arc */}
                    <circle
                      cx={32} cy={32} r={r} fill="none"
                      stroke={`url(#arcGrad-${phase})`}
                      strokeWidth={5} strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={circumference * (1 - arcPct)}
                      transform="rotate(-90 32 32)"
                      style={{ filter: `drop-shadow(0 0 5px ${phaseColor}90)` }}
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
                    fontSize: 10.5, fontWeight: 800, color: phaseColor,
                    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3,
                  }}>
                    {PHASE_LABELS[phase]} phase
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>
                    Week {weekInMesocycle}
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", marginLeft: 3 }}>
                      / 4
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, opacity: 0.7 }}>
                    {4 - weekInMesocycle === 0
                      ? "Final week"
                      : `${4 - weekInMesocycle} week${4 - weekInMesocycle === 1 ? "" : "s"} remaining`}
                  </div>
                </div>
              </div>

              {/* Phase journey bar */}
              <div style={{
                display: "flex", alignItems: "center", gap: 3,
                background: "rgba(47,143,224,0.04)",
                border: "1px solid rgba(47,143,224,0.10)",
                borderRadius: 10, padding: "8px 12px",
              }}>
                {PHASE_ORDER.map((p, i) => {
                  const isActive = p === phase;
                  const isPast = PHASE_ORDER.indexOf(phase) > i;
                  const color = PHASE_COLORS[p];
                  return (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{
                        position: "relative",
                        borderRadius: 6,
                        padding: isActive ? "3px 9px" : "3px 7px",
                        background: isActive ? `${color}22` : isPast ? `${color}0a` : "transparent",
                        border: `1px solid ${isActive ? `${color}55` : isPast ? `${color}22` : "transparent"}`,
                        transition: "all 0.2s ease",
                      }}>
                        <div style={{
                          fontSize: 9.5, fontWeight: isActive ? 800 : 500,
                          color: isActive ? color : isPast ? `${color}99` : "var(--muted)",
                          whiteSpace: "nowrap",
                          letterSpacing: "0.04em",
                          opacity: isActive ? 1 : isPast ? 0.7 : 0.4,
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
                        <div style={{
                          width: 10, height: 1,
                          background: isPast ? `${PHASE_COLORS[PHASE_ORDER[i + 1]]}40` : "rgba(150,150,150,0.15)",
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit button */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "11px 18px", borderRadius: 11,
            background: hover
              ? `linear-gradient(135deg, ${phaseColor} 0%, ${phaseColor}cc 100%)`
              : `${phaseColor}13`,
            border: `1px solid ${hover ? phaseColor : `${phaseColor}32`}`,
            color: hover ? "#fff" : phaseColor,
            fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
            transition: "all 0.2s ease",
            boxShadow: hover ? `0 6px 18px ${phaseColor}45` : "none",
            alignSelf: "flex-start",
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
