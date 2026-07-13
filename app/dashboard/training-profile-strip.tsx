"use client";

import {
  type RiderTrainingProfile,
  GOAL_LABELS,
  DAYS_RANGE_LABELS,
} from "@/lib/rider-profile";

export interface TrainingProfileStripCycleInfo {
  phase: "Base" | "Build" | "Recovery" | "Taper" | "RaceWeek";
  weekInMesocycle: number;
}

/**
 * Compact, always-visible summary of the rider's training profile - shown
 * directly on the Coach page between the hero banner and the workout cards,
 * rather than only reachable via the header nav chip. Deliberately a
 * read-only summary, not a second copy of the edit form: the "Edit" button
 * reuses the exact same scroll-to + "zwift:open-training-profile" event
 * training-profile-nav-chip.tsx already uses to open the full
 * TrainingProfileCard further down the page, so there's exactly one actual
 * edit UI in the app, not two to keep in sync.
 */
export default function TrainingProfileStrip({
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
  cycleInfo: TrainingProfileStripCycleInfo | null;
}) {
  const wPerKg = ftp && weightKg && weightKg > 0 ? ftp / weightKg : null;
  const goalLabel = riderProfile?.goals?.length
    ? riderProfile.goals.map((g) => GOAL_LABELS[g]).join(" · ")
    : null;
  const daysLabel = riderProfile?.daysRange ? DAYS_RANGE_LABELS[riderProfile.daysRange] : null;

  const phase = cycleInfo?.phase ?? "Base";
  const weekInMesocycle = cycleInfo?.weekInMesocycle ?? 1;
  const progressPct = Math.min(100, Math.max(0, (weekInMesocycle / 4) * 100));

  function openEditor() {
    document.getElementById("training-profile")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.dispatchEvent(new CustomEvent("zwift:open-training-profile"));
  }

  return (
    <div
      style={{
        position: "relative",
        background: "#fff",
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        padding: "18px 28px",
        marginBottom: 32,
        maxHeight: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 28,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={openEditor}
        style={{
          position: "absolute", top: 12, right: 16,
          border: "none", background: "transparent", cursor: "pointer",
          fontSize: 12, fontWeight: 600, color: "#94a3b8",
          padding: "4px 8px", borderRadius: 6,
          fontFamily: "inherit",
        }}
      >
        Edit
      </button>

      {/* Left: athlete info */}
      <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#64748b" }}>
            {firstName ? firstName : "Rider"}
          </div>
          {(goalLabel || daysLabel) && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              {[goalLabel, daysLabel].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {ftp != null && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>{ftp}<span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}> W</span></div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>FTP</div>
          </div>
        )}

        {wPerKg != null && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>{wPerKg.toFixed(1)}</div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>W/kg</div>
          </div>
        )}
      </div>

      {/* Right: phase progress */}
      <div style={{ minWidth: 200, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: "#0f172a" }}>{phase} phase</span>
          <span style={{ color: "#64748b" }}>Week {weekInMesocycle} of 4</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progressPct}%`, background: "#3b82f6", borderRadius: 3, transition: "width 0.4s ease" }} />
        </div>
      </div>
    </div>
  );
}
