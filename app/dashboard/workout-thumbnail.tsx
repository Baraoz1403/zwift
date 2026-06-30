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

export default function WorkoutThumbnail({ workout }: { workout: ZwoWorkoutInput }) {
  const blocks = generateDefaultBlocks(workout);
  const powers = sampleWorkoutPower(blocks, SAMPLES);
  const maxPower = Math.max(1.2, ...powers);
  const effort = effortForType(workout.type);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 1,
          height: 60,
          padding: "8px 6px 0",
          borderRadius: 10,
          background: "linear-gradient(180deg, #1c2b3a, #0f1922)",
        }}
      >
        {powers.map((p, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 2,
              height: `${Math.max(8, Math.min(100, (p / maxPower) * 100))}%`,
              background: zoneForPowerFraction(p).color,
              borderRadius: "1px 1px 0 0",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          padding: "5px 1px 0",
          color: "var(--muted)",
        }}
      >
        <span>{workout.durationMin} min</span>
        <span style={{ letterSpacing: 1 }}>
          {"●".repeat(effort)}
          {"○".repeat(Math.max(0, 5 - effort))}
        </span>
      </div>
    </div>
  );
}
