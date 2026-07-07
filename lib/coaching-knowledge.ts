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
 *  - FasCat Coaching sweet spot principles (Frank Overton)
 */

// ─── Coggan 7-Zone Power Model ─────────────────────────────────────────────
export const POWER_ZONES = {
  Z1: { name: "Active Recovery",     pctFtp: "< 55%",    feel: "effortless, conversational" },
  Z2: { name: "Endurance",           pctFtp: "56-75%",   feel: "easy, full sentences" },
  Z3: { name: "Tempo",               pctFtp: "76-90%",   feel: "moderately hard, 3-4 words" },
  Z4: { name: "Lactate Threshold",   pctFtp: "91-105%",  feel: "hard, single words" },
  Z5: { name: "VO2max",              pctFtp: "106-120%", feel: "very hard, 1-2 min sustainable" },
  Z6: { name: "Anaerobic Capacity",  pctFtp: "121-150%", feel: "maximal, 30-90 s sustainable" },
  Z7: { name: "Neuromuscular Power", pctFtp: "> 150%",   feel: "all-out sprint, < 30 s" },
} as const;

// ─── W/kg Rider Classification ──────────────────────────────────────────────
/**
 * Power-to-weight categories (FTP ÷ body mass in kg) used to calibrate session
 * prescription. A 2.0 W/kg rider has very different recovery needs and intensity
 * tolerance than a 3.5 W/kg rider even at the same TSB.
 */
export const RIDER_LEVEL_THRESHOLDS = [
  { label: "Beginner",     minWkg: 0.0,  maxWkg: 2.5,  note: "Foundation + Tempo + Sprint Builder only. No true threshold or VO2max." },
  { label: "Novice",       minWkg: 2.5,  maxWkg: 3.0,  note: "Add Sweet Spot Classic. Threshold Development only in late Build phase." },
  { label: "Intermediate", minWkg: 3.0,  maxWkg: 3.5,  note: "Full sweet spot range. Add Threshold Development, Micro Intervals, 4×4 Two-Set." },
  { label: "Trained",      minWkg: 3.5,  maxWkg: 4.0,  note: "Norwegian 4×4, Over-Under Intervals, 2×20 FTP Blocks, Descending Threshold unlocked." },
  { label: "Advanced",     minWkg: 4.0,  maxWkg: 4.5,  note: "Full library. Polarized model (more Z2 + more Z5, less Z3/Z4 middle ground)." },
  { label: "Elite",        minWkg: 4.5,  maxWkg: 99.0, note: "All sessions available. High volume demands longer recovery windows between hard days." },
] as const;

// ─── Session Readiness Prerequisites (minimum TSB) ─────────────────────────
/**
 * Minimum TSB (Training Stress Balance) required for each session category
 * to be physiologically productive rather than just accumulating more fatigue.
 * These are soft thresholds — cite them when the AI makes substitutions.
 */
export const SESSION_PREREQUISITES = {
  vo2max:        { minTsb: -5,  fallback: "Sweet Spot Classic",   note: "VO2max demands near-maximal cardiac output — legs must be fresh." },
  threshold:     { minTsb: -12, fallback: "Sweet Spot Classic",   note: "Sustained threshold with tired legs becomes junk miles, not adaptation." },
  sweetspot:     { minTsb: -20, fallback: "Tempo Cruise",         note: "Sweet spot is resilient to moderate fatigue." },
  neuromuscular: { minTsb: -15, fallback: "Sprint Builder",       note: "Maximal neural efforts need reasonably fresh legs." },
  intermittent:  { minTsb: -8,  fallback: "Tempo Cruise",         note: "30/30 and similar work is metabolically demanding." },
  tempo:         { minTsb: -99, fallback: "Foundation Ride",      note: "Tempo always productive regardless of fatigue level." },
  endurance:     { minTsb: -99, fallback: "Easy Flush",           note: "Always OK — aerobic stimulus without meaningful stress." },
  recovery:      { minTsb: -99, fallback: "Spin & Recover",       note: "The purpose is to flush fatigue, not create it." },
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
  /** One-sentence coaching rationale — the physiological "why" for this workout. */
  rationale: string;
  /** Human-readable structure (used in the system prompt). */
  structure: string;
  /** Specific execution advice for the hardest part of this workout. */
  executionCue: string;
  /** What a successful completion feels like (calibrates rider expectations). */
  successFeel: string;
  tags: string[];
}

