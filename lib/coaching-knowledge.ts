/**
 * Cycling coaching knowledge base — curated workout library and periodization
 * principles for generating professional training plans.
 *
 * This file serves two purposes:
 *  1. Reference: human-readable documentation of every named workout protocol.
 *  2. Source: the condensed WORKOUT_LIBRARY_PROMPT constant is injected into
 *     the AI system prompt in lib/ai.ts to make plans feel like real coaching,
 *     not generic AI output.
 *
 * Every workout here is drawn from established protocols:
 *  - Zwift's official plans (FTP Builder, Build Me Up, Zwift Academy)
 *  - Coggan / Allen power-based training zones
 *  - Norwegian VO2max model (Seiler & Tønnessen)
 *  - TrainerRoad / Sufferfest canonical interval formats
 */

// ─── Coggan 7-Zone Power Model ─────────────────────────────────────────────
export const POWER_ZONES = {
  Z1: { name: "Active Recovery",       pctFtp: "< 55%",    feel: "effortless, conversational" },
  Z2: { name: "Endurance",             pctFtp: "56-75%",   feel: "easy, full sentences" },
  Z3: { name: "Tempo",                 pctFtp: "76-90%",   feel: "moderately hard, 3-4 words" },
  Z4: { name: "Lactate Threshold",     pctFtp: "91-105%",  feel: "hard, single words" },
  Z5: { name: "VO2max",               pctFtp: "106-120%", feel: "very hard, 1-2 min sustainable" },
  Z6: { name: "Anaerobic Capacity",    pctFtp: "121-150%", feel: "maximal, 30-90 s sustainable" },
  Z7: { name: "Neuromuscular Power",   pctFtp: "> 150%",   feel: "all-out sprint, < 30 s" },
} as const;

// ─── Named Workout Library ──────────────────────────────────────────────────

export type WorkoutCategory =
  | "recovery" | "endurance" | "tempo" | "sweetspot"
  | "threshold" | "vo2max" | "neuromuscular" | "intermittent";

export interface NamedWorkout {
  name: string;
  category: WorkoutCategory;
  /** Total ride time in minutes. */
  durationMin: number;
  /** Approximate Training Stress Score (IF² × hours × 100). */
  tss: number;
  /** One-sentence coaching rationale — the "why this workout" for the rider. */
  rationale: string;
  /** Human-readable structure (used in the system prompt). */
  structure: string;
  tags: string[];
}

