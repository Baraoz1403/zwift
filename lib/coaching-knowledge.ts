
/**
 * ============================================================
 * FTP HANDLING - a rough estimate is not a substitute for a real test
 * ============================================================
 *
 * REVISED (July 2026) after an external methodology review: the previous
 * version of this note described an invented "Coggan Power-Duration
 * Protocol" that estimated FTP from the average power of ANY ride 20-120+
 * minutes long, and claimed that estimate should ALWAYS override the
 * rider's own manually-entered FTP. That's backwards. A real FTP number
 * comes from a genuine near-maximal effort - a 20-minute all-out time
 * trial (see the "FTP Test Protocol" workout below, FTP = 0.95 x average
 * power), a ramp test, or a Critical-Power model built from several true
 * maximal efforts. The duration of an ordinary ride says nothing about
 * whether it was ridden anywhere near the rider's ceiling - an easy Z2
 * spin, a drafted group ride, or a ride with coffee-stop coasting all
 * produce a power number that is not FTP data at all.
 *
 * CURRENT BEHAVIOR (lib/plan-runner.ts, estimateFtpFromRides):
 * - A manually-entered profile.ftp is now ALWAYS trusted when present. It is
 *   never silently overridden by a computation from ride history.
 * - The ride-based estimate is used ONLY when there is no manual FTP at
 *   all, is built only from the rider's hardest recent rides (not just any
 *   ride over 80W), and is explicitly a rough fallback, not a validated
 *   number.
 * - One correction to the old note: draft does not "inflate" power the way
 *   it was previously described. Draft lets a rider hold a given SPEED at
 *   LOWER power - so if anything, a drafted ride's power data
 *   underrepresents solo capability, it doesn't inflate an FTP estimate.
 *
 * WHAT THE APP SHOULD TELL THE RIDER:
 * - If FTP has never been tested, recommend the "FTP Test Protocol"
 *   workout (20 min all-out) as the very next hard session, rather than
 *   quietly building calibrated intensity work around a guess.
 * - If FTP hasn't been tested in 8+ weeks or performance has clearly
 *   shifted (better or worse), suggest a re-test rather than adjusting the
 *   number automatically from ordinary ride data.
 * ============================================================
 */

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
 * Power-to-weight is ONE input into session selection, not the sole gate.
 * REVISED (July 2026): an external review correctly pointed out that W/kg
 * mainly measures climbing performance and says nothing on its own about
 * whether a rider can handle structured intervals - a heavy, strong rider
 * can have a high FTP but modest W/kg, while a very light rider can post a
 * high W/kg with little training experience. Real session-readiness also
 * depends on age, training history, injury/medical history, technical
 * skill, goals, recovery capacity, and how the rider has actually responded
 * to intensity before. This table stays as a coarse, useful starting point
 * (a genuine beginner should not open with Norwegian 4x4), but the AI should
 * treat it as a default to override when the rider's own profile/notes/
 * history say otherwise, not as a hard physiological law.
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
 * Minimum TSB (Training Stress Balance) suggested for each session category.
 * REVISED (July 2026): TSB is a mathematical training-load MODEL derived
 * from CTL/ATL (which are themselves just exponentially-weighted averages
 * of daily TSS) - it is not a direct measurement of the rider's body. TSB
 * has no way of knowing whether the rider slept two hours, is fighting off
 * a cold, is dehydrated, stressed, or nursing a sore knee. These thresholds
 * are soft, population-level heuristics, not scientific facts - the AI must
 * treat the rider's own stated notes, subjective feel, and any illness/
 * injury signal as equal or higher priority than the TSB number itself, and
 * say so explicitly when making a substitution rather than citing TSB alone
 * as if it settled the question.
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
    rationale: "Extended aerobic volume promotes fat-oxidation and glycogen-sparing adaptations — a key metabolic shift associated with endurance training that improves sustained performance.",
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

  // ── RECOVERY (additional) ─────────────────────────────────────────────────
  {
    name: "Short Active Recovery",
    category: "recovery",
    durationMin: 20,
    tss: 12,
    rationale: "Ultra-short active recovery for days when time is scarce — just enough blood flow to accelerate muscle clearance without adding measurable training stress. Better than nothing, better than complete rest for very fatigued legs.",
    structure: "20 min continuous @ 45-55% FTP, free cadence, no structure",
    executionCue: "Keep power below 55% FTP at all times. If it feels too easy, that's correct — this is not training, it's biochemical maintenance. Stay below 120 bpm heart rate.",
    successFeel: "Legs feel looser at minute 18 than at minute 2. No cardiovascular fatigue at all. If you feel like you need more, add 10 minutes at the same intensity.",
    tags: ["recovery", "time-crunched", "beginner-friendly"],
  },
  {
    name: "Extended Recovery Flush",
    category: "recovery",
    durationMin: 50,
    tss: 33,
    rationale: "Longer recovery ride for days after two consecutive hard efforts — extended Z1 circulation allows more complete glycogen resynthesis and waste clearance than a 30-minute spin.",
    structure: "10 min easy → 30 min pure Z1 @ 50-58% FTP → 10 min wind-down",
    executionCue: "The 30-minute middle block is deliberately boring. Stay below 60% FTP regardless of how you feel. If TSB is very negative (-25 or more), this ride is more valuable than any intensity.",
    successFeel: "Notable improvement in leg feel from start to finish. Heart rate should be comfortably below 130 bpm throughout.",
    tags: ["recovery", "post-hard-effort"],
  },

  // ── ENDURANCE (additional) ────────────────────────────────────────────────
  {
    name: "Two-Hour Foundation",
    category: "endurance",
    durationMin: 120,
    tss: 120,
    rationale: "The cornerstone of long-term aerobic development — extended Z2 duration is associated with enhanced mitochondrial adaptation and fat-oxidation enzyme upregulation, responses that appear to scale with sustained aerobic time. Used systematically in elite endurance programs including Seiler's polarized model and Friel's periodization.",
    structure: "20 min easy warmup → 85 min Z2 @ 65-73% FTP → 15 min cooldown",
    executionCue: "Power must stay in Z2 for the full 85 minutes. The first 40 minutes should feel suspiciously easy — that's correct. Fat metabolism takes 30-40 minutes to fully activate; riders who start at 75% miss most of the adaptation. Check power every 10 minutes and drift down if anything.",
    successFeel: "Pleasantly tired, not depleted. If you're wiped out, you were riding at Z3 for parts of it. You should be able to ride again tomorrow without issue.",
    tags: ["aerobic-base", "long", "seiler", "fat-oxidation"],
  },
  {
    name: "Aerobic Threshold Ride",
    category: "endurance",
    durationMin: 60,
    tss: 68,
    rationale: "Targets the top of Z2 — the aerobic threshold (AeT, first ventilatory threshold) where fat and carbohydrate metabolism are equally contributing. Training at this exact intensity builds the aerobic ceiling that separates riders who can hold Z3 for hours from those who can't.",
    structure: "10 min warmup → 40 min @ 72-76% FTP (top of Z2, below tempo) → 10 min cooldown",
    executionCue: "Power between 72-76% FTP. You should be able to speak in short sentences (4-5 words), but sustained conversation is uncomfortable. This is 'comfortably uncomfortable' — not easy, not hard, perfectly in the metabolic sweet spot.",
    successFeel: "Mildly fatigued but not depleted. Heart rate decoupling (power stays stable but HR slowly rises) in the last 15 minutes indicates successful aerobic stress.",
    tags: ["aerobic-base", "aerobic-threshold", "aet"],
  },
  {
    name: "Endurance with Muscle Tension",
    category: "endurance",
    durationMin: 65,
    tss: 70,
    rationale: "Z2 ride with embedded low-cadence blocks (50-60 rpm) that stress the slow-twitch fibers more than normal spinning — a 'gym session on the bike' that builds cycling-specific leg strength without leaving the aerobic zone.",
    structure: "12 min warmup → 4× (6 min Z2 @ 68% / 90 rpm → 5 min Z2 @ 68% / 55 rpm) → 9 min cooldown",
    executionCue: "During the 55-rpm blocks, resist the urge to raise power — the intensity stays the same, only the cadence drops. You'll feel your quads working far harder. The goal is muscular stress, not cardiovascular stress.",
    successFeel: "Quads have a muscular burn similar to a gym session, but heart rate never exceeded 75% of max. That's the correct combination of stimuli.",
    tags: ["aerobic-base", "muscular-endurance", "low-cadence"],
  },
  {
    name: "Over-Distance Ride",
    category: "endurance",
    durationMin: 100,
    tss: 100,
    rationale: "Slightly longer than the standard Foundation Ride — extends the aerobic stimulus window without crossing into tempo. Used when CTL is building and the rider can handle moderate volume.",
    structure: "15 min warmup → 70 min Z2 @ 66-72% FTP → 15 min cooldown",
    executionCue: "Treat minutes 60-70 as the primary adaptation window — glycogen is partially depleted by then, and fat oxidation is working at maximum. The last 10 minutes of steady Z2 should feel slightly harder even at the same power.",
    successFeel: "Manageable tiredness at the end, not exhaustion. If you feel great at 100 minutes, the next session can be longer.",
    tags: ["aerobic-base", "volume", "base-phase"],
  },
  {
    name: "Endurance Openers",
    category: "endurance",
    durationMin: 60,
    tss: 65,
    rationale: "Z2 base ride with brief 'opener' efforts — 30-second accelerations at 110% FTP that prime the neuromuscular system without adding real training stress. Perfect the day before a race or hard session when legs need stimulation, not load.",
    structure: "15 min warmup → 30 min Z2 @ 68% FTP with 5×30s openers @ 110% (6 min apart) → 15 min cooldown",
    executionCue: "The openers are sharp but brief — full commitment for 30 seconds, then immediately back to Z2 pace. Don't treat them as intervals; treat them as system checks.",
    successFeel: "Legs feel activated and responsive by the end. TSB should be similar or slightly better than when you started — this is activation, not depletion.",
    tags: ["aerobic-base", "activation", "pre-race"],
  },

  // ── TEMPO (additional) ────────────────────────────────────────────────────
  {
    name: "Continuous Tempo",
    category: "tempo",
    durationMin: 60,
    tss: 75,
    rationale: "Unbroken 35-minute Z3 block — harder than broken tempo because there's no rest for lactate to clear, forcing the body to improve buffering capacity while sustaining output. Develops mental toughness alongside physiology.",
    structure: "12 min warmup → 35 min continuous @ 79-83% FTP (no recovery) → 13 min cooldown",
    executionCue: "Start at 79% FTP even if you feel like pushing harder. The challenge in this workout is the second half — minutes 20-35 — not the first. Conserve intentionally.",
    successFeel: "Minutes 25-35 feel genuinely hard but completeable. If you had to back off the power, that's fine — adjust target down 2% next time.",
    tags: ["tempo", "continuous", "mental-endurance"],
  },
  {
    name: "Progressive Tempo",
    category: "tempo",
    durationMin: 65,
    tss: 78,
    rationale: "Pacing discipline trainer — most riders go too hard at the start, fade, and finish disappointed. This workout reverses the pattern: start easy, finish strong, teaching the metabolic economy that defines experienced cyclists.",
    structure: "12 min warmup → 10 min @ 76% FTP → 10 min @ 79% FTP → 10 min @ 82% FTP → 10 min @ 85% FTP → 13 min cooldown",
    executionCue: "Resist the urge to push in block 1 even if it feels 'too easy' — you need the reserves for block 4. The final 10 minutes at 85% should feel hard. If block 4 felt easy, you held back too much in blocks 1-3.",
    successFeel: "Block 4 is the hardest and you completed it. Heart rate should be highest in block 4 despite stable power — that's aerobic system working correctly.",
    tags: ["tempo", "pacing", "progressive"],
  },
  {
    name: "Sub-Threshold Blocks",
    category: "tempo",
    durationMin: 75,
    tss: 88,
    rationale: "3×15 min at 87-89% FTP — the bridge between sweet spot and threshold. This range trains the top end of Z3/bottom of Z4, improving the lactate clearance machinery before introducing true threshold work.",
    structure: "12 min warmup → 3×15 min @ 88% FTP (5 min recovery) → 13 min cooldown",
    executionCue: "88% FTP is right at the boundary — you'll be working hard but the 15-minute blocks should be completeable. If you can't finish block 3, power was too high; reduce to 86% for next session.",
    successFeel: "Third block feels hard but not desperate. Breathing is controlled throughout. Ready to introduce Threshold Development next week if this felt manageable.",
    tags: ["tempo", "sub-threshold", "progression"],
  },

  // ── SWEET SPOT (additional) ───────────────────────────────────────────────
  {
    name: "Sweet Spot Primer",
    category: "sweetspot",
    durationMin: 55,
    tss: 68,
    rationale: "Entry-level sweet spot — four 8-minute blocks instead of three 10-minute blocks makes this more accessible for riders new to the zone. Fewer minutes per block reduces the psychological barrier while still building the metabolic foundations.",
    structure: "12 min warmup → 4×8 min @ 88% FTP (3 min recovery) → 11 min cooldown",
    executionCue: "Start at 87% FTP even if it feels easy — pacing matters here. Block 4 should feel noticeably harder than block 1. If blocks 1 and 4 feel identical, your sweet spot zone is probably miscalibrated.",
    successFeel: "All 4 blocks completed. Block 4 is the hardest. Recovery between blocks feels genuinely helpful — you're out of the zone, not just coasting.",
    tags: ["sweetspot", "beginner-friendly", "entry-level"],
  },
  {
    name: "3×15 Sweet Spot",
    category: "sweetspot",
    durationMin: 75,
    tss: 88,
    rationale: "The natural progression from 3×10 min — same number of reps, 50% more work per interval. This is the session that marks the jump from beginner to intermediate sweet spot training and directly precedes 2×20 capability.",
    structure: "12 min warmup → 3×15 min @ 90% FTP (5 min recovery) → 13 min cooldown",
    executionCue: "3×15 is substantially harder than 3×10 — the last 5 minutes of each block is where the real adaptation happens. Aim for even splits (same power on all 3 blocks). If you fade in block 3, power was too high.",
    successFeel: "All three 15-minute blocks completed near target power. Block 3 is the hardest and you finished it. Ready to progress toward 2×20 in the next 2-3 weeks.",
    tags: ["sweetspot", "intermediate", "progression"],
  },
  {
    name: "Sweet Spot Time Trial",
    category: "sweetspot",
    durationMin: 65,
    tss: 84,
    rationale: "One continuous 35-minute block at sweet spot intensity — builds the ability to sustain effort without the psychological crutch of recovery intervals. Critical bridge between interval training and real-world riding where there are no built-in rest periods.",
    structure: "12 min warmup → 35 min continuous @ 89% FTP → 18 min cooldown",
    executionCue: "No recovery — this is one unbroken effort. Start at 87% FTP; build to 89% by minute 10. The final 10 minutes should be hard. If you can't sustain 87-89% for 35 min, your FTP may be slightly overestimated.",
    successFeel: "Completed all 35 minutes above 86% FTP. HR likely peaked in the final 5 minutes. Breathing was controlled but heavy by the end.",
    tags: ["sweetspot", "time-trial", "continuous"],
  },
  {
    name: "Low-Cadence Sweet Spot",
    category: "sweetspot",
    durationMin: 65,
    tss: 82,
    rationale: "Sweet spot at 70-75 rpm shifts more work to the slow-twitch muscle fibers, building cycling-specific muscular endurance while simultaneously challenging the cardiovascular system — two adaptations in one session.",
    structure: "15 min warmup → 3×12 min @ 89% FTP / 70-75 rpm (5 min recovery @ 90 rpm) → 14 min cooldown",
    executionCue: "The low cadence is not optional. You'll feel your quads burning much earlier than usual. If maintaining 70-75 rpm forces you below 85% FTP, you're not strong enough for this version yet — use the standard Sweet Spot Classic instead.",
    successFeel: "Quads feel muscularly worked (different from cardiovascular fatigue). You could feel the difference in muscle recruitment vs. normal spinning.",
    tags: ["sweetspot", "muscular-endurance", "low-cadence"],
  },

  // ── THRESHOLD (additional) ────────────────────────────────────────────────
  {
    name: "FTP Test Protocol",
    category: "threshold",
    durationMin: 60,
    tss: 90,
    rationale: "The standard field test for estimating FTP — a 20-minute all-out effort where 95% of average power estimates functional threshold. Use when FTP hasn't been tested in 4+ weeks or when rider performance has significantly changed.",
    structure: "15 min progressive warmup (include 3×1 min @ 110%) → 5 min easy → 20 min ALL OUT time trial → 20 min easy cooldown",
    executionCue: "Start the 20-minute effort conservatively — most riders go too hard in the first 5 minutes and blow up. Aim for even power across all 20 minutes or a slight negative split. After the test, Zwift will calculate and display your FTP result — update your profile.ftp manually from that value.",
    successFeel: "Completely exhausted at minute 20 — you should have nothing left. If you felt strong at the end, you rode too conservatively. Average power in the last 5 minutes should be ≥ average of first 5 minutes.",
    tags: ["threshold", "test", "assessment"],
  },
  {
    name: "Short Threshold Intervals",
    category: "threshold",
    durationMin: 60,
    tss: 84,
    rationale: "Shorter intervals at full threshold (5-minute blocks) with minimal rest — accumulates threshold time without the psychological demands of 8-minute blocks. High total threshold minutes, lower per-rep commitment.",
    structure: "12 min warmup → 6×5 min @ 100% FTP (2.5 min recovery @ 55%) → 18 min cooldown",
    executionCue: "The 2.5-minute recovery is deliberately short — designed to keep lactate elevated between reps so the total metabolic challenge is higher. Resist the urge to extend recovery time.",
    successFeel: "All 6 reps completed at target power. The last 2-3 reps were the hardest. Recovery between reps felt insufficient but you recovered enough.",
    tags: ["threshold", "accumulation"],
  },
  {
    name: "Critical Power Development",
    category: "threshold",
    durationMin: 70,
    tss: 96,
    rationale: "Three 12-minute blocks at 102% FTP — slightly above threshold, targeting the power output where the 'critical power' model predicts the highest rate of lactate removal capacity development. Based on Burnley & Jones research.",
    structure: "12 min warmup → 3×12 min @ 102% FTP (6 min recovery @ 55%) → 16 min cooldown",
    executionCue: "102% FTP is above threshold — these reps will be hard. Don't start above 100%; build to 102% by minute 2 of each rep. The rep ends when you've completed 12 minutes, not when your legs scream. If you can't hold 100%, you're probably not recovered enough.",
    successFeel: "Three reps completed at 100-103% FTP. Rep 3 was the hardest. You could feel the difference from regular threshold — the metabolic ceiling was being genuinely challenged.",
    tags: ["threshold", "critical-power", "advanced"],
  },
  {
    name: "Threshold Pyramid",
    category: "threshold",
    durationMin: 75,
    tss: 96,
    rationale: "Ascending then descending threshold blocks build toward the peak effort in the middle of the session, then step back down — teaching the rider what 100% FTP feels like from multiple approach angles, and building fatigue-resistance through the second descending half.",
    structure: "12 min warmup → 5 min @ 97% → 4 min easy → 8 min @ 99% → 4 min easy → 10 min @ 101% → 4 min easy → 8 min @ 99% → 4 min easy → 5 min @ 97% → 14 min cooldown",
    executionCue: "The 10-minute peak block is the hardest — it comes when you're already fatigued. The descending blocks (8 min, 5 min) must be completed even if you're tired. Descending threshold blocks train the most fatigue-resistant muscle fibers.",
    successFeel: "All blocks completed. The 10-minute peak block was the hardest thing in the session. The final 5-minute block felt easier than the first 5-minute block even though you're more tired — that's pacing intelligence developing.",
    tags: ["threshold", "pyramid", "variety"],
  },

  // ── VO2MAX (additional) ───────────────────────────────────────────────────
  {
    name: "40/20 Ronnestad",
    category: "vo2max",
    durationMin: 60,
    tss: 82,
    rationale: "Rønnestad's 40/20 protocol: 40 seconds at maximal aerobic power (~130% FTP) with only 20 seconds rest. The compressed rest period keeps VO2 elevated for nearly the entire working interval, achieving more accumulated time at VO2max than equal-duration 1:1 work:rest protocols.",
    structure: "15 min warmup → 3 sets of 10×(40s@130% / 20s@50%) with 5 min rest between sets → 10 min cooldown",
    executionCue: "130% FTP for 40 seconds is very hard. The 20-second rest is almost nothing — incomplete recovery is the design. By rep 8-10 of each set you'll be hurting. Never coast to zero power during the 20-second rest.",
    successFeel: "All 30 reps completed (3 sets × 10). Set 3 is significantly harder than set 1. Power may drop 5-10% in the last few reps of set 3 — that's acceptable. Power maintained above 115% FTP in all reps = excellent.",
    tags: ["vo2max", "ronnestad", "intermittent", "advanced"],
  },
  {
    name: "3-Minute VO2max Repeats",
    category: "vo2max",
    durationMin: 65,
    tss: 88,
    rationale: "6×3 minute intervals at 114% FTP — one of the most effective VO2max formats in research literature. Three minutes allows full VO2max elevation while short enough that power can be maintained at a level that maximally stresses the oxygen transport system.",
    structure: "15 min warmup → 6×3 min @ 114% FTP (3 min recovery @ 50%) → 14 min cooldown",
    executionCue: "Start each rep at 112% FTP, build to 114-116% by minute 2. The third minute of each rep should be genuinely maximal. If you can't hold 110% in rep 6, reduce to 112% for all reps next time.",
    successFeel: "Rep 6 was the hardest thing you've done on the bike this week. HR was above 90% of max in the final minute of reps 4-6. Full 6 reps completed.",
    tags: ["vo2max", "research-backed"],
  },
  {
    name: "Seiler 4×8",
    category: "vo2max",
    durationMin: 70,
    tss: 92,
    rationale: "Stephen Seiler's extended VO2max protocol: 4×8 minutes at 106-108% FTP with 2:1 work:rest ratio. Longer intervals than traditional 4×4, requiring sustained cardiac output at VO2max rather than the brief cardiovascular spikes of shorter reps.",
    structure: "14 min warmup → 4×8 min @ 107% FTP (4 min recovery @ 50%) → 8 min cooldown",
    executionCue: "106-108% FTP for 8 full minutes — the last 2 minutes of each rep are where adaptation happens. HR should reach 90%+ of max by minute 6 of each rep. Cadence 90+ rpm maintains cardiovascular efficiency. If HR won't elevate to 88%+ max, power target is too low.",
    successFeel: "All 4 reps completed. HR peaked in the final 2 minutes of each rep (that sustained cardiac stress is the entire point). Rep 4 was the hardest and you finished it.",
    tags: ["vo2max", "seiler", "extended-intervals", "advanced"],
  },
  {
    name: "VO2max Pyramid",
    category: "vo2max",
    durationMin: 59,
    tss: 78,
    rationale: "Ascending and descending intervals (1-2-3-2-1 min) allow the rider to experience VO2max stress without committing to full 4-5 minute blocks — excellent introduction to high-intensity work, or a volume-reduced VO2max session on a high-fatigue week.",
    structure: "15 min warmup → 1+2+3+2+1 min @ 115% FTP (2 min recovery between each) → 15 min cooldown",
    executionCue: "The 3-minute rep is the peak effort. 1-minute reps feel easy — that's by design, they're warm-up intensity for the harder reps to come. Start each rep at 112% FTP and build. Don't hold back on the 3-minute rep.",
    successFeel: "3-minute rep felt genuinely hard — near maximal. The 1-minute reps after the 3-minute (descending) felt easier than expected, showing metabolic recovery even with incomplete rest.",
    tags: ["vo2max", "pyramid", "moderate-intensity", "intro-vo2"],
  },
  {
    name: "60/60 Intervals",
    category: "vo2max",
    durationMin: 65,
    tss: 85,
    rationale: "60 seconds at VO2max power / 60 seconds easy — the equal work:rest ratio allows more total interval time at high intensity than 3×3 minute formats while maintaining quality in each rep. Used extensively in national team programs.",
    structure: "15 min warmup → 3 sets of 6×(60s@115% / 60s@50%) with 5 min between sets → 8 min cooldown",
    executionCue: "115% FTP for 60 seconds — you should be working very hard. The 60-second rest isn't full recovery; you return to the next rep at 65-70% of max oxygen uptake. Never coast the rest periods.",
    successFeel: "18 reps completed. Set 3 was significantly harder than set 1. Power held above 110% in all reps in set 3 = excellent execution.",
    tags: ["vo2max", "intermittent", "quality"],
  },

  // ── NEUROMUSCULAR (additional) ────────────────────────────────────────────
  {
    name: "Spin-Up Sprints",
    category: "neuromuscular",
    durationMin: 50,
    tss: 48,
    rationale: "Gradual acceleration to maximum cadence (vs. fixed power) trains the fast-twitch motor unit recruitment pattern — the ability to access top-end speed quickly is trained separately from raw sprint power. Used for criterium and track cycling preparation.",
    structure: "15 min warmup → 8×30s spin-up (build from 90 rpm to max cadence within 30s, light gear) → 2 min easy between → 15 min cooldown",
    executionCue: "Use a gear lighter than you'd sprint in — this is a cadence drill, not a power drill. Build cadence from 90 rpm as fast as possible, reaching max cadence by second 20-25. Upper body stays relaxed and stable regardless of leg speed.",
    successFeel: "Peak cadence in rep 8 equals or exceeds peak cadence in rep 1 (no fatigue decline = clean neuromuscular execution). Legs feel the slight soreness of high-cadence muscular stress in the hip flexors.",
    tags: ["neuromuscular", "cadence", "technique"],
  },
  {
    name: "Anaerobic Bursts",
    category: "neuromuscular",
    durationMin: 55,
    tss: 62,
    rationale: "6×1 minute efforts at 130% FTP target the anaerobic alactic and lactic systems — building the energy reserves that power attacks, breakaway attempts, and steep short climbs. One minute is the canonical anaerobic capacity stimulus duration.",
    structure: "15 min warmup → 6×1 min @ 130% FTP (4 min easy recovery) → 16 min cooldown",
    executionCue: "130% FTP for a full minute is very hard. Go all-out from the first second of each rep. Recovery must be full (4 minutes) — these are maximal efforts, not interval training. If rep 6 power drops more than 15% below rep 1, full 4-minute recovery wasn't adequate.",
    successFeel: "All 6 reps completed. Power in rep 6 within 10% of rep 1 = excellent. Completely out of breath at the end of each rep — that's the correct effort level.",
    tags: ["neuromuscular", "anaerobic", "attack-training"],
  },

  // ── INTERMITTENT (additional) ─────────────────────────────────────────────
  {
    name: "Tabata Protocol",
    category: "intermittent",
    durationMin: 30,
    tss: 45,
    rationale: "The original Tabata (Izumi Tabata, 1996): 8×20s at 170% FTP / 10s rest — just 4 minutes of intervals, but the 20/10 format at supramaximal intensity achieves VO2max stimulus in a fraction of the time of longer intervals. Short total session makes it ideal for time-crunched days.",
    structure: "12 min warmup → 8×(20s @ 170% FTP / 10s complete rest) → 5 min steady @ 60% → 13 min cooldown",
    executionCue: "170% FTP for 20 seconds — this is an all-out effort. 10 seconds of complete rest (stop pedaling). The 8 reps take exactly 4 minutes. If you can complete all 8 reps above 150% FTP, your effort was calibrated correctly.",
    successFeel: "The 4-minute Tabata block feels like the hardest thing possible. VO2max is fully reached by rep 5-6. The complete rest periods are essential — partial pedaling defeats the protocol.",
    tags: ["intermittent", "tabata", "time-crunched", "research-backed"],
  },
  {
    name: "40/20 HIIT",
    category: "intermittent",
    durationMin: 50,
    tss: 72,
    rationale: "40 seconds hard / 20 seconds easy — similar to Ronnestad 40/20 but at a slightly lower intensity (120% vs 130%), making it accessible at TSB -10 to -15 where a full Ronnestad session would be counterproductive.",
    structure: "12 min warmup → 4 sets of 8×(40s@120% / 20s@50%) with 4 min rest between sets → 11 min cooldown",
    executionCue: "120% FTP for 40 seconds — very hard but sustainable for all 8 reps per set. The 20-second rest is active, not complete. By set 4, you'll be significantly fatigued; reduce power to 115% if necessary to complete all reps.",
    successFeel: "32 total reps completed. Last set was the hardest but you finished all 8 reps. Breathing was maximal throughout each set.",
    tags: ["intermittent", "hiit", "moderate"],
  },
  {
    name: "15/15 Micro-Intervals",
    category: "intermittent",
    durationMin: 50,
    tss: 65,
    rationale: "15 seconds hard / 15 seconds easy (Ronnestad-derived) — very short work periods allow very high power targets, creating a high peak power stimulus with less total lactate accumulation than 30/30 or 40/20 formats. Excellent for VO2max development with lower recovery cost.",
    structure: "12 min warmup → 4 sets of 10×(15s@135% / 15s@50%) with 4 min rest between sets → 10 min cooldown",
    executionCue: "135% FTP for 15 seconds — explosive but controlled. The 15-second rest is very short; start the next rep before you feel recovered. Never let power drop to zero during the rest period.",
    successFeel: "40 total reps completed. Power in last set was within 10% of first set — the short duration makes power maintenance easier than in 30/30 or 40/20 formats.",
    tags: ["intermittent", "micro-intervals", "neuromuscular"],
  },
];

