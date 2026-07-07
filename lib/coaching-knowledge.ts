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

  // ── THRESHOLD ─────────────────────────────────────────────────────────────
  {
    name: "Threshold Development",
    category: "threshold",
    durationMin: 60,
    tss: 82,
    rationale: "Short blocks directly at lactate turn point; 8 minutes is long enough to maximally stress the system, short enough to complete all 4 with quality power output — quality beats duration at threshold.",
    structure: "12 min warmup → 4×8 min @ 97-102% FTP (4 min recovery) → 12 min cooldown",
    executionCue: "Start block 1 at 97% — not 102%. By block 3, it should feel like 'this is hard but I can hold it.' If block 3 feels easy, you paced too conservatively — not a problem, just note it for next time.",
    successFeel: "4 blocks completed, last block power within 5% of first. If you can only quality-complete 3 blocks, add another week of Sweet Spot before returning to threshold.",
    tags: ["threshold", "ftp-builder", "zwift-ftp-builder"],
  },
  {
    name: "Threshold Cruise Intervals",
    category: "threshold",
    durationMin: 60,
    tss: 82,
    rationale: "5×5-minute blocks at threshold with short recovery — more total threshold time than 4×8 min, with shorter individual reps that build pacing confidence for riders bridging from sweet spot.",
    structure: "12 min warmup → 5×5 min @ 98-102% FTP (2.5 min recovery) → 13 min cooldown",
    executionCue: "The 2.5-minute recovery is intentionally short — you won't fully recover between reps. By rep 4, you'll be carrying accumulating lactate; that sustained lactate stress is the physiological target.",
    successFeel: "Rep 5 should be genuinely hard. If all 5 reps felt similar, the short recovery didn't challenge you enough — consider Over-Under Intervals as your next threshold progression.",
    tags: ["threshold", "intermediate"],
  },
  {
    name: "2×20 FTP Blocks",
    category: "threshold",
    durationMin: 70,
    tss: 98,
    rationale: "The gold-standard FTP benchmark session: two sustained 20-minute blocks at threshold reveal your true current ceiling and teach the body to hold race pace for long durations.",
    structure: "15 min warmup → 2×20 min @ 97-100% FTP (8 min recovery) → 7 min cooldown",
    executionCue: "Start block 1 at 97% — your ego will want to go harder, don't. By minute 15 of block 1, you should feel 'I can hold this, just barely.' The second block starts manageable and gets harder — that's correct.",
    successFeel: "If you completed both 20-minute blocks at target power, your FTP estimate is accurate. If block 2 faded more than 3-4%, consider a formal FTP re-test.",
    tags: ["threshold", "advanced", "classic"],
  },
  {
    name: "Over-Under Intervals",
    category: "threshold",
    durationMin: 65,
    tss: 92,
    rationale: "Alternating just above and just below FTP trains the body to clear lactate while sustaining high power — the hardest threshold variant and highly effective for race-simulation fitness.",
    structure: "12 min warmup → 3×9 min cycling (3 min @ 105% / 3 min @ 93%) (5 min recovery) → 11 min cooldown",
    executionCue: "The 'over' phases at 105% are where lactate accumulates; the 'under' phases at 93% are where you must clear it while staying near threshold pace. Don't ease below 90% during the 'under' — that defeats the purpose.",
    successFeel: "By rep 3, the 'over' phases feel genuinely hard. If all 'over' phases felt manageable, your FTP may be underestimated.",
    tags: ["threshold", "advanced", "over-under"],
  },
  {
    name: "Descending Threshold",
    category: "threshold",
    durationMin: 65,
    tss: 90,
    rationale: "Decreasing interval lengths (12→10→8→6 min) stepping up 2% each block; builds mental resilience by ending with the most intense effort when most fatigued — trains the body and mind to push hardest when it hurts most.",
    structure: "12 min warmup → 12 min @ 97% + 10 min @ 99% + 8 min @ 101% + 6 min @ 103% FTP (equal rest each) → 11 min cooldown",
    executionCue: "Each block gets shorter but steps up 2% in power. By the 6-minute final block, you should be at full threshold effort — knowing it's only 6 minutes is exactly the point. This session trains pacing judgment and mental toughness simultaneously.",
    successFeel: "The 6-minute block at 103% feels like a sprint after exhausting work. Completing it at target power = this session worked perfectly.",
    tags: ["threshold", "advanced", "mental-toughness"],
  },

  // ── VO2MAX ────────────────────────────────────────────────────────────────
  {
    name: "Norwegian 4×4",
    category: "vo2max",
    durationMin: 60,
    tss: 90,
    rationale: "Gold-standard VO2max protocol; four 4-minute blocks at 106-110% FTP raise aerobic ceiling more efficiently than any other protocol because 4 minutes is exactly long enough for HR to plateau at VO2max — that sustained plateau is where the adaptation signal lives.",
    structure: "12 min warmup → 4×4 min @ 106-110% FTP (4 min recovery) → 16 min cooldown",
    executionCue: "The first 2 minutes of each rep will feel manageable. The last 2 minutes are where the adaptation happens — HR climbs toward max and you must hold on. Keep cadence 95+ rpm; grinding slows HR rise and reduces the VO2max stimulus.",
    successFeel: "By rep 4, you should barely be able to finish. If rep 4 felt like rep 2, the power target was too low. The protocol is designed to hurt in the right way.",
    tags: ["vo2max", "norwegian", "advanced"],
  },
  {
    name: "4×4 Two-Set",
    category: "vo2max",
    durationMin: 65,
    tss: 85,
    rationale: "Two sets of 2×4-minute VO2max intervals with an 8-minute easy block mid-session — delivers the same Norwegian 4-rep stimulus in a format more accessible to riders not yet ready for 4 consecutive hard reps.",
    structure: "12 min warmup → (2×4 min @ 108% / 4 min recovery) → 8 min easy Z2 → (2×4 min @ 108% / 4 min recovery) → 9 min cooldown",
    executionCue: "Use the 8-minute easy block genuinely — drop below 65% FTP. The second set will feel harder than the first; that's by design, and by completing it you've trained your body to produce effort under accumulated fatigue.",
    successFeel: "All 4 reps completed at target power. Once this feels manageable rather than maximal, you're ready to consolidate into the standard Norwegian 4×4.",
    tags: ["vo2max", "intermediate", "norwegian-variant"],
  },
  {
    name: "5×5 VO2max",
    category: "vo2max",
    durationMin: 70,
    tss: 100,
    rationale: "Five 5-minute blocks at VO2max intensity; 5 minutes is the optimal individual rep duration — long enough to fully stress the cardiovascular system, short enough to maintain quality across all 5 reps.",
    structure: "15 min warmup → 5×5 min @ 108-112% FTP (5 min recovery) → 5 min cooldown",
    executionCue: "The equal work:rest ratio (5:5) is critical — don't rush the recovery by returning to 108% before heart rate has actually recovered. HR should be declining through the first 3 recovery minutes.",
    successFeel: "Rep 5 is the hardest thing you'll do this week. All 5 completed = excellent. 4 completed at target power = still very good — aim to finish all 5 next time.",
    tags: ["vo2max", "zwift-build-me-up"],
  },
  {
    name: "Micro Intervals",
    category: "vo2max",
    durationMin: 55,
    tss: 80,
    rationale: "Short 1-minute bursts at 115-120% FTP accumulate VO2max stress without the pacing discipline required by longer intervals — the ideal entry point to VO2max work for riders not yet ready for 4-minute sustained reps.",
    structure: "12 min warmup → 12×1 min @ 115-120% FTP (1 min recovery) → 19 min cooldown",
    executionCue: "The 1:1 work:rest ratio keeps you returning before you're fully recovered. By rep 8, the recovery minute won't feel like enough — that sustained oxygen uptake elevation through the 'off' periods is the training signal.",
    successFeel: "The last 4 reps should be noticeably harder than the first 4. If all 12 felt similar, you weren't going hard enough on the 'on' intervals.",
    tags: ["vo2max", "short-intervals"],
  },

  // ── NEUROMUSCULAR / STRENGTH ──────────────────────────────────────────────
  {
    name: "Sprint Builder",
    category: "neuromuscular",
    durationMin: 50,
    tss: 50,
    rationale: "15-20 second maximal efforts recruit fast-twitch muscle fibers you won't touch in any endurance session — essential for neuromuscular development even in base phase, and these short maximal efforts don't create meaningful lactate accumulation.",
    structure: "15 min warmup → 8×15 s ALL OUT (2.5 min recovery) → 15 min Z2 flush",
    executionCue: "Each sprint is 100% — not 80%, not 90%. Think 'jump out of a corner' or 'bridge a gap now.' Wind up for 3-5 seconds before the clock starts. 2.5 full minutes between efforts is non-negotiable.",
    successFeel: "Your last sprint should produce nearly the same peak power as your first. If peak power drops significantly by sprint 5-6, extend recovery to 3 minutes.",
    tags: ["neuromuscular", "sprint", "zwift-ftp-builder", "base-phase-ok"],
  },
  {
    name: "Race Day Opener",
    category: "neuromuscular",
    durationMin: 35,
    tss: 30,
    rationale: "Pre-event activation protocol — brief punchy efforts 24-48 hours before a race activate the neuromuscular system and prime cardiovascular response without adding meaningful fatigue.",
    structure: "10 min easy warmup → 3×1 min @ 110% FTP (3 min easy recovery) → 5 min @ 80% → 10 min easy spindown",
    executionCue: "Three 1-minute efforts at 110% FTP: sharp and decisive, not all-out sprints. These are neuromuscular 'reminders,' not training stimuli. The goal is to feel activated and ready, not tired.",
    successFeel: "30-35 minutes and done. Legs feel awake and reactive. If you feel fatigued after this, you're not yet recovered enough for your event — consider one more rest day.",
    tags: ["pre-event", "taper", "activation"],
  },

  // ── INTERMITTENT ──────────────────────────────────────────────────────────
  {
    name: "30/30 Blitz",
    category: "intermittent",
    durationMin: 60,
    tss: 78,
    rationale: "30s hard / 30s easy creates a metabolic double-hit: anaerobic stress in the 'on' intervals with aerobic recovery that can't fully clear before the next rep — this keeps oxygen uptake elevated through the 'off' periods, accumulating VO2max stress more efficiently than single all-out efforts.",
    structure: "12 min warmup → 3 sets of 8×(30 s @ 120% / 30 s @ 50%) with 5 min set recovery → 14 min cooldown",
    executionCue: "The 'on' intervals are 120% FTP — hard effort, not sprint. The 30-second 'off' is active recovery at 50%; don't coast to zero. By set 3, the previous sets should still be felt in the legs — that sustained elevation is the training signal.",
    successFeel: "Sets 1-2 are hard. Set 3 is very hard. Completing all 8 reps in set 3 at target power = success. If you bail on rep 7 or 8 of set 3, still an excellent session.",
    tags: ["intermittent", "zwift-ftp-builder"],
  },
];

