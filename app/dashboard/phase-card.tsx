"use client";

import { useState } from "react";
import { type RiderTrainingProfile, GOAL_LABELS, DAYS_RANGE_LABELS } from "@/lib/rider-profile";

export interface PhaseCardCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
}

const ACCENT = "#3b82f6";

function initialsFor(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Profile strip - the rider's own numbers at a glance, directly under the
 * hero banner. Big, spacious, and the *entire* card is a click target that
 * opens the training-profile edit form inline (via TrainingProfileCard,
 * rendered directly below this card in weekly-plan.tsx) instead of
 * scrolling to the bottom of the page.
 *
 * White/light background, not dark - two stacked dark blocks (this + the
 * hero banner right above it) read as too much solid black on the page.
 * Only the hero banner keeps the dark "premium banner" treatment per
 * DESIGN-SYSTEM.md; everything below it, including this strip, stays on
 * the site's normal light card language (white bg, blue accent, subtle
 * shadow) - same family as every other stat-card on the page.
 *
 * Edit form itself still lives in training-profile.tsx / TrainingProfileCard
 * - this component only decides WHEN it opens (dispatches the same
 * "zwift:open-training-profile" event it always has) and shows the at-a-
 * glance summary + a friendly first-run prompt when there's no profile yet.
 */
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

  const r = 19;
  const circumference = 2 * Math.PI * r;
  const arcPct = Math.min(1, Math.max(0, weekInMesocycle / 4));

  function openEditor() {
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
  }

  const pill = (icon: React.ReactNode, value: string, label: string) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.14)",
      borderRadius: 14, padding: "12px 20px", minWidth: 108,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: `${ACCENT}18`, display: "flex", alignItems: "center", justifyContent: "center",
        color: ACCENT,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", lineHeight: 1.05 }}>{value}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.2, fontWeight: 600, letterSpacing: "0.02em" }}>{label}</div>
      </div>
    </div>
  );

  return (
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
        background: "var(--panel)",
        borderRadius: 20,
        border: `1px solid ${hover ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
        borderTop: `4px solid ${ACCENT}`,
        boxShadow: hover
          ? "0 12px 32px rgba(47,143,224,0.14), 0 4px 14px rgba(0,0,0,0.06)"
          : "0 4px 24px rgba(0,0,0,0.06)",
        position: "relative",
        overflow: "hidden",
        marginBottom: 40,
        minHeight: 128,
        fontFamily: "system-ui, sans-serif",
        padding: "26px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        flexWrap: "wrap",
        cursor: "pointer",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div style={{
        position: "absolute", top: -80, right: "10%", width: 280, height: 280, borderRadius: "50%",
        background: `radial-gradient(circle,${ACCENT}0c,transparent 70%)`, pointerEvents: "none",
      }} />

      {/* Left: avatar + name + goal */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: `${ACCENT}15`, border: `2px solid ${ACCENT}45`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 21, fontWeight: 800, color: ACCENT, flexShrink: 0,
        }}>
          {initialsFor(firstName)}
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", lineHeight: 1.2, letterSpacing: "-0.3px" }}>
            {firstName ?? "Rider"}
          </div>
          <div style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.3, marginTop: 2 }}>
            {hasProfile ? goalLabel : "No training profile yet — click to set one up"}
          </div>
        </div>
      </div>

      {/* Center: metric pills — only once there's something real to show */}
      {hasProfile && (
        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          {ftp != null && pill(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
            `${ftp}W`, "FTP",
          )}
          {wPerKg != null && pill(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
            wPerKg.toFixed(1), "W/kg",
          )}
          {daysLabel && pill(
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            daysLabel, "days/week",
          )}
        </div>
      )}

      {/* Right: phase badge + progress arc + edit affordance */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        {hasProfile && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: `${ACCENT}0f`, border: `1px solid ${ACCENT}30`,
            borderRadius: 24, padding: "8px 16px",
          }}>
            <svg width={42} height={42} viewBox="0 0 42 42">
              <circle cx={21} cy={21} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth={5} />
              <circle
                cx={21} cy={21} r={r} fill="none"
                stroke={ACCENT} strokeWidth={5} strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - arcPct)}
                transform="rotate(-90 21 21)"
              />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>
              {phase.toUpperCase()} · WEEK {weekInMesocycle}/4
            </span>
          </div>
        )}

        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 12,
            background: hover ? ACCENT : "rgba(59,130,246,0.08)",
            border: `1px solid ${hover ? ACCENT : "rgba(59,130,246,0.25)"}`,
            color: hover ? "#fff" : ACCENT,
            fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
            transition: "all 0.2s ease",
          }}
        >
          {hasProfile ? "Edit profile" : "Set up profile"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