// ─── Phase Workout Selection ────────────────────────────────────────────────
export const PHASE_GUIDELINES = {
  Base: {
    focus: "aerobic foundation",
    primary: ["Foundation Ride", "Long Endurance", "Two-Hour Foundation", "Over-Distance Ride", "Z2 with Cadence Drills", "Sprint Builder", "Surge Ride", "Strength Endurance", "Endurance with Muscle Tension", "Aerobic Threshold Ride"],
    supporting: ["Tempo Cruise", "Continuous Tempo", "Progressive Tempo", "Easy Flush", "Spin & Recover", "Short Active Recovery"],
    avoid: ["2×20 FTP Blocks", "Norwegian 4×4", "Over-Under Intervals", "5×5 VO2max", "Descending Threshold", "Seiler 4×8", "Critical Power Development", "40/20 Ronnestad"],
    note: "80% Z1-Z2 volume. Sprint Builder, Surge Ride, and Anaerobic Bursts are acceptable — short maximal efforts don't create lasting lactate accumulation. Two-Hour Foundation is the most important single session in Base. One structured hard session per week maximum.",
  },
  Build: {
    focus: "FTP and VO2max development",
    primary: ["Sweet Spot Primer", "Sweet Spot Classic", "3×15 Sweet Spot", "Extended Sweet Spot", "Sweet Spot Progression", "Sweet Spot Time Trial", "Threshold Development", "Short Threshold Intervals", "Threshold Cruise Intervals", "Norwegian 4×4", "3-Minute VO2max Repeats"],
    supporting: ["Foundation Ride", "Long Endurance", "Tempo Cruise", "Sub-Threshold Blocks", "30/30 Blitz", "60/60 Intervals", "Micro Intervals", "4×4 Two-Set", "VO2max Pyramid", "15/15 Micro-Intervals"],
    avoid: [],
    note: "Progressive overload. Early Build: sweet spot + threshold intro. Mid Build: add VO2max. Late Build: 2×20, Norwegian 4×4, Seiler 4×8 for trained riders. Always bookend hard sessions with Foundation rides. 2-3 hard sessions per week maximum. Never increase volume AND intensity in the same week.",
  },
  Recovery: {
    focus: "adaptation and regeneration",
    primary: ["Short Active Recovery", "Spin & Recover", "Extended Recovery Flush", "Easy Flush", "Foundation Ride"],
    supporting: ["Tempo Cruise", "Continuous Tempo"],
    avoid: ["Threshold Development", "2×20 FTP Blocks", "Norwegian 4×4", "5×5 VO2max", "Over-Under Intervals", "Descending Threshold", "Extended Sweet Spot", "Sweet Spot Progression", "3×15 Sweet Spot", "Seiler 4×8", "Critical Power Development"],
    note: "Volume cut 40-60%. At most one short quality session (Tempo Cruise). The body adapts DURING recovery weeks — this is not wasted time, it is when fitness from the load block is consolidated.",
  },
  Taper: {
    focus: "shed fatigue, keep race-pace sharpness, target event 2-3 weeks out",
    primary: ["Foundation Ride", "Tempo Cruise", "Sweet Spot Classic"],
    supporting: ["Long Endurance", "Micro Intervals", "Surge Ride"],
    avoid: ["Norwegian 4×4", "2×20 FTP Blocks", "Over-Under Intervals", "5×5 VO2max", "Descending Threshold", "Extended Sweet Spot"],
    note: "Cut total volume ~20-30% below the rider's recent normal week, more as the event gets closer. Keep 1-2 SHORT touches of race-pace intensity (Sweet Spot Classic or a shortened threshold touch, not a full hard session) so sharpness isn't lost. When in doubt, cut duration before cutting intensity — a shorter version of a familiar session beats a novel hard one this close to the event.",
  },
  RaceWeek: {
    focus: "arrive fresh, event this week or next",
    primary: ["Spin & Recover", "Race Day Opener"],
    supporting: ["Foundation Ride"],
    avoid: ["Threshold Development", "2×20 FTP Blocks", "Norwegian 4×4", "5×5 VO2max", "Over-Under Intervals", "Descending Threshold", "Extended Sweet Spot", "Sweet Spot Progression", "Sweet Spot Classic", "Tempo Ladder", "30/30 Blitz"],
    note: "No new training stress. Short easy rides only, plus one 'Race Day Opener' 1-2 days before the event to stay activated without adding fatigue. Schedule the event day itself as a Rest Day in the plan (the rider logs the real event separately) and keep the day after light too.",
  },
} as const;