export const WORKOUT_LIBRARY: NamedWorkout[] = [

  // ── RECOVERY ─────────────────────────────────────────────────────────────
  {
    name: "Spin & Recover",
    category: "recovery",
    durationMin: 30,
    tss: 20,
    rationale: "Active recovery — flush metabolic waste from yesterday's effort without adding new training stress.",
    structure: "30 min continuous @ 50-60% FTP, 90+ rpm, no structure",
    tags: ["recovery", "beginner-friendly"],
  },
  {
    name: "Easy Flush",
    category: "recovery",
    durationMin: 45,
    tss: 30,
    rationale: "Promotes blood flow and lactate clearance; the day after hard efforts this is often more valuable than complete rest.",
    structure: "10 min easy build → 25 min Z1 @ 55% FTP → 10 min cooldown",
    tags: ["recovery"],
  },

  // ── ENDURANCE / FOUNDATION ─────────────────────────────────────────────
  {
    name: "Foundation Ride",
    category: "endurance",
    durationMin: 60,
    tss: 60,
    rationale: "Builds mitochondrial density and fat-oxidation enzymes — the aerobic base every plan rests on.",
    structure: "10 min warmup → 40 min Z2 @ 65-73% FTP (conversational pace) → 10 min cooldown",
    tags: ["aerobic-base", "beginner-friendly", "zwift-ftp-builder"],
  },
  {
    name: "Long Endurance",
    category: "endurance",
    durationMin: 90,
    tss: 90,
    rationale: "Extended aerobic volume at truly easy pace; trains the body to spare glycogen and run on fat.",
    structure: "15 min warmup → 65 min Z2 @ 65-73% FTP → 10 min cooldown",
    tags: ["aerobic-base", "volume"],
  },
  {
    name: "Z2 with Cadence Drills",
    category: "endurance",
    durationMin: 60,
    tss: 58,
    rationale: "Foundation ride with short high-cadence inserts (100-110 rpm) to improve pedaling efficiency.",
    structure: "10 min warmup → 4× (8 min Z2 @ 68% + 2 min @ 100 rpm / 65%) → 10 min cooldown",
    tags: ["aerobic-base", "technique"],
  },

  // ── TEMPO ─────────────────────────────────────────────────────────────────
  {
    name: "Tempo Cruise",
    category: "tempo",
    durationMin: 60,
    tss: 72,
    rationale: "Trains lactate clearance and glycogen storage; comfortably uncomfortable — 3-4 word sentences only.",
    structure: "10 min warmup → 2×15 min @ 78-83% FTP (5 min recovery) → 15 min cooldown",
    tags: ["tempo", "z3", "zwift-ftp-builder"],
  },
  {
    name: "Tempo Ladder",
    category: "tempo",
    durationMin: 75,
    tss: 90,
    rationale: "Progressively longer blocks teach the body to sustain Z3 for extended periods; the final block is the stimulus.",
    structure: "12 min warmup → 10 min + 15 min + 20 min @ 80% FTP (5 min recovery each) → 13 min cooldown",
    tags: ["tempo", "progression"],
  },

  // ── SWEET SPOT ────────────────────────────────────────────────────────────
  {
    name: "Sweet Spot Classic",
    category: "sweetspot",
    durationMin: 60,
    tss: 78,
    rationale: "The most time-efficient training zone (88-93% FTP): hard enough to drive FTP adaptation, easy enough to recover in 24-48 h — the engine of Zwift's Build Me Up plan.",
    structure: "12 min warmup → 3×10 min @ 88-93% FTP (4 min recovery) → 14 min cooldown",
    tags: ["sweetspot", "ftp-builder", "zwift-build-me-up"],
  },
  {
    name: "Extended Sweet Spot",
    category: "sweetspot",
    durationMin: 75,
    tss: 100,
    rationale: "Two long sweet-spot blocks; extended time at 88-92% FTP drives significant aerobic adaptation without the recovery cost of true threshold work.",
    structure: "15 min warmup → 2×20 min @ 88-92% FTP (8 min recovery) → 12 min cooldown",
    tags: ["sweetspot", "ftp-builder", "advanced"],
  },
  {
    name: "Sweet Spot Progression",
    category: "sweetspot",
    durationMin: 70,
    tss: 90,
    rationale: "Building blocks (10→15→20 min) apply progressive overload within a single session — each block harder than the last.",
    structure: "12 min warmup → 10 min + 15 min + 20 min @ 90% FTP (5 min recovery each) → 8 min cooldown",
    tags: ["sweetspot", "progression"],
  },

  // ── THRESHOLD ─────────────────────────────────────────────────────────────
  {
    name: "Threshold Development",
    category: "threshold",
    durationMin: 60,
    tss: 82,
    rationale: "Short blocks directly at lactate turn point; 6-8 minutes is long enough to stress the system, short enough to complete with quality.",
    structure: "12 min warmup → 4×8 min @ 97-102% FTP (4 min recovery) → 12 min cooldown",
    tags: ["threshold", "ftp-builder", "zwift-ftp-builder"],
  },
  {
    name: "2×20 FTP Blocks",
    category: "threshold",
    durationMin: 70,
    tss: 98,
    rationale: "The classic FTP test substitute; two sustained 20-minute blocks at threshold teach the body to hold race pace for long durations.",
    structure: "15 min warmup → 2×20 min @ 97-100% FTP (8 min recovery) → 7 min cooldown",
    tags: ["threshold", "advanced", "classic"],
  },
  {
    name: "Over-Under Intervals",
    category: "threshold",
    durationMin: 65,
    tss: 92,
    rationale: "Alternating just above and just below FTP trains the body to clear lactate while sustaining high power — the hardest threshold variant, and highly effective.",
    structure: "12 min warmup → 3×9 min (3 min @ 105% / 3 min @ 93% cycling) (5 min recovery) → 11 min cooldown",
    tags: ["threshold", "advanced", "over-under"],
  },

  // ── VO2MAX ────────────────────────────────────────────────────────────────
  {
    name: "Norwegian 4×4",
    category: "vo2max",
    durationMin: 60,
    tss: 90,
    rationale: "Gold-standard VO2max protocol from Norwegian sport science; four 4-minute blocks at 106-110% FTP raise aerobic ceiling more efficiently than any other protocol.",
    structure: "12 min warmup → 4×4 min @ 106-110% FTP (4 min recovery) → 16 min cooldown",
    tags: ["vo2max", "norwegian", "advanced"],
  },
  {
    name: "5×5 VO2max",
    category: "vo2max",
    durationMin: 70,
    tss: 100,
    rationale: "Five 5-minute blocks at VO2max intensity; 5 minutes is the sweet spot — long enough to fully stress the aerobic system, short enough to complete all five with quality.",
    structure: "15 min warmup → 5×5 min @ 108-112% FTP (5 min recovery) → 5 min cooldown",
    tags: ["vo2max", "zwift-build-me-up"],
  },
  {
    name: "Micro Intervals",
    category: "vo2max",
    durationMin: 55,
    tss: 80,
    rationale: "Short 1-minute bursts at high intensity accumulate VO2max stress without the pacing discipline required by longer intervals — great entry point to VO2max work.",
    structure: "12 min warmup → 12×1 min @ 115-120% FTP (1 min recovery) → 19 min cooldown",
    tags: ["vo2max", "short-intervals"],
  },

  // ── NEUROMUSCULAR / STRENGTH ──────────────────────────────────────────────
  {
    name: "Sprint Builder",
    category: "neuromuscular",
    durationMin: 50,
    tss: 50,
    rationale: "15-20 second maximal efforts recruit fast-twitch muscle fibers you won't touch in any endurance session — essential for neuromuscular development even in base phase.",
    structure: "15 min warmup → 8×15 s ALL OUT (2.5 min recovery) → 15 min Z2 flush",
    tags: ["neuromuscular", "sprint", "zwift-ftp-builder", "base-phase-ok"],
  },

  // ── INTERMITTENT ──────────────────────────────────────────────────────────
  {
    name: "30/30 Blitz",
    category: "intermittent",
    durationMin: 60,
    tss: 78,
    rationale: "30s hard / 30s easy hits both aerobic and anaerobic systems simultaneously; a metabolic double-hit that's more forgiving than sustained VO2max work.",
    structure: "12 min warmup → 3 sets of 8×(30 s @ 120% / 30 s @ 50%) with 5 min set recovery → 14 min cooldown",
    tags: ["intermittent", "zwift-ftp-builder"],
  },
];

