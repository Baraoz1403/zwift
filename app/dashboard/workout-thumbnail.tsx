"use client";

import {
  ZwoWorkoutInput,
  generateDefaultBlocks,
  sampleWorkoutPower,
  zoneForPowerFraction,
  effortForType,
} from "@/lib/zwo";

/**
 * A small preview card matching the look of Zwift's own "Custom" workouts
 * library screen (colored bar-graph thumbnail, duration, effort rating
 * underneath) - this is what the rider asked the weekly plan to show:
 * each AI-built session at a glance, the same way Zwift's own workout
 * cards look, rather than a plain text description. The graph itself is
 * generated from the exact same block data the workout editor and the
 * downloaded .zwo file use (lib/zwo.ts), so what's pictured here always
 * matches what actually gets exported.
 */

const SAMPLES = 40;

/**
 * Downsamples (or upsamples) an arbitrary-length numeric series to exactly
 * `targetLength` points by bucket-averaging - same approach as the FIT
 * detail route's own `downsample()` helper, just applied client-side here
 * so a real ride's power stream (could be thousands of points) renders at
 * the same resolution as the synthetic .zwo-block preview.
 */
function resample(samples: number[], targetLength: number): number[] {
  if (samples.length === 0) return [];
  if (samples.length === targetLength) return samples;
  const bucketSize = samples.length / targetLength;
  const result: number[] = [];
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const bucket = samples.slice(start, end);
    const avg = bucket.reduce((sum, v) => sum + v, 0) / bucket.length;
    result.push(avg);
  }
  return result;
}

export default function WorkoutThumbnail({
  workout,
  flush = false,
  realPowerSamples,
  height = 60,
  hideFooter = false,
  lightGraph = false,
}: {
  workout: ZwoWorkoutInput;
  /** When true, don't apply the -20px bleed margin. Use inside containers
   *  that already have padding:0 / overflow:hidden (completed-ride cards). */
  flush?: boolean;
  /**
   * When provided (fractions of FTP, any length - resampled to SAMPLES),
   * renders this real recorded power profile instead of inferring a shape
   * from `workout`'s type/structure. Use for a day that's already been
   * ridden - the plan's own structure may have been superseded by a later
   * regeneration (see weekly-plan.tsx's completedThumbWorkout), so it can
   * no longer be trusted to represent what actually happened that day; the
   * ride's own FIT power stream always can.
   */
  realPowerSamples?: number[];
  /** Bar-graph height in px. Default 60 (existing completed/bonus-ride
   *  cards); the redesigned planned-workout card uses a larger 160 to make
   *  the power profile the card's dominant visual element. */
  height?: number;
  /** Hides the duration/effort-dots footer strip - the redesigned planned
   *  card shows duration/TSS/IF in its own footer row instead, so repeating
   *  it here would be redundant. */
  hideFooter?: boolean;
  /** Subtle light graph background instead of the default dark gradient -
   *  used by the redesigned white planned-workout card, where a dark block
   *  reads as jarring against the card's white/shadow-only look. Completed-
   *  ride and bonus-ride thumbnails keep the original dark background. */
  lightGraph?: boolean;
}) {
  const powers = realPowerSamples && realPowerSamples.length > 0
    ? resample(realPowerSamples, SAMPLES)
    : sampleWorkoutPower(generateDefaultBlocks(workout), SAMPLES);
  const maxPower = Math.max(1.2, ...powers);
  const effort = effortForType(workout.type);
  // Where the 100%-FTP line sits, as a % up from the bottom of the graph -
  // maxPower is always >= 1.2 (see above), so this is always inside the
  // visible area, never off the top.
  const ftpLinePct = (1 / maxPower) * 100;

  return (
    <div style={flush ? undefined : { margin: "-20px -20px 0 -20px" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          gap: "1px",
          height,
          padding: "8px 0 0",
          background: lightGraph ? "#eef2f6" : "linear-gradient(180deg, #1c2b3a, #0f1922)",
        }}
      >
        {lightGraph && (
          <div style={{
            position: "absolute", left: 0, right: 0, bottom: `${ftpLinePct}%`,
            borderTop: "1px dashed rgba(0,0,0,0.18)", pointerEvents: "none", zIndex: 1,
          }} />
        )}
        {/* Zwift's own workout graph: flat, matte, contiguous blocks (a
            stepped skyline of interval segments) - not individually glossy
            floating bars. Segments touch (1px seam, not a visible gap),
            sit flush on the baseline with square corners, and get their
            definition purely from the zone color change block-to-block,
            same as the in-game workout view. */}
        {powers.map((p, i) => {
          const color = zoneForPowerFraction(p).color;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 2,
                height: `${Math.max(8, Math.min(100, (p / maxPower) * 100))}%`,
                background: color,
              }}
            />
          );
        })}
      </div>
      {!hideFooter && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            padding: "6px 20px 4px",
            color: "var(--muted)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>{workout.durationMin} min</span>
          <span style={{ letterSpacing: 1 }}>
            {"●".repeat(effort)}
            {"○".repeat(Math.max(0, 5 - effort))}
          </span>
        </div>
      )}
    </div>
  );
}