/**
 * PROGRESSION LADDER - a DEFAULT reference ordering, not a mandatory
 * one-directional sequence. REVISED (July 2026): an external review
 * correctly noted that forcing every rider through all 22 rungs in order
 * (never skipping) doesn't match how real coaching works - a rider training
 * for a hilly gran fondo, a short crit, or pure weight loss needs different
 * emphasis, and this ladder should bend to the rider's stated goal rather
 * than the goal bending to the ladder. It's most useful for a rider with no
 * strong goal preference of their own, as a sensible default path from
 * aerobic base toward higher intensity. Repeating the same named workout
 * across consecutive weeks (with a small, deliberate change in duration,
 * reps, or power) is often the RIGHT call, not a failure of variety - it's
 * what allows specific adaptation, reliable week-over-week comparison, and
 * genuine progressive overload. Variety for its own sake is not a coaching
 * goal.
 */
export const PROGRESSION_LADDER = [
  "Foundation Ride",            // Rung 1: aerobic base, mitochondrial density
  "Two-Hour Foundation",        // Rung 2: extended aerobic — the foundation of all elite training
  "Tempo Cruise",               // Rung 3: lactate clearance, Z3 introduction
  "Continuous Tempo",           // Rung 4: unbroken Z3 — builds buffering and mental toughness
  "Sub-Threshold Blocks",       // Rung 5: 88% FTP bridge before true sweet spot
  "Sweet Spot Primer",          // Rung 6: 4×7 min @ 88% — entry-level sweet spot
  "Sweet Spot Classic",         // Rung 7: 3×10 min @ 90% — cornerstone sweet spot session
  "3×15 Sweet Spot",            // Rung 8: 3×15 min @ 90% — intermediate sweet spot
  "Sweet Spot Progression",     // Rung 9: ascending blocks 10+15+20 min @ 90%
  "Extended Sweet Spot",        // Rung 10: 2×20 min @ 90% — sustained sweet spot
  "Short Threshold Intervals",  // Rung 11: 6×5 min @ 100% — threshold accumulation
  "Threshold Development",      // Rung 12: 4×8 min @ 100% — threshold quality
  "Threshold Cruise Intervals", // Rung 13: 5×5 min @ 100% — threshold volume
  "Critical Power Development", // Rung 14: 3×12 min @ 102% — above-threshold ceiling
  "Over-Under Intervals",       // Rung 15: lactate buffering at the threshold boundary
  "VO2max Pyramid",             // Rung 16: 1+2+3+2+1 min — VO2max introduction
  "4×4 Two-Set",                // Rung 17: 2+2 Norwegian variant — stepping stone
  "Norwegian 4×4",              // Rung 18: 4×4 min @ 108% — VO2max development
  "3-Minute VO2max Repeats",    // Rung 19: 6×3 min @ 114% — research-backed VO2max
  "5×5 VO2max",                 // Rung 20: VO2max volume
  "Seiler 4×8",                 // Rung 21: extended VO2max, sustained cardiac stress
  "2×20 FTP Blocks",            // Rung 22: race-pace FTP simulation
] as const;