export const WORKOUT_LIBRARY: NamedWorkout[] = [

  // ── RECOVERY ─────────────────────────────────────────────────────────────
  {
    name: "Spin & Recover",
    category: "recovery",
    durationMin: 30,
    tss: 20,
    rationale: "Active recovery — flushes metabolic waste products from the previous session without adding new training stress. Blood flow without biochemical cost.",
    structure: "30 min continuous @ 50-60% FTP, 90+ rpm, no structure",
    executionCue: "Keep power at 50-60% FTP and cadence above 90 rpm. If legs feel heavy at the start, that's exactly the point of this ride — the heaviness should ease in the last 10 minutes.",
    successFeel: "You should feel noticeably better at minute 25 than minute 5. If you feel worse or the same, you were going too hard.",
    tags: ["recovery", "beginner-friendly"],
  },
  {
    name: "Easy Flush",
    category: "recovery",
    durationMin: 45,
    tss: 30,
    rationale: "Sustained low-intensity blood flow promotes lactate clearance after hard efforts — often more valuable than complete rest because active circulation accelerates recovery.",
    structure: "10 min easy build → 25 min Z1 @ 55% FTP → 10 min cooldown",
    executionCue: "The 25-minute Z1 block is non-negotiable. Resist the urge to push harder — this ride's job is biochemical, not cardiovascular. If you feel strong, you're recovering well; that doesn't mean you should push.",
    successFeel: "Finish feeling energized, not depleted. If you're tired at the end, you were going too hard.",
    tags: ["recovery"],
  },

  // ── ENDURANCE / FOUNDATION ────────────────────────────────────────────────
  {
    name: "Foundation Ride",
    category: "endurance",
    durationMin: 60,
    tss: 60,
    rationale: "Builds mitochondrial density and fat-oxidation enzymes — the aerobic base that every higher-intensity session rests on. Each Foundation Ride lays a brick in the aerobic engine.",
    structure: "10 min warmup → 40 min Z2 @ 65-73% FTP (conversational pace) → 10 min cooldown",
    executionCue: "Hold 65-73% FTP the entire 40 minutes. Cadence 88-95 rpm. If you can't complete full sentences, you're above Z2. If you're bored — good. That's the pace.",
    successFeel: "You should finish feeling like you could easily ride 30 more minutes. That's not failure — that's the correct Z2 intensity signal.",
    tags: ["aerobic-base", "beginner-friendly", "zwift-ftp-builder"],
  },
  {
    name: "Long Endurance",
    category: "endurance",
    durationMin: 90,
    tss: 90,
    rationale: "Extended aerobic volume trains the body to spare glycogen and run predominantly on fat — the metabolic foundation that separates trained cyclists from untrained ones.",
    structure: "15 min warmup → 65 min Z2 @ 65-73% FTP → 10 min cooldown",
    executionCue: "The first 30 minutes feel easy — resist the temptation to increase intensity. The last 20 minutes are where real metabolic adaptation happens as glycogen depletes and fat oxidation rises.",
    successFeel: "Slightly tired but not depleted at 90 minutes. If you're wiped out, you rode too hard in the first half.",
    tags: ["aerobic-base", "volume"],
  },
  {
    name: "Z2 with Cadence Drills",
    category: "endurance",
    durationMin: 60,
    tss: 58,
    rationale: "Foundation ride with short high-cadence inserts (100-110 rpm) to improve neuromuscular efficiency and eliminate dead-spots in the pedal stroke.",
    structure: "10 min warmup → 4× (8 min Z2 @ 68% + 2 min @ 100-110 rpm / 65%) → 10 min cooldown",
    executionCue: "During the 2-min high-cadence inserts, let your legs spin freely — don't mash. Power will drop slightly at the higher cadence; that's fine. If your upper body is rocking, drop to 95 rpm.",
    successFeel: "The 100-rpm blocks should feel almost bouncy, not choppy. By the 4th drill your pedaling should feel measurably smoother.",
    tags: ["aerobic-base", "technique"],
  },
  {
    name: "Surge Ride",
    category: "endurance",
    durationMin: 60,
    tss: 72,
    rationale: "Long Z2 ride with embedded 1-minute power surges at 110% FTP — adds metabolic variety to an endurance session without the recovery cost of a full interval workout.",
    structure: "12 min warmup → 36 min Z2 @ 68% FTP with 6×1 min surges @ 110% FTP (5 min apart) → 12 min cooldown",
    executionCue: "The surges should be sharp and decisive — full power for 1 minute, then immediately drop back to Z2 pace. Don't 'ease into' the surge and don't 'ease out' — hard on, hard off, back to Z2.",
    successFeel: "The Z2 sections between surges should still feel controlled. If the surges are preventing recovery to Z2, shorten them to 45 seconds.",
    tags: ["aerobic-base", "mixed-intensity", "base-phase-ok"],
  },

  // ── TEMPO ─────────────────────────────────────────────────────────────────
  {
    name: "Tempo Cruise",
    category: "tempo",
    durationMin: 60,
    tss: 72,
    rationale: "Trains lactate clearance and glycogen storage at Z3; steady-state tempo builds the metabolic ceiling that sweet spot and threshold work sits on top of.",
    structure: "10 min warmup → 2×15 min @ 78-83% FTP (5 min recovery) → 15 min cooldown",
    executionCue: "Hold 78-83% FTP — comfortably uncomfortable. You should be able to say 3-4 words if asked but not hold a full sentence. Don't drift above 85% — that's sweet spot territory with a different recovery cost.",
    successFeel: "The second 15-minute block should feel harder than the first, but completeable. If it felt the same as the first, you were too easy.",
    tags: ["tempo", "z3", "zwift-ftp-builder"],
  },
  {
    name: "Tempo Ladder",
    category: "tempo",
    durationMin: 75,
    tss: 90,
    rationale: "Progressively longer blocks teach the body to sustain Z3 for extended periods; the final 20-minute block is where the meaningful physiological adaptation occurs.",
    structure: "12 min warmup → 10 min + 15 min + 20 min @ 80% FTP (5 min recovery each) → 13 min cooldown",
    executionCue: "Start the 10-minute block conservatively at 78% FTP. Build to 81% for the 15-min block. The 20-min block is the main stimulus; aim for 82-83% if legs allow.",
    successFeel: "The 20-minute block should be genuinely hard by minutes 16-20. If it felt easy throughout, you needed more intensity.",
    tags: ["tempo", "progression"],
  },
  {
    name: "Strength Endurance",
    category: "tempo",
    durationMin: 65,
    tss: 80,
    rationale: "Low-cadence (55-65 rpm) Z3 efforts build leg muscular strength while maintaining aerobic stimulus — the cycling equivalent of gym leg press, done on the bike, without the injury risk.",
    structure: "15 min warmup (build to 85%) → 3×8 min @ 78-84% FTP / 55-65 rpm (4 min recovery @ 60% / 90 rpm) → 14 min cooldown",
    executionCue: "Cadence is the key variable here. Keep it deliberately at 55-65 rpm during work intervals. You'll feel your quads working much harder than usual at a power level you could normally hold easily at 90 rpm.",
    successFeel: "Quads should feel muscularly tired (like after a leg workout) rather than cardiovascularly depleted. That's the correct stimulus.",
    tags: ["tempo", "strength", "muscular-endurance"],
  },

  // ── SWEET SPOT ────────────────────────────────────────────────────────────
  {
    name: "Sweet Spot Classic",
    category: "sweetspot",
    durationMin: 60,
    tss: 78,
    rationale: "The most time-efficient training zone (88-93% FTP): hard enough to drive FTP adaptation, easy enough to recover from in 24-48 hours — the cornerstone of Zwift's Build Me Up plan.",
    structure: "12 min warmup → 3×10 min @ 88-93% FTP (4 min recovery) → 14 min cooldown",
    executionCue: "Start each 10-min block at 88% — not 93%. You have 3 of them; pacing discipline on block 1 is what makes block 3 possible. If power drops in the final 2 minutes of any block, you started too hot.",
    successFeel: "All 3 blocks completed with even power. Block 3 is hard, but you finish it. That's the benchmark.",
    tags: ["sweetspot", "ftp-builder", "zwift-build-me-up"],
  },
  {
    name: "Extended Sweet Spot",
    category: "sweetspot",
    durationMin: 75,
    tss: 100,
    rationale: "Two long sweet-spot blocks; extended time at 88-92% FTP creates a substantial aerobic adaptation signal without the recovery debt of true threshold work.",
    structure: "15 min warmup → 2×20 min @ 88-92% FTP (8 min recovery) → 12 min cooldown",
    executionCue: "Use minutes 1-4 of the 8-minute recovery to genuinely recover below 65% FTP. Go into the second 20-min block feeling ready, not pre-exhausted. Second block power should be within 3% of first.",
    successFeel: "If you faded more than 3% in block 2, spend another week at Sweet Spot Classic before progressing here.",
    tags: ["sweetspot", "ftp-builder", "advanced"],
  },
  {
    name: "Sweet Spot Progression",
    category: "sweetspot",
    durationMin: 70,
    tss: 90,
    rationale: "Ascending blocks (10→15→20 min) apply progressive overload within a single session — the final 20-min block is physiologically distinct from the warmup effect on block 1.",
    structure: "12 min warmup → 10 min + 15 min + 20 min @ 90% FTP (5 min recovery each) → 8 min cooldown",
    executionCue: "Treat the 10-min block as a warm-into-it at 88%. Step to 90% for the 15-min, then push to 92% if available for the 20-min block.",
    successFeel: "The 20-min block should feel substantially harder than the 10-min opener. That progressive difficulty is the design.",
    tags: ["sweetspot", "progression"],
  },

  // ── THRESHOLD ───────────────────────────