// ─── Phase Workout Selection ────────────────────────────────────────────────
export const PHASE_GUIDELINES = {
  Base: {
    focus: "aerobic foundation",
    primary: ["Foundation Ride", "Long Endurance", "Z2 with Cadence Drills", "Sprint Builder"],
    supporting: ["Tempo Cruise", "Easy Flush"],
    avoid: ["2×20 FTP Blocks", "Norwegian 4×4", "Over-Under Intervals", "5×5 VO2max"],
    note: "80% Z1-Z2 volume. Sprint Builder is acceptable in Base — short maximal efforts don't create lactate accumulation.",
  },
  Build: {
    focus: "FTP and VO2max development",
    primary: ["Sweet Spot Classic", "Extended Sweet Spot", "Threshold Development", "Norwegian 4×4"],
    supporting: ["Foundation Ride", "Tempo Cruise", "30/30 Blitz"],
    avoid: [],
    note: "Progressive overload. Introduce sweet-spot/threshold in early Build; add VO2max in mid/late Build.",
  },
  Recovery: {
    focus: "adaptation and regeneration",
    primary: ["Spin & Recover", "Easy Flush", "Foundation Ride"],
    supporting: ["Tempo Cruise"],
    avoid: ["Threshold Development", "2×20 FTP Blocks", "Norwegian 4×4", "5×5 VO2max", "Over-Under Intervals"],
    note: "Volume cut 40-60%. At most one short quality session (Tempo Cruise). The body adapts during recovery.",
  },
} as const;

