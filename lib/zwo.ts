/**
 * Generates real Zwift .zwo workout files (the same XML format Zwift's own
 * in-game workout editor saves) from one of the AI weekly plan's workout
 * entries. This is what turns "Tuesday: Sweet Spot, 60 min, 80-90% FTP" from
 * a text suggestion into an actual structured ride Zwift can run on the
 * trainer - warmup ramp, the real interval/steady-state blocks, cooldown
 * ramp - once the rider drops the file into their own
 * Documents/Zwift/Workouts/<their Zwift id>/ folder (a browser app can't
 * write there directly; see the note in weekly-plan.tsx).
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
 * Builds the <workout> step list. Picks a step shape based on the session
 * type: a single steady block for endurance/recovery, warmup + repeated
 * on/off intervals + cooldown for anything intervals/sweet-spot/threshold/
 * VO2-flavored. Everything's sized off the session's total duration so a
 * 30-min recovery ride and a 90-min endurance ride both come out sane.
 */
function buildSteps(w: ZwoWorkoutInput): string[] {
  const totalSec = Math.max(300, Math.round(w.durationMin * 60));
  const t = w.type.toLowerCase();
  const { low, high, mid } = parsePowerRange(w.targetPowerPctFtp);
  const fmt = (n: number) => n.toFixed(2);

  if (t.includes("recover")) {
    const warm = Math.round(totalSec * 0.2);
    const main = totalSec - warm * 2;
    return [
      `<Warmup Duration="${warm}" PowerLow="0.40" PowerHigh="${fmt(mid)}"/>`,
      `<SteadyState Duration="${main}" Power="${fmt(mid)}"/>`,
      `<Cooldown Duration="${warm}" PowerLow="${fmt(mid)}" PowerHigh="0.40"/>`,
    ];
  }

  if (t.includes("interval") || t.includes("sweet") || t.includes("threshold") || t.includes("vo2")) {
    const warm = Math.round(totalSec * 0.15);
    const cool = Math.round(totalSec * 0.15);
    const mainSec = Math.max(60, totalSec - warm - cool);
    // Block length depends on flavor: short/sharp for VO2, longer/steadier
    // for threshold and sweet spot.
    const onSec = t.includes("vo2") ? 180 : t.includes("threshold") ? 480 : 300;
    const offSec = Math.round(onSec * 0.5);
    const cycle = onSec + offSec;
    const repeat = Math.max(2, Math.round(mainSec / cycle));
    const onPower = high || mid || 0.9;
    const offPower = Math.max(0.45, (low || mid || 0.6) - 0.15);
    return [
      `<Warmup Duration="${warm}" PowerLow="0.45" PowerHigh="0.70"/>`,
      `<IntervalsT Repeat="${repeat}" OnDuration="${onSec}" OffDuration="${offSec}" OnPower="${fmt(onPower)}" OffPower="${fmt(offPower)}"/>`,
      `<Cooldown Duration="${cool}" PowerLow="0.65" PowerHigh="0.40"/>`,
    ];
  }

  // Endurance / default: warmup, one long steady block at the target, cooldown.
  const warm = Math.round(totalSec * 0.1);
  const cool = Math.round(totalSec * 0.1);
  const main = totalSec - warm - cool;
  return [
    `<Warmup Duration="${warm}" PowerLow="0.45" PowerHigh="${fmt(mid)}"/>`,
    `<SteadyState Duration="${main}" Power="${fmt(mid)}"/>`,
    `<Cooldown Duration="${cool}" PowerLow="${fmt(mid)}" PowerHigh="0.45"/>`,
  ];
}

export function generateZwoXml(w: ZwoWorkoutInput, authorName = "Zwift Dashboard AI"): string {
  const steps = buildSteps(w);
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
