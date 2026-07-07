/**
 * Generates real Zwift .zwo workout files (the same XML format Zwift's own
 * in-game workout editor saves) from one of the AI weekly plan's workout
 * entries. This is what turns "Tuesday: Sweet Spot, 60 min, 80-90% FTP" from
 * a text suggestion into an actual structured ride Zwift can run on the
 * trainer - warmup ramp, the real interval/steady-state blocks, cooldown
 * ramp - once the rider drops the file into their own
 * Documents/Zwift/Workouts/<their Zwift id>/ folder and opens Zwift once
 * (a browser app can't write there directly or push to the cloud itself;
 * see the note in weekly-plan.tsx).
 *
 * The AI's suggestion is only a *starting point* - generateDefaultBlocks()
 * turns it into an editable list of blocks (ZwoBlock[]) that the in-app
 * workout editor (app/dashboard/workout-editor.tsx) lets the rider tweak
 * (duration, target power, repeat count) entirely inside this site, with no
 * separate login or install. Only once they're happy with it does
 * generateZwoXml() turn those blocks into the actual file to download.
 *
 * Tag/attribute names below (Warmup, Cooldown, SteadyState, IntervalsT, plus
 * their Duration/Power/OnPower/OffPower/Repeat attributes) match the
 * documented .zwo schema - https://github.com/h4l/zwift-workout-file-reference
 */

/**
 * One structured workout block from the AI's machine-readable plan — a ramp
 * (warmup/cooldown), a flat effort (steadystate), or a repeated interval set.
 * When present on a WeeklyWorkout, these replace the type-inference logic in
 * generateDefaultBlocks so ZWO generation and thumbnail rendering reflect the
 * actual structure the coach prescribed, not a best-guess from the type name.
 */
export interface WorkoutStructureBlock {
  /** Block category */
  type: "warmup" | "steadystate" | "intervals" | "cooldown";
  /** Total duration of this block in minutes.
   *  For intervals: repeats × (onSec + offSec) / 60 */
  durationMin: number;
  /** Target power as a fraction of FTP (e.g. 0.90 = 90 % FTP). */
  powerFtp: number;
  /** For intervals only: recovery power as fraction of FTP (e.g. 0.50). */
  recoveryPowerFtp?: number;
  /** For intervals only: number of repetitions. */
  repeats?: number;
  /** For intervals only: ON duration per rep in seconds. */
  onSec?: number;
  /** For intervals only: OFF (recovery) duration per rep in seconds. */
  offSec?: number;
  /** Short human label shown in the workout card (e.g. "Easy warm-up"). */
  label: string;
}

export interface ZwoWorkoutInput {
  title: string;
  /** e.g. "Endurance", "Sweet Spot", "Intervals", "Threshold", "VO2", "Recovery", "Rest" */
  type: string;
  durationMin: number;
  /** e.g. "65-75%" - omitted/empty for rest days. */
  targetPowerPctFtp?: string;
  description?: string;
  /** Machine-readable block structure from the AI — when present,
   *  generateDefaultBlocks uses structureToBlocks() instead of type inference. */
  structure?: WorkoutStructureBlock[];
}

/**
 * One editable step of the workout. Mirrors the four .zwo step shapes this
 * app generates - a ramp (Warmup/Cooldown), a flat block (SteadyState), or a
 * repeated on/off set (IntervalsT). All power values are fractions of FTP
 * (1.00 = 100% FTP), all durations in seconds, matching the .zwo file's own
 * units - so a block straight from this array can be written out as-is.
 */
export type ZwoBlock =
  | { kind: "Warmup" | "Cooldown"; durationSec: number; powerLow: number; powerHigh: number }
  | { kind: "SteadyState"; durationSec: number; power: number }
  | {
      kind: "IntervalsT";
      repeat: number;
      onDuration: number;
      offDuration: number;
      onPower: number;
      offPower: number;
    };

/** Standard 6-zone power breakdown (Coggan zones, the same ones Zwift's own
 *  in-game UI and workout editor use) - drives the editor's zone-colored
 *  preview bar so it looks like the bars in Zwift's own "New Workout" screen. */
