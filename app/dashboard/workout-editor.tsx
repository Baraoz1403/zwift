"use client";

import { useState } from "react";
import {
  ZwoBlock,
  ZwoWorkoutInput,
  generateDefaultBlocks,
  blockDurationSec,
  zoneForPowerFraction,
} from "@/lib/zwo";

/**
 * In-app workout editor - the lighter-weight alternative to copying Zwift's
 * own drag-and-drop block editor. Rebuilding that editor pixel-for-pixel
 * would duplicate a mature, free tool Zwift already gives every rider; what
 * was actually missing was a way to fine-tune the AI's suggested session
 * (durations, target power, interval repeats) without leaving this site or
 * needing a separate login/install. That's what this does - the AI's
 * suggestion (already shaped by the rider's real ride/HR history and
 * Zwift's own official-plan structure, see lib/ai.ts + lib/zwo.ts) is just
 * the starting point; the rider can adjust every number here, then export.
 * The one remaining manual step - dropping the file into Zwift's local
 * Workouts folder and opening Zwift once - is a Zwift platform limitation
 * that stays the same regardless of how this editor looks.
 */

function pct(frac: number): number {
  return Math.round(frac * 100);
}

function fracFromPct(p: number): number {
  return p / 100;
}

function minFromSec(s: number): number {
  return Math.round((s / 60) * 10) / 10;
}

function secFromMin(m: number): number {
  return Math.max(30, Math.round(m * 60));
}

function gradientFor(low: number, high: number): string {
  return `linear-gradient(90deg, ${zoneForPowerFraction(low).color}, ${zoneForPowerFraction(high).color})`;
}

function blockLabel(b: ZwoBlock): string {
  switch (b.kind) {
    case "Warmup":
      return "Warmup";
    case "Cooldown":
      return "Cooldown";
    case "SteadyState":
      return "Steady block";
    case "IntervalsT":
      return "Intervals";
  }
}

const fieldStyle = { padding: "3px 5px", fontSize: 11.5 };

interface Props {
  workout: ZwoWorkoutInput;
  onDownload: (blocks: ZwoBlock[]) => void;
}

export default function WorkoutEditor({ workout, onDownload }: Props) {
  const [blocks, setBlocks] = useState<ZwoBlock[]>(() => generateDefaultBlocks(workout));

  // Patch is intentionally loosely typed (ZwoBlock is a discriminated union,
  // so TS's Partial<> doesn't distribute over it cleanly) - every call site
  // only ever passes keys that belong to that block's own kind.
  function updateBlock(i: number, patch: Record<string, number>) {
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? ({ ...b, ...patch } as ZwoBlock) : b)));
  }

  function resetToAiSuggestion() {
    setBlocks(generateDefaultBlocks(workout));
  }

  const totalSec = blocks.reduce((s, b) => s + blockDurationSec(b), 0) || 1;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      {/* Zone-colored preview bar - same idea as Zwift's own workout-editor
          preview graph (warmup/cooldown ramps shade between zone colors,
          intervals alternate on/off), just a flat bar instead of a
          height-mapped graph. */}
      <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        {blocks.map((b, i) => {
          const widthPct = (blockDurationSec(b) / totalSec) * 100;
          if (b.kind === "IntervalsT") {
            const cycle = b.onDuration + b.offDuration || 1;
            const onWidth = b.onDuration / cycle;
            return (
              <div key={i} style={{ display: "flex", width: `${widthPct}%` }}>
                {Array.from({ length: b.repeat }).map((_, r) => (
                  <div key={r} style={{ display: "flex", width: `${100 / b.repeat}%` }}>
                    <div style={{ width: `${onWidth * 100}%`, background: zoneForPowerFraction(b.onPower).color }} />
                    <div style={{ width: `${(1 - onWidth) * 100}%`, background: zoneForPowerFraction(b.offPower).color }} />
                  </div>
                ))}
              </div>
            );
          }
          if (b.kind === "SteadyState") {
            return <div key={i} style={{ width: `${widthPct}%`, background: zoneForPowerFraction(b.power).color }} />;
          }
          return <div key={i} style={{ width: `${widthPct}%`, background: gradientFor(b.powerLow, b.powerHigh) }} />;
        })}
      </div>

      {/* Editable fields per block - numeric tweaks only (no add/remove/
          reorder of blocks in this first version) so the rider can dial in
          duration and target power without leaving the dashboard. */}
      {blocks.map((b, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11.5, marginBottom: 6 }}>
          <span style={{ width: 78, opacity: 0.7 }}>{blockLabel(b)}</span>

          {(b.kind === "Warmup" || b.kind === "Cooldown") && (
            <>
              <label>
                min{" "}
                <input
                  type="number"
                  min={1}
                  value={minFromSec(b.durationSec)}
                  onChange={(e) => updateBlock(i, { durationSec: secFromMin(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 48 }}
                />
              </label>
              <label>
                start %FTP{" "}
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={pct(b.powerLow)}
                  onChange={(e) => updateBlock(i, { powerLow: fracFromPct(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
              <label>
                end %FTP{" "}
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={pct(b.powerHigh)}
                  onChange={(e) => updateBlock(i, { powerHigh: fracFromPct(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
            </>
          )}

          {b.kind === "SteadyState" && (
            <>
              <label>
                min{" "}
                <input
                  type="number"
                  min={1}
                  value={minFromSec(b.durationSec)}
                  onChange={(e) => updateBlock(i, { durationSec: secFromMin(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 48 }}
                />
              </label>
              <label>
                %FTP{" "}
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={pct(b.power)}
                  onChange={(e) => updateBlock(i, { power: fracFromPct(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
            </>
          )}

          {b.kind === "IntervalsT" && (
            <>
              <label>
                reps{" "}
                <input
                  type="number"
                  min={1}
                  value={b.repeat}
                  onChange={(e) => updateBlock(i, { repeat: Math.max(1, Math.round(Number(e.target.value))) })}
                  style={{ ...fieldStyle, width: 42 }}
                />
              </label>
              <label>
                on (sec){" "}
                <input
                  type="number"
                  min={5}
                  value={b.onDuration}
                  onChange={(e) => updateBlock(i, { onDuration: Math.max(5, Math.round(Number(e.target.value))) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
              <label>
                off (sec){" "}
                <input
                  type="number"
                  min={5}
                  value={b.offDuration}
                  onChange={(e) => updateBlock(i, { offDuration: Math.max(5, Math.round(Number(e.target.value))) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
              <label>
                on %FTP{" "}
                <input
                  type="number"
                  min={20}
                  max={250}
                  value={pct(b.onPower)}
                  onChange={(e) => updateBlock(i, { onPower: fracFromPct(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
              <label>
                off %FTP{" "}
                <input
                  type="number"
                  min={20}
                  max={200}
                  value={pct(b.offPower)}
                  onChange={(e) => updateBlock(i, { offPower: fracFromPct(Number(e.target.value)) })}
                  style={{ ...fieldStyle, width: 50 }}
                />
              </label>
            </>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", padding: "5px 12px", fontSize: 11.5 }}
          onClick={() => onDownload(blocks)}
        >
          Download .zwo
        </button>
        <button
          type="button"
          className="btn"
          style={{ width: "auto", padding: "5px 12px", fontSize: 11.5, opacity: 0.7 }}
          onClick={resetToAiSuggestion}
        >
          Reset to AI suggestion
        </button>
      </div>
    </div>
  );
}