/**
 * Condensed workout library injected into the AI system prompt.
 * Keep this in sync with WORKOUT_LIBRARY above.
 */
export const WORKOUT_LIBRARY_PROMPT = `
NAMED WORKOUT PROTOCOLS — use these exact names as session titles. Choose from this library every time. Plans must feel like they were designed by a professional coach who studied this rider's actual data, not generated from a template.

RECOVERY (active recovery — flush fatigue without creating new stress. Use the day after a hard session when Rest Day is not needed but new stress must be avoided):
• "Spin & Recover" — 30 min, Z1 @ 50-60% FTP, 90+ rpm. Legs should feel noticeably better by minute 25 than minute 5.
• "Easy Flush" — 45 min, easy build → 25 min Z1 @ 55% FTP → cooldown. Slightly more volume than Spin & Recover; purely physiological clearance, not training stimulus.

ENDURANCE / FOUNDATION (Z2 — 56-75% FTP per Coggan):
Continuous Z2 rides are legitimate coaching tools — they build mitochondrial density and aerobic base, serve as essential bookends between hard sessions, and provide genuine aerobic volume. Prescribe them with a clear purpose (not as generic filler). Choose the right option for the day's role:
• "Foundation Ride" — 60 min, Z2 @ 65-73% FTP, conversational pace. Primary aerobic base builder and hard-session bookend. The most versatile easy-day option.
• "Long Endurance" — 90 min, Z2 @ 65-73% FTP. Higher aerobic volume stimulus; use when the rider's session-length budget allows.
• "Z2 with Cadence Drills" — 60 min, 4× (8 min Z2 @ 68% FTP + 2 min cadence drills @ 100-110 rpm), bookended by 10 min warmup/cooldown. The 8-min Z2 blocks are the aerobic base; the 2-min blocks are the technique drills.
• "Surge Ride" — 60 min, Z2 base with 6×1 min surges @ 110% FTP (5 min Z2 between). Metabolic variety without meaningful recovery cost.
• "Endurance with Muscle Tension" — 65 min, Z2 base with 4×5 min low-cadence blocks @ 55 rpm (3 min normal cadence between). Cycling-specific strength stimulus within the aerobic zone.
• "Endurance Openers" — 60 min, Z2 base with 5×30s openers @ 110% FTP (3 min between). Activation session for the day before a hard session or event.

TEMPO (Z3 — 76-90% FTP, always appropriate, never needs high TSB):
• "Tempo Cruise" — 60 min (10 warmup → 2×15 min @ 80% / 5 rec → 15 cooldown). 3-4 word sentences at target. Second block harder = correct.
• "Tempo Ladder" — 75 min (12 warmup → 10+15+20 min @ 80% / 5 min recovery between blocks → 8 cooldown). 20-min block is the real stimulus.
• "Sub-Threshold Blocks" — 75 min (12 warmup → 3×15 min @ 88% / 5 min rec → 3 cooldown). Bridge from sweet spot to threshold. Requires TSB ≥ -15.
• "Strength Endurance" — 65 min (15 warmup → 3×8 min @ 81% FTP / 55-65 rpm / 4 min rec → 14 cooldown). Quads burn muscularly — that's the correct signal.

SWEET SPOT (88-93% FTP — the most time-efficient zone. Requires TSB ≥ -20):
• "Sweet Spot Primer" — 55 min (12 warmup → 4×7 min @ 88% / 3 min rec → 3 cooldown). Beginner entry to sweet spot — fewer, shorter blocks than Classic.
• "Sweet Spot Classic" — 60 min (10 warmup → 3×10 min @ 90% / 4 rec → 8 cooldown). Pacing: start 88%, not 93%. Block 1 discipline makes block 3 possible.
• "3×15 Sweet Spot" — 75 min (12 warmup → 3×15 min @ 90% / 5 rec → 3 cooldown). Natural progression from 3×10 min. If block 3 fades, power was too high.
• "Extended Sweet Spot" — 75 min (15 warmup → 2×20 min @ 90% / 8 rec → 4 cooldown). Second block within 3% of first = progression ready.
• "Sweet Spot Progression" — 70 min (12 warmup → 10+15+20 min @ 90% / 5 each → 3 cooldown). Ascending difficulty in a single session.
• "Sweet Spot Time Trial" — 65 min (12 warmup → 35 min continuous @ 89% → 18 cooldown). No recovery — builds tolerance for sustained effort.
• "Low-Cadence Sweet Spot" — 65 min (15 warmup → 3×12 min @ 89% / 70-75 rpm / 4 rec → 2 cooldown). Dual stimulus: cardiovascular + muscular endurance.

THRESHOLD (97-105% FTP — requires TSB ≥ -12):
• "Short Threshold Intervals" — 60 min (12 warmup → 6×5 min @ 100% / 2.5 rec → 3 cooldown). Short recovery accumulates lactate deliberately — the stress IS the workout.
• "Threshold Development" — 60 min (8 warmup → 4×8 min @ 100% / 4 rec → 4 cooldown). Quality > quantity — 3 quality blocks > 4 faded ones.
• "Threshold Cruise Intervals" — 60 min (12 warmup → 5×5 min @ 100% / 2.5 rec → 10.5 cooldown). High threshold volume, lower per-rep commitment.
• "Critical Power Development" — 70 min (12 warmup → 3×12 min @ 102% / 6 rec → 4 cooldown). Above-threshold work targets the critical power ceiling. Advanced only.
• "Threshold Pyramid" — 75 min (12 warmup → 5+8+10+8+5 min @ ascending % / 4 rec each → 11 cooldown). Peak effort in the middle of the session; descending blocks train fatigue-resistance.
• "2×20 FTP Blocks" — 70 min (10 warmup → 2×20 min @ 98% / 7 rec → 6 cooldown). Gold standard. Start at 97% — pacing discipline is the entire test.
• "Descending Threshold" — 65 min (12 warmup → 12+10+8+6 min stepping 97→103% / 4 rec each → 5 cooldown). Builds mental toughness. Final block at 103% feels like a sprint.
• "Over-Under Intervals" — 65 min (12 warmup → 3×9 min cycling 3 min@105%/3 min@93% / 5 rec → 11 cooldown). Never ease below 90% during 'under' phases.
• "FTP Test Protocol" — 60 min (15 progressive warmup → 5 min easy → 20 min ALL OUT → 20 min cooldown). Assessment only. After the effort, Zwift displays the FTP result — the rider updates profile.ftp from that value.

VO2MAX (106-120% FTP — requires TSB ≥ -5 and intermediate+ rider):
• "Micro Intervals" — 55 min (12 warmup → 12×1 min @ 117% / 1 rec → 19 cooldown). Entry-level VO2max. Last 4 reps harder than first 4.
• "VO2max Pyramid" — 59 min (15 warmup → 1+2+3+2+1 min @ 115% / 2 rec each → 27 cooldown). Intro to VO2max without long rep commitment. Great variety session.
• "60/60 Intervals" — 65 min (15 warmup → 3 sets of 6×(60s@115% / 60s@50%) / 5 set-rest → 4 cooldown). Equal work:rest. Set 3 significantly harder than set 1 = correct execution.
• "4×4 Two-Set" — 65 min (12 warmup → [2×4 min@108%/4 rec] + 8 Z2 + [2×4 min@108%/4 rec] → 13 cooldown). Beginner Norwegian variant. Graduate to full 4×4 when this feels manageable.
• "Norwegian 4×4" — 60 min (12 warmup → 4×4 min @ 108% / 4 rec → 16 cooldown). Last 2 min of each rep MUST be genuinely hard. Cadence 95+ rpm.
• "3-Minute VO2max Repeats" — 65 min (15 warmup → 6×3 min @ 114% / 3 rec → 14 cooldown). Highly effective per research. Rep 6 must be the hardest thing this week.
• "5×5 VO2max" — 70 min (15 warmup → 5×5 min @ 110% / 5 rec → 5 cooldown). Equal work:rest. Rep 5 = hardest thing this week.
• "40/20 Ronnestad" — 60 min (15 warmup → 3 sets of 10×(40s@130% / 20s@50%) / 5 set-rest → 5 cooldown). Compressed rest keeps VO2 elevated throughout. Advanced riders only (TSB ≥ -5, trained+).
• "Seiler 4×8" — 70 min (14 warmup → 4×8 min @ 107% / 4 rec → 8 cooldown). Extended VO2max intervals — HR must reach 90%+ max in last 2 min each rep. Advanced only.

NEUROMUSCULAR (acceptable even in Base — minimal lactate, neurological only):
• "Sprint Builder" — 50 min (15 warmup → 8×15s ALL OUT ~150% FTP, pure neuromuscular — NOT sub-FTP / 2.5 min rec @ 52% FTP → 13 Z2 flush). Last sprint near-equal to first = success. IMPORTANT: describe sprints as "~150% FTP neuromuscular", never "ALL OUT FTP" (contradictory).
• "Spin-Up Sprints" — 50 min (15 warmup → 8×30s cadence spin-ups / 2 min rec → 15 cooldown). Builds pedaling speed and motor unit recruitment. Light gear, max cadence.
• "Anaerobic Bursts" — 55 min (15 warmup → 6×1 min @ 130% / 4 min rec → 10 cooldown). Trains anaerobic capacity for attacks and climbs. Full recovery between reps is non-negotiable.
• "Race Day Opener" — 35 min (10 warmup → 3×1 min @ 110% / 3 min easy → 5 min @ 80% → 8 spindown). Pre-event only (24-48h before race). Activation, not training stress.

INTERMITTENT (requires TSB ≥ -8 — metabolically demanding):
• "15/15 Micro-Intervals" — 50 min (12 warmup → 4 sets of 10×(15s@135% / 15s@50%) / 4 set-rest → 6 cooldown). High-power, low-recovery-cost intermittent work. Good starter for riders new to above-threshold.
• "30/30 Blitz" — 60 min (12 warmup → 3 sets of 8×(30s@120% / 30s@50%) / 5 set-rest → 14 cooldown). Never coast the off intervals — active recovery maintains elevated VO2.
• "Tabata Protocol" — 30 min (12 warmup → 8×(20s@170% / 10s complete rest) → 5 min @ 60% → 9 cooldown). True Tabata: 4 min of supramaximal work achieves VO2max in minimal time.
• "40/20 HIIT" — 50 min (12 warmup → 3 sets of 8×(40s@120% / 20s@50%) / 4 set-rest → 6 cooldown). Slightly lower intensity than Ronnestad — eligible at TSB down to -8 (where Ronnestad requires ≥ -5). Below TSB -8, use Tempo Cruise instead.

RIDER LEVEL GUIDANCE (W/kg is ONE input, not the sole gate - also weigh age, training history, injury/medical history, technical skill, stated goal, and how this rider has actually responded to intensity before):
• < 2.5 W/kg (Beginner): default to Foundation Ride, Spin & Recover, Surge Ride, Tempo Cruise, Sprint Builder. Sweet spot/threshold/VO2max only if the rider's own history/notes show real prior intensity tolerance — otherwise build aerobic base first.
• 2.5-3.0 W/kg (Novice): Add Sweet Spot Primer, Sweet Spot Classic, Micro Intervals, 30/30 Blitz, 15/15 Micro-Intervals. Threshold typically late Build at TSB >= -8, sooner if the rider's history supports it.
• 3.0-3.5 W/kg (Intermediate): Full sweet spot range including 3x15. Add Threshold Development, Short Threshold Intervals, 4x4 Two-Set, VO2max Pyramid, 60/60 Intervals.
• 3.5+ W/kg (Trained): Full library, including Norwegian 4x4, 2x20, Over-Under, Seiler 4x8, 40/20 Ronnestad, Critical Power Development.
• If wPerKg is null: mark rider level as unknown and apply conservative beginner-leaning defaults. Do NOT infer level from absolute FTP watts alone — raw wattage is not comparable across body mass, sex, age, or rider type. Rely on ride history (recent TSS, how hard sessions were completed) and riderProfile/notes for level signals.

SESSION READINESS - TSB is a training-load MODEL (derived from CTL/ATL), not a direct measurement of the rider's body: it cannot see sleep, illness, stress, or pain. Treat these as soft defaults, and let the rider's own notes/subjective feel override the number - always cite the actual TSB when substituting, but say so as "today's estimated load balance," not as settled fact:
• VO2max (106%+): TSB >= -5 as a default. Below, or if the rider mentions feeling unusually fatigued/unwell → substitute Sweet Spot Classic or Sub-Threshold Blocks (not 60/60 Intervals — that IS a VO2max session at 115% FTP).
• Threshold (100%+): TSB >= -12 as a default → substitute Sweet Spot Classic or Sub-Threshold Blocks.
• Sweet Spot (88%+): TSB >= -20 as a default → substitute Tempo Cruise or Tempo Ladder.
• Intermittent (30/30, 40/20): TSB >= -8 as a default → substitute 15/15 Micro-Intervals or Tempo Cruise.
• Neuromuscular/Sprint: TSB >= -15 as a default → substitute Sprint Builder (shorter) or Z2 with Cadence Drills.
• Tempo structured sessions: always appropriate regardless of TSB.
• SAFETY: any rider-reported chest pain, dizziness, unusually elevated resting HR, or sharp/orthopedic pain overrides every threshold above — default to Rest Day and suggest they check with a doctor before resuming intensity.

PROGRESSION LADDER - a DEFAULT path, not a mandatory one-way sequence. Progress means the right next challenge — repeat with a small bump, consolidate, or step up as the coaching situation demands:
Foundation Ride / Long Endurance → Surge Ride / Z2 with Cadence Drills → Tempo Cruise → Tempo Ladder → Sub-Threshold Blocks → Sweet Spot Primer → Sweet Spot Classic → 3×15 Sweet Spot → Extended Sweet Spot → Short Threshold Intervals → Threshold Development → Over-Under Intervals → Critical Power Development → Norwegian 4×4 → Seiler 4×8

WEEKLY SEQUENCING:
• Hardest session: when TSB is highest (typically day 2-3 after a rest or easy day opening the week).
• Pattern: rest/easy → hard → easy (Foundation Ride / Spin & Recover / Z2 with Cadence Drills) → hard → moderate → endurance → rest.
• After Norwegian 4×4 / 2×20 / Seiler 4×8: mandatory Rest Day.
• Never two hard sessions on consecutive days — insert a Foundation Ride, Spin & Recover, or Rest Day between.

PHASE SELECTION:
• Base → Foundation Ride, Long Endurance, Z2 with Cadence Drills, Surge Ride, Endurance with Muscle Tension, Sprint Builder, Tempo Cruise, Tempo Ladder, Endurance Openers. Max 1 quality session/week (Sweet Spot+). Easy days = Foundation or Z2 variants; rest when volume is met.
• Build → Sweet Spot series, Threshold series, VO2max series as primary sessions (2-3/week). Easy days = Foundation Ride, Spin & Recover, or Z2 with Cadence Drills.
• Recovery → Rest Days, Spin & Recover, and Easy Flush only. Nothing above 60% FTP. Volume cut 40-60% from normal week.
• Taper → Foundation Ride, Tempo Cruise, one Sweet Spot Classic session, one Race Day Opener. No VO2max or Threshold volume work.
• RaceWeek → Race Day Opener placed 1-2 days before event. Foundation Ride or Spin & Recover on other days. Event day and day after = Rest Day.

COACHING QUALITY CHECK:
For Base/Build weeks: include at least ONE session at Sweet Spot (88%+ FTP) or harder — unless TSB is below -25, this is a Recovery phase week, or the rider explicitly requested a lighter week. A plan with only Tempo and easy sessions is under-prescribing for most riders outside those exceptions; verify you have a clear justification before returning it.
Foundation, Endurance, Recovery, and Tempo sessions are support sessions — they enable hard work, bookend it, and accelerate recovery between hard days. They are legitimate and necessary coaching tools. They are not sufficient as the ONLY weekly content for a Build or Base rider who is ready for more.
When selecting support sessions, choose the right one for the day's role: Foundation Ride or Long Endurance for aerobic volume; Spin & Recover or Easy Flush the day after a hard session; Z2 with Cadence Drills or Surge Ride when some structure is preferred on an easy day.
`.trim();