export const POWER_ZONES = [
  { zone: 1, maxPct: 0.55, color: "#9aa0a6", label: "Z1" },
  { zone: 2, maxPct: 0.75, color: "#3b82f6", label: "Z2" },
  { zone: 3, maxPct: 0.9, color: "#10b981", label: "Z3" },
  { zone: 4, maxPct: 1.05, color: "#eab308", label: "Z4" },
  { zone: 5, maxPct: 1.2, color: "#f97316", label: "Z5" },
  { zone: 6, maxPct: Infinity, color: "#ef4444", label: "Z6" },
] as const;

export function zoneForPowerFraction(frac: number) {
  return POWER_ZONES.find((z) => frac <= z.maxPct) ?? POWER_ZONES[POWER_ZONES.length - 1];
}

/** Power (as a fraction of FTP) at a given second into the workout - walks
 *  the block list, interpolating across a ramp or picking on/off for an
 *  interval set. Used to draw a Zwift-style bar-graph thumbnail without
 *  needing every individual second of the file. */
function powerAtTime(blocks: ZwoBlock[], t: number): number {
  let elapsed = 0;
  for (const b of blocks) {
    const dur = blockDurationSec(b);
    if (t < elapsed + dur || b === blocks[blocks.length - 1]) {
      const local = Math.max(0, t - elapsed);
      switch (b.kind) {
        case "Warmup":
        case "Cooldown": {
          const frac = dur > 0 ? Math.min(1, local / dur) : 0;
          return b.powerLow + (b.powerHigh - b.powerLow) * frac;
        }
        case "SteadyState":
          return b.power;
        case "IntervalsT": {
          const cycle = b.onDuration + b.offDuration || 1;
          const posInCycle = local % cycle;
          return posInCycle < b.onDuration ? b.onPower : b.offPower;
        }
      }
    }
    elapsed += dur;
  }
  return 0.6;
}

/** Resamples a workout's power profile into a fixed number of evenly-spaced
 *  buckets (default 40) - exactly what a small bar-graph thumbnail needs,
 *  regardless of whether the underlying workout is 20 minutes or 2 hours. */
export function sampleWorkoutPower(blocks: ZwoBlock[], steps = 40): number[] {
  const total = blocks.reduce((s, b) => s + blockDurationSec(b), 0) || 1;
  const samples: number[] = [];
  for (let i = 0; i < steps; i++) {
    samples.push(powerAtTime(blocks, ((i + 0.5) / steps) * total));
  }
  return samples;
}

/** Coarse 0-5 "how hard is this session" score, the same idea as the
 *  Effort rating Zwift shows on its own workout-library cards - derived
 *  from the session's type/category (already standardized to Zwift's own
 *  vocabulary, see generateDefaultBlocks above) rather than fabricating a
 *  precise number from a single avgPower figure. */
export function effortForType(type: string): number {
  const t = type.toLowerCase();
  if (t.includes("rest")) return 0;
  if (t.includes("recover")) return 1;
  if (t.includes("endurance") || t.includes("foundation")) return 2;
  if (t.includes("tempo")) return 3;
  if (t.includes("sweet") || t.includes("strength") || t.includes("intermittent")) return 4;
  if (t.includes("threshold") || t.includes("vo2") || t.includes("interval")) return 5;
  return 3;
}

/** Total duration of one block, in seconds - for IntervalsT this is the
 *  whole repeated set, not just one rep. Used both to size the preview bar
 *  and to validate the workout's overall length. */
export function blockDurationSec(b: ZwoBlock): number {
  if (b.kind === "IntervalsT") return b.repeat * (b.onDuration + b.offDuration);
  return b.durationSec;
}

/**
 * Converts an AI WorkoutStructureBlock array into the ZwoBlock list used for
 * ZWO file generation and thumbnail rendering.
 * Warmup ramps from 45 % → stated powerFtp; cooldown ramps back down to 40 %.
 */
