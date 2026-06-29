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

export interface ZwoWorkoutInput {
  title: string;
  /** e.g. "Endurance", "Sweet Spot", "Intervals", "Threshold", "VO2", "Recovery", "Rest" */
  type: string;
  durationMin: number;
  /** e.g. "65-75%" - omitted/empty for rest days. */
  targetPowerPctFtp?: string;
  description?: string;
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

/** Total duration of one block, in seconds - for IntervalsT this is the
 *  whole repeated set, not just one rep. Used both to size the preview bar
 *  and to validate the workout's overall length. */
export function blockDurationSec(b: ZwoBlock): number {
  if (b.kind === "IntervalsT") return b.repeat * (b.onDuration + b.offDuration);
  return b.durationSec;
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

function blockToXml(b: ZwoBlock): string {
  const fmt = (n: number) => n.toFixed(2);
  switch (b.kind) {
    case "Warmup":
    case "Cooldown":
      return `<${b.kind} Duration="${Math.round(b.durationSec)}" PowerLow="${fmt(b.powerLow)}" PowerHigh="${fmt(b.powerHigh)}"/>`;
    case "SteadyState":
      return `<SteadyState Duration="${Math.round(b.durationSec)}" Power="${fmt(b.power)}"/>`;
    case "IntervalsT":
      return `<IntervalsT Repeat="${Math.round(b.repeat)}" OnDuration="${Math.round(b.onDuration)}" OffDuration="${Math.round(b.offDuration)}" OnPower="${fmt(b.onPower)}" OffPower="${fmt(b.offPower)}"/>`;
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