// ─── Canonical Workout Structure Blocks ────────────────────────────────────
//
// Pre-computed, mathematically exact workout block arrays for every named
// workout in the library. These are used server-side in normalizeWeeklyPlan()
// to guarantee that a named workout has exactly the right interval structure —
// correct repeats, durations, and power targets — regardless of what the AI
// generated. The AI may drift slightly in its structure JSON; the canonical
// definition never does.
//
// Block rules (matching lib/zwo.ts structureToBlocks):
//  • warmup: powerFtp = top of the ramp (builds from 0.45 → powerFtp)
//  • cooldown: powerFtp = start of the ramp (ramps from powerFtp → 0.40)
//  • intervals: durationMin = repeats × (onSec + offSec) / 60
//  • All blocks in a workout must sum to the stated totalMin
//
// Import note: WorkoutStructureBlock is re-exported from lib/zwo.ts.

import type { WorkoutStructureBlock } from "./zwo";

export interface CanonicalWorkoutEntry {
  /** Reference total duration in minutes (exact sum of all blocks). */
  totalMin: number;
  blocks: WorkoutStructureBlock[];
}

export const CANONICAL_WORKOUT_STRUCTURES: Record<string, CanonicalWorkoutEntry> = {

  // ── RECOVERY ────────────────────────────────────────────────────────────
  "Spin & Recover": {
    totalMin: 30,
    blocks: [
      { type: "warmup",      durationMin: 3,  powerFtp: 0.55, label: "Easy spin in" },
      { type: "steadystate", durationMin: 24, powerFtp: 0.55, label: "Z1 active recovery @ 50-60% FTP, 90+ rpm" },
      { type: "cooldown",    durationMin: 3,  powerFtp: 0.50, label: "Easy spin out" },
    ],
  },
  "Easy Flush": {
    totalMin: 45,
    blocks: [
      { type: "warmup",      durationMin: 10, powerFtp: 0.55, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 25, powerFtp: 0.55, label: "Z1 @ 55% FTP" },
      { type: "cooldown",    durationMin: 10, powerFtp: 0.50, label: "Easy cool-down" },
    ],
  },

  // ── ENDURANCE / FOUNDATION ───────────────────────────────────────────────
  "Foundation Ride": {
    totalMin: 60,
    blocks: [
      { type: "warmup",      durationMin: 10, powerFtp: 0.65, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 40, powerFtp: 0.69, label: "Z2 @ 65-73% FTP" },
      { type: "cooldown",    durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Long Endurance": {
    totalMin: 90,
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.65, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 65, powerFtp: 0.69, label: "Z2 @ 65-73% FTP" },
      { type: "cooldown",    durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Z2 with Cadence Drills": {
    totalMin: 60,
    // 4 × (8 min Z2 @ 68% + 2 min cadence drill @ 65%) = 4 × 600s = 40 min
    blocks: [
      { type: "warmup",    durationMin: 10, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 40, powerFtp: 0.68, recoveryPowerFtp: 0.65,
        repeats: 4, onSec: 480, offSec: 120,
        label: "4×8 min Z2 + 2 min cadence drill (100-110 rpm)" },
      { type: "cooldown",  durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Surge Ride": {
    totalMin: 60,
    // 6 × (1 min surge @ 110% + 5 min Z2 @ 68%) = 6 × 360s = 36 min
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 36, powerFtp: 1.10, recoveryPowerFtp: 0.68,
        repeats: 6, onSec: 60, offSec: 300,
        label: "6×1 min surges @ 110% FTP" },
      { type: "cooldown",  durationMin: 12, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── TEMPO ────────────────────────────────────────────────────────────────
  "Tempo Cruise": {
    totalMin: 60,
    // 2 × (15 min @ 80% + 5 min recovery @ 58%) = 2 × 1200s = 40 min
    blocks: [
      { type: "warmup",    durationMin: 10, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 40, powerFtp: 0.80, recoveryPowerFtp: 0.58,
        repeats: 2, onSec: 900, offSec: 300,
        label: "2×15 min @ 80% FTP" },
      { type: "cooldown",  durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Tempo Ladder": {
    totalMin: 75,
    // Ascending blocks: 10 min @ 78% → 15 min @ 81% → 20 min @ 83%
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.78, label: "10 min @ 78% FTP" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.58, label: "5 min easy recovery" },
      { type: "steadystate", durationMin: 15, powerFtp: 0.81, label: "15 min @ 81% FTP" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.58, label: "5 min easy recovery" },
      { type: "steadystate", durationMin: 20, powerFtp: 0.83, label: "20 min @ 83% FTP (main stimulus)" },
      { type: "cooldown",    durationMin: 8,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Strength Endurance": {
    totalMin: 65,
    // 3 × (8 min @ 81% FTP / 55-65 rpm + 4 min recovery @ 60%) = 3 × 720s = 36 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.73, label: "Progressive warm-up to 85% FTP" },
      { type: "intervals", durationMin: 36, powerFtp: 0.81, recoveryPowerFtp: 0.60,
        repeats: 3, onSec: 480, offSec: 240,
        label: "3×8 min @ 81% FTP / 55-65 rpm (low cadence)" },
      { type: "cooldown",  durationMin: 14, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── SWEET SPOT ───────────────────────────────────────────────────────────
  "Sweet Spot Classic": {
    totalMin: 60,
    // 3 × (10 min @ 90% + 4 min recovery @ 50%) = 3 × 840s = 42 min
    blocks: [
      { type: "warmup",    durationMin: 10, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 42, powerFtp: 0.90, recoveryPowerFtp: 0.50,
        repeats: 3, onSec: 600, offSec: 240,
        label: "3×10 min @ 90% FTP" },
      { type: "cooldown",  durationMin: 8,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Extended Sweet Spot": {
    totalMin: 75,
    // 2 × (20 min @ 90% + 8 min recovery @ 52%) = 2 × 1680s = 56 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 56, powerFtp: 0.90, recoveryPowerFtp: 0.52,
        repeats: 2, onSec: 1200, offSec: 480,
        label: "2×20 min @ 90% FTP" },
      { type: "cooldown",  durationMin: 4,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Sweet Spot Progression": {
    totalMin: 70,
    // Ascending: 10 min @ 88% → 15 min @ 90% → 20 min @ 92%
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.88, label: "10 min @ 88% FTP (opener)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.50, label: "5 min recovery" },
      { type: "steadystate", durationMin: 15, powerFtp: 0.90, label: "15 min @ 90% FTP" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.50, label: "5 min recovery" },
      { type: "steadystate", durationMin: 20, powerFtp: 0.92, label: "20 min @ 92% FTP (main stimulus)" },
      { type: "cooldown",    durationMin: 3,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── THRESHOLD ────────────────────────────────────────────────────────────
  "Threshold Development": {
    totalMin: 60,
    // 4 × (8 min @ 100% + 4 min recovery @ 52%) = 4 × 720s = 48 min
    blocks: [
      { type: "warmup",    durationMin: 8,  powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 48, powerFtp: 1.00, recoveryPowerFtp: 0.52,
        repeats: 4, onSec: 480, offSec: 240,
        label: "4×8 min @ 100% FTP" },
      { type: "cooldown",  durationMin: 4,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Threshold Cruise Intervals": {
    totalMin: 60,
    // 5 × (5 min @ 100% + 2.5 min @ 52%) = 5 × 450s = 37.5 min
    blocks: [
      { type: "warmup",    durationMin: 12,   powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 37.5, powerFtp: 1.00, recoveryPowerFtp: 0.52,
        repeats: 5, onSec: 300, offSec: 150,
        label: "5×5 min @ 100% FTP (short recovery — accumulated lactate is the goal)" },
      { type: "cooldown",  durationMin: 10.5, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "2×20 FTP Blocks": {
    totalMin: 70,
    // 2 × (20 min @ 98% + 7 min recovery @ 52%) = 2 × 1620s = 54 min
    blocks: [
      { type: "warmup",    durationMin: 10, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 54, powerFtp: 0.98, recoveryPowerFtp: 0.52,
        repeats: 2, onSec: 1200, offSec: 420,
        label: "2×20 min @ 98% FTP (gold standard threshold session)" },
      { type: "cooldown",  durationMin: 6,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Over-Under Intervals": {
    totalMin: 65,
    // 3 × (9 min over-under block + 5 min recovery) = 3 × 840s = 42 min
    // Over-under modelled as: onSec=540 (9 min at 'over'), offSec=300 (5 min recovery)
    // Note: the internal over/under cycling within each 9-min block is described in
    // the label and the workout description carries the execution detail.
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 42, powerFtp: 1.05, recoveryPowerFtp: 0.55,
        repeats: 3, onSec: 540, offSec: 300,
        label: "3×9 min over-under cycling (3 min@105% / 3 min@93% / 3 min@105%)" },
      { type: "cooldown",  durationMin: 11, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Descending Threshold": {
    totalMin: 65,
    // 12 min@97% → 10 min@99% → 8 min@101% → 6 min@103%, equal 4-min recovery each
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 12, powerFtp: 0.97, label: "12 min @ 97% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.99, label: "10 min @ 99% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 8,  powerFtp: 1.01, label: "8 min @ 101% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 6,  powerFtp: 1.03, label: "6 min @ 103% FTP (final push)" },
      { type: "cooldown",    durationMin: 5,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── VO2MAX ───────────────────────────────────────────────────────────────
  "Norwegian 4×4": {
    totalMin: 60,
    // 4 × (4 min @ 108% + 4 min recovery @ 52%) = 4 × 480s = 32 min
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 32, powerFtp: 1.08, recoveryPowerFtp: 0.52,
        repeats: 4, onSec: 240, offSec: 240,
        label: "4×4 min @ 108% FTP (95+ rpm — HR must plateau in last 2 min each rep)" },
      { type: "cooldown",  durationMin: 16, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "4×4 Two-Set": {
    totalMin: 65,
    // Set 1: 2 × (4 min @ 108% + 4 min @ 52%) = 16 min; Z2 bridge 8 min; Set 2: 16 min
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals",   durationMin: 16, powerFtp: 1.08, recoveryPowerFtp: 0.52,
        repeats: 2, onSec: 240, offSec: 240,
        label: "Set 1: 2×4 min @ 108% FTP" },
      { type: "steadystate", durationMin: 8,  powerFtp: 0.65, label: "8 min Z2 bridge between sets" },
      { type: "intervals",   durationMin: 16, powerFtp: 1.08, recoveryPowerFtp: 0.52,
        repeats: 2, onSec: 240, offSec: 240,
        label: "Set 2: 2×4 min @ 108% FTP (harder than set 1 — that's the design)" },
      { type: "cooldown",    durationMin: 13, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "5×5 VO2max": {
    totalMin: 70,
    // 5 × (5 min @ 110% + 5 min recovery @ 52%) = 5 × 600s = 50 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 50, powerFtp: 1.10, recoveryPowerFtp: 0.52,
        repeats: 5, onSec: 300, offSec: 300,
        label: "5×5 min @ 110% FTP (equal work:rest — don't rush the recovery)" },
      { type: "cooldown",  durationMin: 5,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Micro Intervals": {
    totalMin: 55,
    // 12 × (1 min @ 117% + 1 min recovery @ 52%) = 12 × 120s = 24 min
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 24, powerFtp: 1.17, recoveryPowerFtp: 0.52,
        repeats: 12, onSec: 60, offSec: 60,
        label: "12×1 min @ 117% FTP (last 4 reps must be harder than first 4)" },
      { type: "cooldown",  durationMin: 19, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── NEUROMUSCULAR ────────────────────────────────────────────────────────
  "Sprint Builder": {
    totalMin: 50,
    // 8 × (15 s ALL OUT @ 150% + 2.5 min recovery @ 52%) = 8 × 165s = 22 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 22, powerFtp: 1.50, recoveryPowerFtp: 0.52,
        repeats: 8, onSec: 15, offSec: 150,
        label: "8×15 s all-out sprints (last sprint near-equal to first in peak power)" },
      { type: "cooldown",  durationMin: 13, powerFtp: 0.52, label: "Z2 flush cool-down" },
    ],
  },
  "Race Day Opener": {
    totalMin: 35,
    // 3 × (1 min @ 110% + 3 min easy @ 55%) = 3 × 240s = 12 min; then 5 min @ 80%
    blocks: [
      { type: "warmup",      durationMin: 10, powerFtp: 0.65, label: "Easy warm-up" },
      { type: "intervals",   durationMin: 12, powerFtp: 1.10, recoveryPowerFtp: 0.55,
        repeats: 3, onSec: 60, offSec: 180,
        label: "3×1 min @ 110% FTP (activation — sharp, not all-out)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.78, label: "5 min @ 80% FTP" },
      { type: "cooldown",    durationMin: 8,  powerFtp: 0.55, label: "Easy spin-down" },
    ],
  },

  // ── INTERMITTENT ─────────────────────────────────────────────────────────
  "30/30 Blitz": {
    totalMin: 60,
    // 3 sets of 8 × (30s @ 120% + 30s @ 50%) = each set 8 × 60s = 8 min; 5 min rest between sets
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 30, offSec: 30,
        label: "Set 1: 8×30s @ 120% FTP (never coast the off intervals)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 30, offSec: 30,
        label: "Set 2: 8×30s @ 120% FTP" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 30, offSec: 30,
        label: "Set 3: 8×30s @ 120% FTP (this set should hurt — that's success)" },
      { type: "cooldown",    durationMin: 14, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── RECOVERY (additional) ─────────────────────────────────────────────────
  "Short Active Recovery": {
    totalMin: 20,
    blocks: [
      { type: "warmup",      durationMin: 3,  powerFtp: 0.50, label: "Very easy spin in" },
      { type: "steadystate", durationMin: 14, powerFtp: 0.50, label: "Ultra-light recovery @ 45-55% FTP" },
      { type: "cooldown",    durationMin: 3,  powerFtp: 0.48, label: "Gentle spin out" },
    ],
  },
  "Extended Recovery Flush": {
    totalMin: 50,
    blocks: [
      { type: "warmup",      durationMin: 10, powerFtp: 0.55, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 30, powerFtp: 0.54, label: "Z1 @ 50-58% FTP" },
      { type: "cooldown",    durationMin: 10, powerFtp: 0.50, label: "Easy wind-down" },
    ],
  },

  // ── ENDURANCE (additional) ────────────────────────────────────────────────
  "Two-Hour Foundation": {
    totalMin: 120,
    blocks: [
      { type: "warmup",      durationMin: 20, powerFtp: 0.65, label: "Progressive warm-up" },
      { type: "steadystate", durationMin: 85, powerFtp: 0.69, label: "Z2 @ 65-73% FTP — main aerobic stimulus" },
      { type: "cooldown",    durationMin: 15, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Aerobic Threshold Ride": {
    totalMin: 60,
    blocks: [
      { type: "warmup",      durationMin: 10, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 40, powerFtp: 0.74, label: "AeT @ 72-76% FTP (top of Z2)" },
      { type: "cooldown",    durationMin: 10, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Endurance with Muscle Tension": {
    totalMin: 65,
    // 4 × (6 min Z2 @ 68% / 90rpm + 5 min Z2 @ 68% / 55rpm) = 44 min
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.65, label: "Easy warm-up" },
      { type: "intervals", durationMin: 44, powerFtp: 0.68, recoveryPowerFtp: 0.68,
        repeats: 4, onSec: 360, offSec: 300,
        label: "4× (6 min Z2 @ 90 rpm → 5 min Z2 @ 55 rpm low-cadence)" },
      { type: "cooldown",  durationMin: 9,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Over-Distance Ride": {
    totalMin: 100,
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.65, label: "Progressive warm-up" },
      { type: "steadystate", durationMin: 70, powerFtp: 0.69, label: "Z2 @ 66-72% FTP" },
      { type: "cooldown",    durationMin: 15, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Endurance Openers": {
    totalMin: 60,
    // 5 × (1 min opener @ 110% + 5 min Z2 @ 68%) = 5 × 360s = 30 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 30, powerFtp: 1.10, recoveryPowerFtp: 0.68,
        repeats: 5, onSec: 30, offSec: 330,
        label: "5×30s activation openers @ 110% FTP (Z2 between)" },
      { type: "cooldown",  durationMin: 15, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── TEMPO (additional) ────────────────────────────────────────────────────
  "Continuous Tempo": {
    totalMin: 60,
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 35, powerFtp: 0.81, label: "35 min continuous Z3 @ 79-83% FTP" },
      { type: "cooldown",    durationMin: 13, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Progressive Tempo": {
    totalMin: 65,
    // Four 10-min blocks stepping up: 76% → 79% → 82% → 85%
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.76, label: "Block 1: 10 min @ 76% FTP" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.79, label: "Block 2: 10 min @ 79% FTP" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.82, label: "Block 3: 10 min @ 82% FTP" },
      { type: "steadystate", durationMin: 10, powerFtp: 0.85, label: "Block 4: 10 min @ 85% FTP (main stimulus)" },
      { type: "cooldown",    durationMin: 13, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Sub-Threshold Blocks": {
    totalMin: 75,
    // 3 × (15 min @ 88% + 5 min @ 55%) = 3 × 1200s = 60 min; 12 warmup + 3 cooldown = 75
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 60, powerFtp: 0.88, recoveryPowerFtp: 0.55,
        repeats: 3, onSec: 900, offSec: 300,
        label: "3×15 min @ 88% FTP (bridge between sweet spot and threshold)" },
      { type: "cooldown",  durationMin: 3,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── SWEET SPOT (additional) ───────────────────────────────────────────────
  "Sweet Spot Primer": {
    totalMin: 55,
    // 4 × (7 min @ 88% + 3 min recovery @ 50%) = 4 × 600s = 40 min; 12 warmup + 3 cooldown = 55
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.68, label: "Easy warm-up" },
      { type: "intervals", durationMin: 40, powerFtp: 0.88, recoveryPowerFtp: 0.50,
        repeats: 4, onSec: 420, offSec: 180,
        label: "4×7 min @ 88% FTP (beginner-friendly sweet spot entry)" },
      { type: "cooldown",  durationMin: 3,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "3×15 Sweet Spot": {
    totalMin: 75,
    // 3 × (15 min @ 90% + 5 min @ 52%) = 3 × 1200s = 60 min; 12 warmup + 3 cooldown = 75
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 60, powerFtp: 0.90, recoveryPowerFtp: 0.52,
        repeats: 3, onSec: 900, offSec: 300,
        label: "3×15 min @ 90% FTP (natural progression from 3×10 min)" },
      { type: "cooldown",  durationMin: 3,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Sweet Spot Time Trial": {
    totalMin: 65,
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 35, powerFtp: 0.89, label: "35 min continuous @ 89% FTP (one unbroken effort)" },
      { type: "cooldown",    durationMin: 18, powerFtp: 0.55, label: "Extended cool-down" },
    ],
  },
  "Low-Cadence Sweet Spot": {
    totalMin: 65,
    // 3 × (12 min @ 89% / 72 rpm + 4 min @ 55% / 90 rpm) = 3 × 960s = 48 min; 15 wu + 2 cd = 65
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 48, powerFtp: 0.89, recoveryPowerFtp: 0.55,
        repeats: 3, onSec: 720, offSec: 240,
        label: "3×12 min @ 89% FTP / 70-75 rpm (muscular endurance focus)" },
      { type: "cooldown",  durationMin: 2,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── THRESHOLD (additional) ────────────────────────────────────────────────
  "FTP Test Protocol": {
    totalMin: 60,
    // 20-min effort + warmup/cooldown. The 5-min easy pre-effort is included.
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.80, label: "Progressive warmup (include 3×1 min @ 110%)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.55, label: "5 min easy pre-effort" },
      { type: "steadystate", durationMin: 20, powerFtp: 1.05, label: "20 min ALL OUT time trial (FTP = 95% of avg power)" },
      { type: "cooldown",    durationMin: 20, powerFtp: 0.55, label: "Full cool-down" },
    ],
  },
  "Short Threshold Intervals": {
    totalMin: 60,
    // 6 × (5 min @ 100% + 2.5 min @ 55%) = 6 × 450s = 45 min
    blocks: [
      { type: "warmup",    durationMin: 12,  powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 45,  powerFtp: 1.00, recoveryPowerFtp: 0.55,
        repeats: 6, onSec: 300, offSec: 150,
        label: "6×5 min @ 100% FTP (2.5 min recovery — short rest by design)" },
      { type: "cooldown",  durationMin: 3,   powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Critical Power Development": {
    totalMin: 70,
    // 3 × (12 min @ 102% + 6 min @ 52%) = 3 × 1080s = 54 min
    blocks: [
      { type: "warmup",    durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "intervals", durationMin: 54, powerFtp: 1.02, recoveryPowerFtp: 0.52,
        repeats: 3, onSec: 720, offSec: 360,
        label: "3×12 min @ 102% FTP (above threshold — critical power zone)" },
      { type: "cooldown",  durationMin: 4,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "Threshold Pyramid": {
    totalMin: 75,
    // 5+8+10+8+5 min blocks with 4 min recovery each = 5×4 min = 20 min recovery
    // Total: 12 warmup + 36 work + 16 recovery + 11 cooldown = 75 min
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.72, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.97, label: "5 min @ 97% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 8,  powerFtp: 0.99, label: "8 min @ 99% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 10, powerFtp: 1.01, label: "10 min @ 101% FTP (peak effort)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 8,  powerFtp: 0.99, label: "8 min @ 99% FTP" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min recovery" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.97, label: "5 min @ 97% FTP" },
      { type: "cooldown",    durationMin: 11, powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── VO2MAX (additional) ───────────────────────────────────────────────────
  "40/20 Ronnestad": {
    totalMin: 60,
    // 3 sets of 10 × (40s @ 130% + 20s @ 50%) = 10 × 60s = 10 min per set; 5 min rest; 15 wu + 5 cd = 60
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.72, label: "Progressive warm-up" },
      { type: "intervals",   durationMin: 10, powerFtp: 1.30, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 40, offSec: 20,
        label: "Set 1: 10×(40s@130% / 20s@50%) — compressed rest keeps VO2 elevated" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 10, powerFtp: 1.30, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 40, offSec: 20,
        label: "Set 2: 10×(40s@130% / 20s@50%)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 10, powerFtp: 1.30, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 40, offSec: 20,
        label: "Set 3: 10×(40s@130% / 20s@50%) — final set should feel very hard" },
      { type: "cooldown",    durationMin: 5,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "3-Minute VO2max Repeats": {
    totalMin: 65,
    // 6 × (3 min @ 114% + 3 min recovery @ 50%) = 6 × 360s = 36 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.72, label: "Progressive warm-up" },
      { type: "intervals", durationMin: 36, powerFtp: 1.14, recoveryPowerFtp: 0.50,
        repeats: 6, onSec: 180, offSec: 180,
        label: "6×3 min @ 114% FTP (build to 116% in final minute each rep)" },
      { type: "cooldown",  durationMin: 14, powerFtp: 0.55, label: "Extended cool-down" },
    ],
  },
  "Seiler 4×8": {
    totalMin: 70,
    // 4 × (8 min @ 107% + 4 min recovery @ 50%) = 4 × 720s = 48 min
    blocks: [
      { type: "warmup",    durationMin: 14, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 48, powerFtp: 1.07, recoveryPowerFtp: 0.50,
        repeats: 4, onSec: 480, offSec: 240,
        label: "4×8 min @ 107% FTP — HR must reach 90%+ of max in last 2 min each rep" },
      { type: "cooldown",  durationMin: 8,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "VO2max Pyramid": {
    totalMin: 59,
    // 1+2+3+2+1 min at 115% with 2 min recovery each:
    // 5 intervals: 1+2+3+2+1 = 9 min work; 4 recoveries of 2 min = 8 min; total interval section = 17 min
    // 15 warmup + 17 intervals + 27 cooldown = 59 min
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "steadystate", durationMin: 1,  powerFtp: 1.15, label: "1 min @ 115% FTP" },
      { type: "steadystate", durationMin: 2,  powerFtp: 0.52, label: "2 min recovery" },
      { type: "steadystate", durationMin: 2,  powerFtp: 1.15, label: "2 min @ 115% FTP" },
      { type: "steadystate", durationMin: 2,  powerFtp: 0.52, label: "2 min recovery" },
      { type: "steadystate", durationMin: 3,  powerFtp: 1.15, label: "3 min @ 115% FTP (peak effort)" },
      { type: "steadystate", durationMin: 2,  powerFtp: 0.52, label: "2 min recovery" },
      { type: "steadystate", durationMin: 2,  powerFtp: 1.15, label: "2 min @ 115% FTP" },
      { type: "steadystate", durationMin: 2,  powerFtp: 0.52, label: "2 min recovery" },
      { type: "steadystate", durationMin: 1,  powerFtp: 1.15, label: "1 min @ 115% FTP (final)" },
      { type: "cooldown",    durationMin: 27, powerFtp: 0.55, label: "Extended cool-down" },
    ],
  },
  "60/60 Intervals": {
    totalMin: 65,
    // 3 sets of 6 × (60s @ 115% + 60s @ 50%) = each set 6 × 120s = 12 min; 5 min rest
    blocks: [
      { type: "warmup",      durationMin: 15, powerFtp: 0.70, label: "Progressive warm-up" },
      { type: "intervals",   durationMin: 12, powerFtp: 1.15, recoveryPowerFtp: 0.50,
        repeats: 6, onSec: 60, offSec: 60,
        label: "Set 1: 6×(60s@115% / 60s@50%)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 12, powerFtp: 1.15, recoveryPowerFtp: 0.50,
        repeats: 6, onSec: 60, offSec: 60,
        label: "Set 2: 6×(60s@115% / 60s@50%)" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.52, label: "5 min set recovery" },
      { type: "intervals",   durationMin: 12, powerFtp: 1.15, recoveryPowerFtp: 0.50,
        repeats: 6, onSec: 60, offSec: 60,
        label: "Set 3: 6×(60s@115% / 60s@50%) — final set should be hardest" },
      { type: "cooldown",    durationMin: 4,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },

  // ── NEUROMUSCULAR (additional) ────────────────────────────────────────────
  "Spin-Up Sprints": {
    totalMin: 50,
    // 8 × (30s spin-up cadence drill + 2 min easy @ 55%) = 8 × 150s = 20 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.65, label: "Easy warm-up" },
      { type: "intervals", durationMin: 20, powerFtp: 1.20, recoveryPowerFtp: 0.55,
        repeats: 8, onSec: 30, offSec: 120,
        label: "8×30s spin-up drills (build to max cadence, light gear)" },
      { type: "cooldown",  durationMin: 15, powerFtp: 0.52, label: "Easy cool-down" },
    ],
  },
  "Anaerobic Bursts": {
    totalMin: 55,
    // 6 × (1 min @ 130% + 4 min @ 52%) = 6 × 300s = 30 min
    blocks: [
      { type: "warmup",    durationMin: 15, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals", durationMin: 30, powerFtp: 1.30, recoveryPowerFtp: 0.52,
        repeats: 6, onSec: 60, offSec: 240,
        label: "6×1 min @ 130% FTP (full 4 min recovery — maximal each rep)" },
      { type: "cooldown",  durationMin: 10, powerFtp: 0.52, label: "Easy cool-down" },
    ],
  },

  // ── INTERMITTENT (additional) ─────────────────────────────────────────────
  "Tabata Protocol": {
    totalMin: 30,
    // 8 × (20s @ 170% + 10s rest) = 4 min; then 5 min @ 60%
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up with some openers" },
      { type: "intervals",   durationMin: 4,  powerFtp: 1.70, recoveryPowerFtp: 0.00,
        repeats: 8, onSec: 20, offSec: 10,
        label: "8×(20s@170% / 10s complete rest) — true Tabata protocol" },
      { type: "steadystate", durationMin: 5,  powerFtp: 0.60, label: "5 min @ 60% FTP" },
      { type: "cooldown",    durationMin: 9,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "40/20 HIIT": {
    totalMin: 50,
    // 3 sets of 8 × (40s @ 120% + 20s @ 50%) = 8 × 60s = 8 min per set; 4 min rest; 12 wu + 6 cd = 50
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 40, offSec: 20,
        label: "Set 1: 8×(40s@120% / 20s@50%)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min set recovery" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 40, offSec: 20,
        label: "Set 2: 8×(40s@120% / 20s@50%)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min set recovery" },
      { type: "intervals",   durationMin: 8,  powerFtp: 1.20, recoveryPowerFtp: 0.50,
        repeats: 8, onSec: 40, offSec: 20,
        label: "Set 3: 8×(40s@120% / 20s@50%) — final set" },
      { type: "cooldown",    durationMin: 6,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
  "15/15 Micro-Intervals": {
    totalMin: 50,
    // 4 sets of 10 × (15s @ 135% + 15s @ 50%) = 10 × 30s = 5 min per set; 4 min rest
    blocks: [
      { type: "warmup",      durationMin: 12, powerFtp: 0.70, label: "Easy warm-up" },
      { type: "intervals",   durationMin: 5,  powerFtp: 1.35, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 15, offSec: 15,
        label: "Set 1: 10×(15s@135% / 15s@50%)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min set recovery" },
      { type: "intervals",   durationMin: 5,  powerFtp: 1.35, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 15, offSec: 15,
        label: "Set 2: 10×(15s@135% / 15s@50%)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min set recovery" },
      { type: "intervals",   durationMin: 5,  powerFtp: 1.35, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 15, offSec: 15,
        label: "Set 3: 10×(15s@135% / 15s@50%)" },
      { type: "steadystate", durationMin: 4,  powerFtp: 0.52, label: "4 min set recovery" },
      { type: "intervals",   durationMin: 5,  powerFtp: 1.35, recoveryPowerFtp: 0.50,
        repeats: 10, onSec: 15, offSec: 15,
        label: "Set 4: 10×(15s@135% / 15s@50%) — final set" },
      { type: "cooldown",    durationMin: 6,  powerFtp: 0.55, label: "Easy cool-down" },
    ],
  },
};

/**
 * Returns the canonical pre-computed block structure for a named workout.
 *
 * When `targetMin` is within ±8 min of the library's reference duration, the
 * blocks are scaled by adjusting warmup/cooldown proportionally (the core
 * interval structure is never shortened — changing repeats or interval duration
 * defeats the purpose of the named protocol). If the target differs by more
 * than 8 minutes, returns null (caller should use the AI's own structure or
 * generateDefaultBlocks instead).
 *
 * Called by normalizeWeeklyPlan() in lib/ai.ts to guarantee that every named
 * workout in the generated plan uses exactly the right protocol, regardless of
 * minor drift in the AI's structure generation.
 */
export function resolveCanonicalStructure(
  name: string,
  targetMin?: number,
): WorkoutStructureBlock[] | null {
  const canonical = CANONICAL_WORKOUT_STRUCTURES[name];
  if (!canonical) return null;

  const target = targetMin ?? canonical.totalMin;
  const delta = target - canonical.totalMin;

  // Within ±8 min — adjust warmup/cooldown to fit, keep intervals intact
  if (Math.abs(delta) <= 8) {
    if (delta === 0) return canonical.blocks;

    const workBlocks = canonical.blocks.filter(
      (b) => b.type !== "warmup" && b.type !== "cooldown"
    );
    const workTotal = workBlocks.reduce((s, b) => s + b.durationMin, 0);
    const available = target - workTotal;

    // If there isn't room for a minimum warmup + cooldown, return canonical unchanged.
    if (available < 8) return canonical.blocks;

    // Split available time ~60/40 between warmup and cooldown
    const warmupMin = Math.max(5, Math.round(available * 0.6));
    const cooldownMin = Math.max(3, available - warmupMin);

    return canonical.blocks.map((b) => {
      if (b.type === "warmup")   return { ...b, durationMin: warmupMin };
      if (b.type === "cooldown") return { ...b, durationMin: cooldownMin };
      return b;
    });
  }

  // Too far from reference — caller decides what to do
  return null;
}