/**
 * Condensed workout library injected into the AI system prompt.
 * Keep this in sync with WORKOUT_LIBRARY above.
 */
export const WORKOUT_LIBRARY_PROMPT = `
NAMED WORKOUT PROTOCOLS — always use these exact names as session titles. Plans should feel curated by a professional coach, not generated by an algorithm. For each session, explain WHY this specific protocol benefits this rider today, not just what it is.

RECOVERY:
• "Spin & Recover" — 30 min, 50-60% FTP, 90+ rpm, no structure. Goal: flush metabolic waste without adding load.
• "Easy Flush" — 45 min (10 warmup → 25 Z1 @ 55% → 10 cooldown). Goal: lactate clearance after hard efforts.

ENDURANCE / FOUNDATION:
• "Foundation Ride" — 60 min (10 warmup → 40 min Z2 @ 68% FTP → 10 cooldown). Core aerobic base builder.
• "Long Endurance" — 90 min (15 warmup → 65 min Z2 @ 65-73% FTP → 10 cooldown). High-volume aerobic stimulus.
• "Z2 with Cadence Drills" — 60 min, Z2 with 4×2 min inserts @ 100-110 rpm to improve pedaling efficiency.

TEMPO (Z3):
• "Tempo Cruise" — 60 min (10 warmup → 2×15 min @ 80% FTP / 5 min recovery → 15 cooldown). Lactate clearance.
• "Tempo Ladder" — 75 min (12 warmup → 10+15+20 min @ 80% FTP / 5 min recovery each → 13 cooldown). Progressive Z3.

SWEET SPOT (88-93% FTP — most time-efficient training zone):
• "Sweet Spot Classic" — 60 min (12 warmup → 3×10 min @ 90% / 4 min recovery → 14 cooldown).
• "Extended Sweet Spot" — 75 min (15 warmup → 2×20 min @ 90% / 8 min recovery → 12 cooldown). High-stimulus.
• "Sweet Spot Progression" — 70 min (12 warmup → 10+15+20 min @ 90% / 5 min recovery each → 8 cooldown).

THRESHOLD (97-105% FTP):
• "Threshold Development" — 60 min (12 warmup → 4×8 min @ 100% / 4 min recovery → 12 cooldown).
• "2×20 FTP Blocks" — 70 min (15 warmup → 2×20 min @ 98% / 8 min recovery → 7 cooldown). Classic FTP test substitute.
• "Over-Under Intervals" — 65 min (12 warmup → 3×9 min cycling 3 min@105%/3 min@93% / 5 min recovery → 11 cooldown).

VO2MAX (106-120% FTP):
• "Norwegian 4×4" — 60 min (12 warmup → 4×4 min @ 108% / 4 min recovery → 16 cooldown). Gold-standard VO2max.
• "5×5 VO2max" — 70 min (15 warmup → 5×5 min @ 110% / 5 min recovery → 5 cooldown). Volume VO2max.
• "Micro Intervals" — 55 min (12 warmup → 12×1 min @ 118% / 1 min recovery → 19 cooldown). Entry-level VO2max.

NEUROMUSCULAR (acceptable even in Base phase — no lactate accumulation):
• "Sprint Builder" — 50 min (15 warmup → 8×15 s ALL OUT / 2.5 min recovery → 15 min Z2 flush).

INTERMITTENT:
• "30/30 Blitz" — 60 min (12 warmup → 3 sets of 8×(30 s@120% / 30 s@50%) / 5 min set rest → 14 cooldown).

PHASE SELECTION GUIDE:
• Base phase → Foundation Ride, Long Endurance, Z2 with Cadence Drills, Sprint Builder. Avoid VO2max and Threshold.
• Build phase → Sweet Spot Classic/Extended, Threshold Development, Norwegian 4×4. Always bookend with Foundation.
• Recovery week → Spin & Recover, Easy Flush, Foundation Ride only. At most one Tempo Cruise. Cut volume 40-60%.
`.trim();