export function structureToBlocks(structure: WorkoutStructureBlock[]): ZwoBlock[] {
  const blocks: ZwoBlock[] = [];
  for (const b of structure) {
    const durationSec = Math.max(60, Math.round(b.durationMin * 60));
    switch (b.type) {
      case "warmup":
        blocks.push({ kind: "Warmup", durationSec, powerLow: 0.45, powerHigh: b.powerFtp });
        break;
      case "cooldown":
        blocks.push({ kind: "Cooldown", durationSec, powerLow: b.powerFtp, powerHigh: 0.40 });
        break;
      case "steadystate":
        blocks.push({ kind: "SteadyState", durationSec, power: b.powerFtp });
        break;
      case "intervals": {
        const onSec  = b.onSec  ?? Math.round(durationSec / ((b.repeats ?? 3) * 2));
        const offSec = b.offSec ?? onSec;
        const repeat = b.repeats ?? Math.max(2, Math.round(durationSec / (onSec + offSec)));
        blocks.push({
          kind: "IntervalsT",
          repeat,
          onDuration:  onSec,
          offDuration: offSec,
          onPower:  b.powerFtp,
          offPower: b.recoveryPowerFtp ?? 0.50,
        });
        break;
      }
    }
  }
  return blocks;
}

// ─── TrainingPeaks native structured-workout wire format ──────────────────
//
// This is the piece that was missing end-to-end: pushWorkoutToTP() only ever
// sent a plain duration/TSS/description calendar entry, so TP (and therefore
// Zwift, which reads a workout's *structure* to decide whether it belongs in
// the in-game Custom Workouts menu) never saw real intervals - just a note.
// The schema below (steps/targets/intensityClass/polyline) was reverse
// engineered from the open-source trainingpeaks-mcp project
// (github.com/JamsusMaximus/trainingpeaks-mcp, src/tp_mcp/tools/structure.py)
// and confirmed against TP's public v6 workouts endpoint - `structure` is a
// JSON-*stringified* value on the workout payload, not a nested object.

export interface TPWireTarget {
  minValue: number;
  maxValue: number;
  unit?: string;
}

export interface TPWireStep {
  name: string;
  type: "step";
  length: { value: number; unit: "second" };
  targets: TPWireTarget[];
  intensityClass: "warmUp" | "active" | "rest" | "coolDown" | "other";
  openDuration: false;
}

export interface TPWireBlock {
  type: "step" | "repetition";
  length: { value: number; unit: "repetition" };
  steps: TPWireStep[];
  begin: number;
  end: number;
}

export interface TPWireStructure {
  structure: TPWireBlock[];
  polyline: number[][];
  primaryLengthMetric: "duration";
  primaryIntensityMetric: "percentOfFtp";
  primaryIntensityTargetOrRange: "range";
}

function tpStep(
  name: string,
  durationSec: number,
  powerLow: number,
  powerHigh: number,
  intensityClass: TPWireStep["intensityClass"]
): TPWireStep {
  return {
    name,
    type: "step",
    length: { value: Math.round(durationSec), unit: "second" },
    // TP wants whole percent-of-FTP values (e.g. 90, not 0.9), min/max forms
    // a *range* target - this is how a warmup/cooldown ramp is represented:
    // one step whose target ramps from powerLow to powerHigh.
    targets: [{ minValue: Math.round(powerLow * 100), maxValue: Math.round(powerHigh * 100) }],
    intensityClass,
    openDuration: false,
  };
}

/**
 * Converts our editable ZwoBlock list (the same blocks used for .zwo export
 * and the thumbnail preview) into TrainingPeaks' native structured-workout
 * wire format, ready to JSON.stringify() straight into the `structure` field
 * of a workout POST/PUT body.
 */
