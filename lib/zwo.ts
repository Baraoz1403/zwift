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
  | { kind: "Warmup"; durationSec: number; powerLow: number; powerHigh: number }
  | { kind: "Cooldown"; durationSec: number; powerLow: number; powerHigh: number }
  | { kind: "SteadyState"; durationSec: number; power: number }
  | {
      kind: "IntervalsT";
      repeat: number;
      onDuration: number;
      offDuration: number;
      onPower: number;
      offPower: number;
    };

/** 7-tier power breakdown (Coggan zones, with Sweet Spot split out as its
 *  own band between Tempo and Threshold) - drives the editor's and workout
 *  card's zone-colored preview bars. */
export const POWER_ZONES = [
  { zone: 1, maxPct: 0.55, color: "#9aa0a6", label: "Z1" },
  { zone: 2, maxPct: 0.75, color: "#3b82f6", label: "Z2" },
  { zone: 3, maxPct: 0.88, color: "#22d3ee", label: "Z3" },
  { zone: 4, maxPct: 0.94, color: "#10b981", label: "SweetSpot" },
  { zone: 5, maxPct: 1.05, color: "#f59e0b", label: "Threshold" },
  { zone: 6, maxPct: 1.2, color: "#f97316", label: "VO2max" },
  { zone: 7, maxPct: Infinity, color: "#ef4444", label: "Sprint" },
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
  // 8 sub-samples per bar, take the peak — guarantees short sprint intervals
  // (15-second Sprint Builder bursts etc.) register as visible spikes instead
  // of being silently missed by single-midpoint sampling (which skips intervals
  // shorter than ~75s for a 50-min workout with 40 bars).
  const SUB = 8;
  for (let i = 0; i < steps; i++) {
    const t0 = (i / steps) * total;
    const t1 = ((i + 1) / steps) * total;
    let peak = 0;
    for (let j = 0; j < SUB; j++) {
      const t = t0 + ((j + 0.5) / SUB) * (t1 - t0);
      const p = powerAtTime(blocks, t);
      if (p > peak) peak = p;
    }
    samples.push(peak);
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
        // Hard cap: recovery between intervals ≤ 5 minutes (300 s).
        // If the AI outputs a longer rest, clamp it here — the prompt enforces
        // this rule upstream but the code is the last line of defence.
        const offSec = Math.min(300, b.offSec ?? onSec);
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
 * Matches the AI's running-type conventions (see WEEKLY_PLAN_SYSTEM_PROMPT's
 * "Running plan structure" section in lib/ai.ts: 'Easy Run', 'Long Run',
 * 'Tempo Run'). Used to exclude running sessions from the Intervals.icu/Zwift
 * bike-ZWO push - generateZwoXml emits <sportType>run</sportType> for run
 * workouts and <sportType>bike</sportType> for cycling. Run .zwo files must
 * be saved to Documents/Zwift/Workouts/{id}/running/ (not the main folder).
 * Running sessions are excluded from Intervals.icu/TP cycling sync but the
 * download button still works and now produces a correct run-typed file.
 */
export function isRunWorkout(type: string): boolean {
  return type.toLowerCase().includes("run");
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

/**
 * Maps a power fraction (0–1+ of FTP) to a Zwift run pace zone integer.
 * Zwift running workouts use pace="0|1|2|3" instead of power percentages:
 *   0 = WALK (recovery), 1 = JOG (easy), 2 = RUN (tempo), 3 = GO! (hard)
 * Source: zwift-workout-file-reference corpus analysis (dominant values 0–3).
 */
function powerToPaceZone(frac: number): 0 | 1 | 2 | 3 {
  if (frac <= 0.60) return 0;
  if (frac <= 0.75) return 1;
  if (frac <= 0.88) return 2;
  return 3;
}

const RUN_PRESCRIPTION: Record<0 | 1 | 2 | 3, string> = {
  0: "WALK",
  1: "JOG",
  2: "RUN",
  3: "GO!",
};

/**
 * Serialise one block as run-mode .zwo XML.
 * Run workouts use pace zones (0–3) not power fractions, and show
 * replacement_prescription text (WALK/JOG/RUN/GO!) instead of watt targets.
 * IntervalsT uses OnPace/OffPace; Warmup/Cooldown/SteadyState use pace.
 */
function blockToRunXml(b: ZwoBlock): string {
  switch (b.kind) {
    case "Warmup":
    case "Cooldown": {
      // Use the low end of the ramp as the displayed pace — warmup starts easy.
      const pace = powerToPaceZone(b.powerLow);
      return `<${b.kind} Duration="${Math.round(b.durationSec)}" pace="${pace}" replacement_prescription="${RUN_PRESCRIPTION[pace]}"/>`;
    }
    case "SteadyState": {
      const pace = powerToPaceZone(b.power);
      return `<SteadyState Duration="${Math.round(b.durationSec)}" pace="${pace}" replacement_prescription="${RUN_PRESCRIPTION[pace]}"/>`;
    }
    case "IntervalsT": {
      const onPace = powerToPaceZone(b.onPower);
      const offPace = powerToPaceZone(b.offPower);
      return `<IntervalsT Repeat="${Math.round(b.repeat)}" OnDuration="${Math.round(b.onDuration)}" OffDuration="${Math.round(b.offDuration)}" OnPace="${onPace}" OffPace="${offPace}"/>`;
    }
  }
}

function blockToXml(b: ZwoBlock, isRun = false): string {
  if (isRun) return blockToRunXml(b);
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
 * Generates personal TextEvent messages that appear on-screen during the ride.
 *
 * Messages include:
 * - Workout start personalised greeting
 * - Pre-main-set alert (30s before intervals begin)
 * - Per-repetition counter at the start of each ON phase ("Interval 3 of 8 — GO!")
 * - Water/recovery reminder at the start of each OFF phase
 * - Alert 10s before each interval begins ("Coming up in 10s…")
 * - Halfway-through total workout marker
 * - Last 5-minute warning
 * - Cooldown celebration
 */
function generateTextEvents(
  resolvedBlocks: ZwoBlock[],
  riderName: string,
): string {
  const events: { offset: number; msg: string }[] = [];
  const name = riderName || "athlete";

  // Calculate block start times
  let cursor = 0;
  const blockStarts: number[] = [];
  for (const b of resolvedBlocks) {
    blockStarts.push(cursor);
    switch (b.kind) {
      case "Warmup":
      case "Cooldown":
      case "SteadyState":
        cursor += b.durationSec;
        break;
      case "IntervalsT":
        cursor += b.repeat * (b.onDuration + b.offDuration);
        break;
    }
  }
  const totalSec = cursor || 1;

  // Workout start
  events.push({ offset: 5, msg: `Let's go, ${name}! 💪 Focus up — great session ahead.` });

  // Warmup approaching end → main set alert
  if (resolvedBlocks[0]?.kind === "Warmup") {
    const warmupEnd = blockStarts[0] + resolvedBlocks[0].durationSec;
    if (warmupEnd > 90) {
      events.push({ offset: warmupEnd - 60, msg: `${name} — main set in 1 minute. Get ready to work! 🔥` });
    }
  }

  // Per-interval messages for each IntervalsT block
  resolvedBlocks.forEach((b, blockIdx) => {
    if (b.kind !== "IntervalsT") return;
    const blockStart = blockStarts[blockIdx];
    const pct = Math.round(b.onPower * 100);
    const recPct = Math.round(b.offPower * 100);
    const onMin = Math.round(b.onDuration / 6) / 10; // 1 decimal minute
    const offMin = Math.round(b.offDuration / 6) / 10;

    // 30s before the first interval of this block
    const alertOffset = blockStart - 30;
    if (alertOffset >= 0) {
      events.push({
        offset: alertOffset,
        msg: `${name} — ${b.repeat}×${onMin}min @ ${pct}% FTP starting in 30 seconds!`,
      });
    }

    // Per-repetition messages
    for (let rep = 0; rep < b.repeat; rep++) {
      const repStart = blockStart + rep * (b.onDuration + b.offDuration);
      const recStart = repStart + b.onDuration;
      const remaining = b.repeat - rep - 1; // intervals still left after this one

      // 10s countdown before interval starts (skip rep 0 — block alert already covers it)
      if (rep > 0 && b.offDuration >= 15) {
        events.push({
          offset: recStart + b.offDuration - 10,
          msg: `${name} — interval in 10 seconds! ${remaining + 1} remaining.`,
        });
      }

      // ON phase start — interval counter
      const repLabel = rep === 0 ? "Here we go!" : rep === b.repeat - 1 ? "LAST ONE — give everything!" : "Push!";
      events.push({
        offset: repStart,
        msg: `Interval ${rep + 1} of ${b.repeat} — ${repLabel} ${pct}% FTP · ${onMin}min`,
      });

      // OFF phase start — recovery + water reminder + count remaining
      if (remaining > 0) {
        const waterMsg = (rep % 2 === 0)
          ? `💧 Drink water now, ${name}! ${remaining} interval${remaining > 1 ? "s" : ""} left · ${offMin}min recovery @ ${recPct}%`
          : `Recover & breathe, ${name}. ${remaining} more to go — you've got this! 💪`;
        events.push({ offset: recStart, msg: waterMsg });
      } else {
        // Last recovery (after final interval)
        events.push({
          offset: recStart,
          msg: `Done! 🎉 Nice work, ${name} — interval set complete. Recover well.`,
        });
      }
    }
  });

  // Halfway through total workout (only if no interval block already covers it)
  const halfwayOffset = Math.floor(totalSec / 2);
  events.push({
    offset: halfwayOffset,
    msg: `Halfway there, ${name}! You're doing great — stay consistent.`,
  });

  // 5 min before end
  if (totalSec > 600) {
    events.push({ offset: totalSec - 300, msg: `Last 5 minutes, ${name}. Finish strong — almost there!` });
  }

  // Cooldown start
  const lastBlock = resolvedBlocks[resolvedBlocks.length - 1];
  if (lastBlock?.kind === "Cooldown") {
    const coolStart = blockStarts[resolvedBlocks.length - 1];
    events.push({ offset: coolStart + 5, msg: `Cooldown, ${name} — spin easy and let the legs flush out. Outstanding session! 🏆` });
  }

  // Deduplicate (keep first at each second) and sort
  const seen = new Set<number>();
  const unique = events
    .filter(e => {
      if (e.offset < 0) return false;
      if (seen.has(Math.round(e.offset))) return false;
      seen.add(Math.round(e.offset));
      return true;
    })
    .sort((a, b) => a.offset - b.offset);

  return unique
    .map(e => `<TextEvent timeOffset="${Math.round(e.offset)}" message="${escapeXml(e.msg)}"/>`)
    .join("\n        ");
}

/**
 * Builds the actual .zwo XML. If `blocks` is omitted, falls back to
 * generateDefaultBlocks(w) - so existing callers that just want "the AI's
 * suggestion as a file" keep working unchanged. Pass the workout editor's
 * (possibly rider-edited) block list to export what the rider actually
 * tweaked instead.
 *
 * Pass `riderName` to inject personal TextEvent messages that appear on-screen
 * during the ride — rider's name, interval countdowns, encouragement, etc.
 */
export function generateZwoXml(
  w: ZwoWorkoutInput,
  blocks?: ZwoBlock[],
  authorName = "Zwift Dashboard AI",
  riderName?: string,
): string {
  const isRun = isRunWorkout(w.type);
  const resolvedBlocks = blocks ?? generateDefaultBlocks(w);
  const steps = resolvedBlocks.map((b) => blockToXml(b, isRun));
  const textEvents = riderName ? generateTextEvents(resolvedBlocks, riderName) : "";
  const sportType = isRun ? "run" : "bike";
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
    <author>${escapeXml(authorName)}</author>
    <name>${escapeXml(w.title)}</name>
    <description>${escapeXml(w.description ?? "")}</description>
    <sportType>${sportType}</sportType>
    <tags>
        <tag name="${escapeXml(w.type)}"/>
    </tags>
    <workout>
        ${textEvents ? textEvents + "\n        " : ""}${steps.join("\n        ")}
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