// ─── Phase Workout Selection ────────────────────────────────────────────────
export const PHASE_GUIDELINES = {
  Base: {
    focus: "aerobic foundation",
    primary: ["Foundation Ride", "Long Endurance", "Z2 with Cadence Drills", "Sprint Builder", "Surge Ride", "Strength Endurance"],
    supporting: ["Tempo Cruise", "Tempo Ladder", "Easy Flush", "Spin & Recover"],
    avoid: ["2×20 FTP Blocks", "Norwegian 4×4", "Over-Under Intervals", "5×5 VO2max", "Descending Threshold"],
    note: "80% Z1-Z2 volume. Sprint Builder and Surge Ride are acceptable — short maximal efforts and embedded surges don't create lasting lactate accumulation. One structured hard session per week maximum.",
  },
  Build: {
    focus: "FTP and VO2max development",
    primary: ["Sweet Spot Classic", "Extended Sweet Spot", "Sweet Spot Progression", "Threshold Development", "Threshold Cruise Intervals", "Norwegian 4×4"],
    supporting: ["Foundation Ride", "Long Endurance", "Tempo Cruise", "30/30 Blitz", "Micro Intervals", "4×4 Two-Set"],
    avoid: [],
    note: "Progressive overload. Introduce sweet-spot/threshold in early Build; add VO2max in mid/late Build. Always bookend hard sessions with Foundation rides. 2-3 hard sessions per week maximum.",
  },
  Recovery: {
    focus: "adaptation and regeneration",
    primary: ["Spin & Recover", "Easy Flush", "Foundation Ride"],
    supporting: ["Tempo Cruise"],
    avoid: ["Threshold Development", "2×20 FTP Blocks", "Norwegian 4×4", "5×5 VO2max", "Over-Under Intervals", "Descending Threshold", "Extended Sweet Spot", "Sweet Spot Progression"],
    note: "Volume cut 40-60%. At most one short quality session (Tempo Cruise). The body adapts DURING recovery weeks — this is not wasted time, it is when fitness from the load block is consolidated.",
  },
} as const;