export function buildTPWireStructure(blocks: ZwoBlock[]): TPWireStructure {
  const wireBlocks: TPWireBlock[] = [];
  let cumulative = 0;

  for (const b of blocks) {
    const dur = blockDurationSec(b);
    const begin = cumulative;
    const end = cumulative + dur;

    if (b.kind === "IntervalsT") {
      wireBlocks.push({
        type: "repetition",
        length: { value: Math.round(b.repeat), unit: "repetition" },
        steps: [
          tpStep("Interval", b.onDuration, b.onPower, b.onPower, "active"),
          tpStep("Recovery", b.offDuration, b.offPower, b.offPower, "rest"),
        ],
        begin,
        end,
      });
    } else {
      const step =
        b.kind === "Warmup"
          ? tpStep("Warm up", dur, b.powerLow, b.powerHigh, "warmUp")
          : b.kind === "Cooldown"
          ? tpStep("Cool down", dur, b.powerLow, b.powerHigh, "coolDown")
          : tpStep("Steady state", dur, b.power, b.power, "active");
      wireBlocks.push({
        type: "step",
        length: { value: 1, unit: "repetition" },
        steps: [step],
        begin,
        end,
      });
    }
    cumulative = end;
  }

  // Polyline: normalized-time rectangular bars (drop-to-0 → rise → hold →
  // drop-to-0), one per elemental step - matches TP's own chart-drawing
  // convention. Uses each step's *peak* intensity for the bar height, same
  // simplification TP's own builder output uses for ramps.
  const totalDuration = cumulative || 1;
  const polyline: number[][] = [];
  let t = 0;
  const bar = (durSec: number, peakFrac: number) => {
    const tStart = t / totalDuration;
    t += durSec;
    const tEnd = t / totalDuration;
    polyline.push([round4(tStart), 0], [round4(tStart), round4(peakFrac)], [round4(tEnd), round4(peakFrac)], [round4(tEnd), 0]);
  };
  for (const b of blocks) {
    if (b.kind === "IntervalsT") {
      for (let r = 0; r < b.repeat; r++) {
        bar(b.onDuration, b.onPower);
        bar(b.offDuration, b.offPower);
      }
    } else if (b.kind === "SteadyState") {
      bar(b.durationSec, b.power);
    } else {
      bar(b.durationSec, b.powerHigh);
    }
  }

  return {
    structure: wireBlocks,
    polyline,
    primaryLengthMetric: "duration",
    primaryIntensityMetric: "percentOfFtp",
    primaryIntensityTargetOrRange: "range",
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Approximate IF/TSS from a block list - same NP-style 4th-power-weighted
 *  formula TP itself (and trainingpeaks-mcp) uses, so the value we send as
 *  tssPlanned/ifPlanned roughly matches what TP would compute on its own. */
export function computeIfTss(blocks: ZwoBlock[]): { intensityFactor: number; tss: number; totalSec: number } {
  let weightedSum = 0;
  let totalSec = 0;
  const add = (durSec: number, powerFrac: number) => {
    weightedSum += durSec * Math.pow(powerFrac, 4);
    totalSec += durSec;
  };
  for (const b of blocks) {
    if (b.kind === "IntervalsT") {
      for (let r = 0; r < b.repeat; r++) {
        add(b.onDuration, b.onPower);
        add(b.offDuration, b.offPower);
      }
    } else if (b.kind === "SteadyState") {
      add(b.durationSec, b.power);
    } else {
      add(b.durationSec, (b.powerLow + b.powerHigh) / 2);
    }
  }
  if (totalSec === 0) return { intensityFactor: 0, tss: 0, totalSec: 0 };
  const intensityFactor = Math.pow(weightedSum / totalSec, 0.25);
  const tss = (totalSec * intensityFactor * intensityFactor * 100) / 3600;
  return {
    intensityFactor: Math.round(intensityFactor * 1000) / 1000,
    tss: Math.round(tss * 10) / 10,
    totalSec,
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "65-75%" -> {low: 0.65, high: 0.75, mid: 0.70}. Falls back to a gentle
 *  endurance default when no usable number is present (e.g. rest days). */
function parsePowerRange(pct?: string): { low: number; high: number; mid: number } {
  const nums = pct?.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length === 0) return { low: 0.6, high: 0.6, mid: 0.6 };
  if (nums.length === 1) {
    const v = nums[0] / 100;
    return { low: v, high: v, mid: v };
  }
  const low = nums[0] / 100;
  const high = nums[1] / 100;
  return { low, high, mid: (low + high) / 2 };
}

export function isRestDay(type: string): boolean {
  return type.toLowerCase().includes("rest");
}

/**
 * Turns the AI's plain-language suggestion (type + duration + target power)
 * into a concrete, editable block list - a single steady block for
 * endurance/tempo/recovery, warmup + repeated on/off intervals + cooldown
 * for anything sweet-spot/threshold/VO2/strength/intermittent-flavored.
 * This is exactly what used to be hardcoded straight to XML; now it's the
 * *starting point* the workout editor lets the rider adjust before export.
 */
export function generateDefaultBlocks(w: ZwoWorkoutInput): ZwoBlock[] {
  // When the AI has provided a machine-readable structure, use it directly —
  // much more accurate than inferring structure from the type string alone.
  if (w.structure && w.structure.length > 0) {
    return structureToBlocks(w.structure);
  }

  const totalSec = Math.max(300, Math.round(w.durationMin * 60));
  const t = w.type.toLowerCase();
  const { low, high, mid } = parsePowerRange(w.targetPowerPctFtp);

  if (t.includes("recover")) {
    const warm = Math.round(totalSec * 0.2);
    const main = totalSec - warm * 2;
    return [
      { kind: "Warmup", durationSec: warm, powerLow: 0.4, powerHigh: mid },
      { kind: "SteadyState", durationSec: main, power: mid },
      { kind: "Cooldown", durationSec: warm, powerLow: mid, powerHigh: 0.4 },
    ];
  }

  // Strength/sprint work (Zwift's own "Strength training" category - short,
  // near-maximal neuromuscular efforts with long recovery between, e.g.
  // 5-8x 15s sprints) - very different shape from threshold/VO2 work, so it
  // needs its own short on / long off cycle instead of a longer interval.
  if (t.includes("strength") || t.includes("sprint") || t.includes("neuromuscular")) {
    const warm = Math.round(totalSec * 0.25);
    const cool = Math.round(totalSec * 0.25);
    const mainSec = Math.max(60, totalSec - warm - cool);
    const onDuration = 15;
    const offDuration = 105;
    const repeat = Math.max(3, Math.round(mainSec / (onDuration + offDuration)));
    const onPower = Math.max(high || mid || 1.5, 1.5);
    return [
      { kind: "Warmup", durationSec: warm, powerLow: 0.45, powerHigh: 0.65 },
      { kind: "IntervalsT", repeat, onDuration, offDuration, onPower, offPower: 0.5 },
      { kind: "Cooldown", durationSec: cool, powerLow: 0.55, powerHigh: 0.4 },
    ];
  }

  // Short, sharp on/off work (Zwift's "Intermittent" category) - shorter
  // cycle than a sweet-spot/threshold/VO2 block, e.g. 30s on / 30s off.
  if (t.includes("intermittent") || t.includes("micro")) {
    const warm = Math.round(totalSec * 0.15);
    const cool = Math.round(totalSec * 0.15);
    const mainSec = Math.max(60, totalSec - warm - cool);
    const onDuration = 30;
    const offDuration = 30;
    const repeat = Math.max(4, Math.round(mainSec / (onDuration + offDuration)));
    const onPower = high || mid || 1.1;
    const offPower = Math.max(0.4, (low || mid || 0.5) - 0.1);
    return [
      { kind: "Warmup", durationSec: warm, powerLow: 0.45, powerHigh: 0.7 },
      { kind: "IntervalsT", repeat, onDuration, offDuration, onPower, offPower },
      { kind: "Cooldown", durationSec: cool, powerLow: 0.6, powerHigh: 0.4 },
    ];
  }

  if (t.includes("interval") || t.includes("sweet") || t.includes("threshold") || t.includes("vo2")) {
    const warm = Math.round(totalSec * 0.15);
    const cool = Math.round(totalSec * 0.15);
    const mainSec = Math.max(60, totalSec - warm - cool);
    // Block length depends on flavor: short/sharp for VO2, longer/steadier
    // for threshold and sweet spot.
    const onDuration = t.includes("vo2") ? 180 : t.includes("threshold") ? 480 : 300;
    const offDuration = Math.round(onDuration * 0.5);
    const repeat = Math.max(2, Math.round(mainSec / (onDuration + offDuration)));
    const onPower = high || mid || 0.9;
    const offPower = Math.max(0.45, (low || mid || 0.6) - 0.15);
    return [
      { kind: "Warmup", durationSec: warm, powerLow: 0.45, powerHigh: 0.7 },
      { kind: "IntervalsT", repeat, onDuration, offDuration, onPower, offPower },
      { kind: "Cooldown", durationSec: cool, powerLow: 0.65, powerHigh: 0.4 },
    ];
  }

  // Endurance / Tempo / Foundation / default: warmup, one long steady block,
  // cooldown.
  const warm = Math.round(totalSec * 0.1);
  const cool = Math.round(totalSec * 0.1);
  const main = totalSec - warm - cool;
  return [
    { kind: "Warmup", durationSec: warm, powerLow: 0.45, powerHigh: mid },
    { kind: "SteadyState", durationSec: main, power: mid },
    { kind: "Cooldown", durationSec: cool, powerLow: mid, powerHigh: 0.45 },
  ];
}

/**
 * Suggested cadence (rpm) for an interval's ON phase, keyed to how hard the
 * effort is. This exists specifically to reduce ERG-mode "death spiral" risk
 * (cadence sags under a sudden high resistance target -> trainer raises
 * resistance further to hold watts at the now-lower cadence -> cadence sags
 * more -> pedals become extremely hard to turn, which is what a rider
 * experiences as "pedals nearly locking up"). Zwift's own IntervalsT element
 * supports Cadence/CadenceLow/CadenceHigh (see zwift-workout-file-reference)
 * as an on-screen target the rider can actively hold into - it does not
 * override ERG's own resistance control, but giving the rider a concrete
 * cadence to spin at during the hard phase is the standard real-world
 * mitigation for entering a hard interval already under-cadence.
 */
function suggestedOnCadence(onPowerFtp: number): number {
  if (onPowerFtp >= 1.05) return 95; // VO2max/anaerobic - spin, don't grind
  if (onPowerFtp >= 0.88) return 90; // threshold/sweet spot
  return 85;
}

function blockToXml(b: ZwoBlock): string {
  const fmt = (n: number) => n.toFixed(2);
  switch (b.kind) {
    case "Warmup":
    case "Cooldown":
      return `<${b.kind} Duration="${Math.round(b.durationSec)}" PowerLow="${fmt(b.powerLow)}" PowerHigh="${fmt(b.powerHigh)}"/>`;
    case "SteadyState":
      // NOTE: there is no real "OverrideWithSlopeTarget" attribute in
      // Zwift's .zwo schema (it used to be set here but does nothing - see
      // https://github.com/h4l/zwift-workout-file-reference, SteadyState's
      // real attribute list has no such field). Power-targeted blocks like
      // this one already run in ERG mode by default whenever the rider's
      // own Zwift ERG setting is on; there is no file-level flag needed or
      // available to force it further.
      return `<SteadyState Duration="${Math.round(b.durationSec)}" Power="${fmt(b.power)}"/>`;
    case "IntervalsT": {
      const cadence = suggestedOnCadence(b.onPower);
      return `<IntervalsT Repeat="${Math.round(b.repeat)}" OnDuration="${Math.round(b.onDuration)}" OffDuration="${Math.round(b.offDuration)}" OnPower="${fmt(b.onPower)}" OffPower="${fmt(b.offPower)}" Cadence="${cadence}" CadenceResting="85"/>`;
    }
  }
}

/**
 * Builds the actual .zwo XML. If `blocks` is omitted, falls back to
 * generateDefaultBlocks(w) - so existing callers that just want "the AI's
 * suggestion as a file" keep working unchanged. Pass the workout editor's
 * (possibly rider-edited) block list to export what the rider actually
 * tweaked instead.
 */
export function generateZwoXml(
  w: ZwoWorkoutInput,
  blocks?: ZwoBlock[],
  authorName = "Zwift Dashboard AI"
): string {
  const steps = (blocks ?? generateDefaultBlocks(w)).map(blockToXml);
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>${escapeXml(authorName)}</author>
    <name>${escapeXml(w.title)}</name>
    <description>${escapeXml(w.description ?? "")}</description>
    <sportType>bike</sportType>
    <tags>
        <tag name="${escapeXml(w.type)}"/>
    </tags>
    <workout>
        ${steps.join("\n        ")}
    </workout>
</workout_file>
`;
}

/** "2026-07-01" + "Sweet Spot Intervals" -> "2026-07-01-sweet-spot-intervals.zwo" */
export function zwoFileName(date: string | undefined, title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `${date ?? "plan"}-${slug || "workout"}.zwo`;
}