/**
 * PROGRESSION LADDER — advance one rung per mesocycle, never skip.
 * Used by the AI to determine appropriate workout intensity for the rider's
 * current fitness level and training phase.
 */
export const PROGRESSION_LADDER = [
  "Foundation Ride",          // Rung 1: base aerobic
  "Tempo Cruise",             // Rung 2: lactate clearance, Z3 introduction
  "Sweet Spot Classic",       // Rung 3: sub-threshold FTP builder (3×10 min)
  "Sweet Spot Progression",   // Rung 4: progressive sweet spot (10+15+20 min)
  "Extended Sweet Spot",      // Rung 5: sustained sweet spot (2×20 min)
  "Threshold Development",    // Rung 6: true lactate threshold (4×8 min)
  "Threshold Cruise Intervals", // Rung 7: threshold volume (5×5 min)
  "Over-Under Intervals",     // Rung 8: lactate buffering
  "Norwegian 4×4",            // Rung 9: VO2max development
  "5×5 VO2max",               // Rung 10: VO2max volume
  "2×20 FTP Blocks",          // Rung 11: race-pace FTP simulation
] as const;

/**
 * Condensed workout library injected into the AI system prompt.
 * Keep this in sync with WORKOUT_LIBRARY above.
 */
export const WORKOUT_LIBRARY_PROMPT = `
NAMED WORKOUT PROTOCOLS — use these exact names as session titles. Plans must feel like they were designed by a professional coach who looked at this rider's actual data, not generated from a template.

RECOVERY:
• "Spin & Recover" — 30 min, 50-60% FTP, 90+ rpm. Flushes metabolic waste without adding stress. Coach cue: heaviness should ease in the last 10 min.
• "Easy Flush" — 45 min (10 warmup → 25 Z1 @ 55% → 10 cooldown). Active lactate clearance. Never push harder even if feeling strong.

ENDURANCE / FOUNDATION:
• "Foundation Ride" — 60 min (10 warmup → 40 Z2 @ 65-73% → 10 cooldown). Builds mitochondrial density. Execution: if you can't complete full sentences, you're above Z2.
• "Long Endurance" — 90 min (15 warmup → 65 Z2 @ 65-73% → 10 cooldown). Last 20 min is where glycogen depletes and real fat-oxidation adaptation occurs.
• "Z2 with Cadence Drills" — 60 min, Z2 with 4×2 min @ 100-110 rpm. Neuromuscular efficiency builder; power drops slightly at high cadence — that's fine.
• "Surge Ride" — 60 min, Z2 base with 6×1 min surges @ 110% FTP (5 min apart). Adds metabolic variety without threshold recovery cost. Hard on, hard off, back to Z2.

TEMPO (Z3 — 76-90% FTP):
• "Tempo Cruise" — 60 min (10 warmup → 2×15 min @ 80% / 5 min recovery → 15 cooldown). 3-4 word sentences at target pace. Second block harder than first = correct.
• "Tempo Ladder" — 75 min (12 warmup → 10+15+20 min @ 80% / 5 min each → 13 cooldown). Progressively longer Z3 blocks. 20-min block is the main stimulus.
• "Strength Endurance" — 65 min (15 warmup → 3×8 min @ 80% FTP / 55-65 rpm / 4 min recovery → 14 cooldown). Quads burn muscularly — that's the correct signal, not cardiovascular exhaustion.

SWEET SPOT (88-93% FTP — most time-efficient zone for FTP development):
• "Sweet Spot Classic" — 60 min (12 warmup → 3×10 min @ 90% / 4 min recovery → 14 cooldown). Start at 88%, not 93% — pacing discipline on block 1 makes block 3 possible.
• "Extended Sweet Spot" — 75 min (15 warmup → 2×20 min @ 90% / 8 min recovery → 12 cooldown). Second block power within 3% of first = progression ready.
• "Sweet Spot Progression" — 70 min (12 warmup → 10+15+20 min @ 90% / 5 min each → 8 cooldown). Ascending difficulty within the session.

THRESHOLD (97-105% FTP — requires TSB ≥ -12 to be productive):
• "Threshold Development" — 60 min (12 warmup → 4×8 min @ 100% / 4 min recovery → 12 cooldown). Quality beats duration — 3 quality blocks > 4 faded ones.
• "Threshold Cruise Intervals" — 60 min (12 warmup → 5×5 min @ 100% / 2.5 min recovery → 13 cooldown). Short recovery is the design — accumulated lactate IS the stimulus.
• "2×20 FTP Blocks" — 70 min (15 warmup → 2×20 min @ 98% / 8 min recovery → 7 cooldown). Gold standard. Start at 97% — ego wants 100%, don't.
• "Descending Threshold" — 65 min (12 warmup → 12+10+8+6 min stepping up 2% per block / equal rest → 11 cooldown). Builds mental toughness. Final 6-min block at 103% feels like a sprint.
• "Over-Under Intervals" — 65 min (12 warmup → 3×9 min cycling 3 min@105%/3 min@93% / 5 min recovery → 11 cooldown). Never ease below 90% during the 'under' phases — that defeats the lactate-buffering purpose.

VO2MAX (106-120% FTP — requires TSB ≥ -5 and intermediate+ rider):
• "Norwegian 4×4" — 60 min (12 warmup → 4×4 min @ 108% / 4 min recovery → 16 cooldown). Last 2 min of each rep MUST be genuinely hard — that sustained HR plateau is where adaptation happens. Cadence 95+ rpm.
• "4×4 Two-Set" — 65 min (12 warmup → [2×4 min @ 108% / 4 rec] + 8 min Z2 + [2×4 min @ 108% / 4 rec] → 9 cooldown). Beginner-friendly Norwegian variant. Graduate to full 4×4 when this feels manageable.
• "5×5 VO2max" — 70 min (15 warmup → 5×5 min @ 110% / 5 min recovery → 5 cooldown). Equal work:rest — don't rush the recovery interval. Rep 5 should be the hardest thing this week.
• "Micro Intervals" — 55 min (12 warmup → 12×1 min @ 118% / 1 min recovery → 19 cooldown). Entry-level VO2max. Last 4 reps must be harder than first 4 — if they're not, power target is too low.

NEUROMUSCULAR (acceptable even in Base — minimal lactate accumulation):
• "Sprint Builder" — 50 min (15 warmup → 8×15 s ALL OUT / 2.5 min recovery → 15 Z2 flush). Last sprint near-equal to first in peak power.
• "Race Day Opener" — 35 min (10 warmup → 3×1 min @ 110% / 3 min easy → 5 min @ 80% → 10 spindown). Pre-event only (24-48h before race). Activation, not training.

INTERMITTENT:
• "30/30 Blitz" — 60 min (12 warmup → 3 sets of 8×(30s@120% / 30s@50%) / 5 min rest → 14 cooldown). Never coast during the 'off' intervals — active recovery maintains elevated oxygen uptake.

RIDER LEVEL GUIDANCE — calibrate session choice to wPerKg:
• < 2.5 W/kg (Beginner): Foundation, Tempo, Sprint Builder, Surge Ride, Spin & Recover ONLY. No sweet spot > 3×10 min. No threshold or VO2max.
• 2.5–3.0 W/kg (Novice): Add Sweet Spot Classic (3×10 min), Micro Intervals, 30/30 Blitz. Threshold Cruise Intervals only in late Build phase, max TSB -8.
• 3.0–3.5 W/kg (Intermediate): Full sweet spot range + Threshold Development + Threshold Cruise + 4×4 Two-Set. No Norwegian 4×4 or 2×20.
• 3.5+ W/kg (Trained/Advanced): Full library including Norwegian 4×4, 2×20 FTP Blocks, Over-Under Intervals, Descending Threshold.
• If wPerKg is null: infer from FTP alone — < 150 W = beginner, 150-220 W = novice/intermediate, > 220 W = trained.

SESSION READINESS — substitute when TSB is below threshold (cite the actual TSB number when substituting):
• VO2max sessions: need TSB ≥ -5. Below that → substitute Sweet Spot Classic.
• Threshold sessions: need TSB ≥ -12. Below that → substitute Sweet Spot Classic or Tempo Cruise.
• Sweet Spot sessions: need TSB ≥ -20. Below that → substitute Tempo Cruise.
• Neuromuscular/Sprint: need TSB ≥ -15. Below that → substitute Sprint Builder (shorter) or Foundation Ride.
• Tempo, Foundation, Recovery: always appropriate regardless of TSB.

PROGRESSION LADDER — follow this order, never skip rungs:
Foundation Ride → Tempo Cruise → Sweet Spot Classic → Extended Sweet Spot → Threshold Development → Over-Under Intervals → Norwegian 4×4

WEEKLY SEQUENCING — the week shape matters as much as individual sessions:
• Hardest session: schedule on the day when TSB is highest (typically day 2-3 of the week, after the rest day that started the week).
• Long Endurance: schedule late in the week (pre-fatigued legs still generate aerobic signal and teach fat oxidation).
• Pattern: rest/recovery → hard → easy/recovery → hard → easy → long endurance → rest.
• After Norwegian 4×4 or 2×20: mandatory easy or rest day before the next hard session.
• Never schedule two hard sessions on consecutive days — always insert a Foundation or Recovery session between hard efforts.

PHASE SELECTION:
• Base → Foundation Ride, Long Endurance, Surge Ride, Z2 Cadence Drills, Sprint Builder, Tempo Cruise. Maximum 1 hard structured session/week.
• Build → Sweet Spot, Threshold, VO2max series. Bookend with Foundation. 2-3 hard sessions/week maximum. Never increase volume AND intensity in the same week.
• Recovery → Spin & Recover, Easy Flush, Foundation Ride only. At most one Tempo Cruise. Cut volume 40-60%. The body adapts during recovery — this is not wasted time.
`.trim();
