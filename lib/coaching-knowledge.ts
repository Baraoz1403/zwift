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
export const RIDER_LEVEL_THRESHOLDS = [
  { label: "Beginner",     minWkg: 0.0,  maxWkg: 2.5,  note: "Foundation + Tempo + Sprint Builder only. No true threshold or VO2max." },
  { label: "Novice",       minWkg: 2.5,  maxWkg: 3.0,  note: "Add Sweet Spot Classic. Threshold Development only in late Build phase." },
  { label: "Intermediate", minWkg: 3.0,  maxWkg: 3.5,  note: "Full sweet spot range. Add Threshold Development, Micro Intervals, 4x4 Two-Set." },
  { label: "Trained",      minWkg: 3.5,  maxWkg: 4.0,  note: "Norwegian 4x4, Over-Under Intervals, 2x20 FTP Blocks, Descending Threshold unlocked." },
  { label: "Advanced",     minWkg: 4.0,  maxWkg: 4.5,  note: "Full library. Polarized model (more Z2 + more Z5, less Z3/Z4 middle ground)." },
  { label: "Elite",        minWkg: 4.5,  maxWkg: 99.0, note: "All sessions available. High volume demands longer recovery windows between hard days." },
] as const;

// ─── Session Readiness Prerequisites (minimum TSB) ─────────────────────────
export const SESSION_PREREQUISITES = {
  vo2max:        { minTsb: -5,  fallback: "Sweet Spot Classic",   note: "VO2max demands near-maximal cardiac output -- legs must be fresh." },
  threshold:     { minTsb: -12, fallback: "Sweet Spot Classic",   note: "Sustained threshold with tired legs becomes junk miles, not adaptation." },
  sweetspot:     { minTsb: -20, fallback: "Tempo Cruise",         note: "Sweet spot is resilient to moderate fatigue." },
  neuromuscular: { minTsb: -15, fallback: "Sprint Builder",       note: "Maximal neural efforts need reasonably fresh legs." },
  intermittent:  { minTsb: -8,  fallback: "Tempo Cruise",         note: "30/30 and similar work is metabolically demanding." },
  tempo:         { minTsb: -99, fallback: "Foundation Ride",      note: "Tempo always productive regardless of fatigue level." },
  endurance:     { minTsb: -99, fallback: "Easy Flush",           note: "Always OK -- aerobic stimulus without meaningful stress." },
  recovery:      { minTsb: -99, fallback: "Spin & Recover",       note: "The purpose is to flush fatigue, not create it." },
} as const;

// ─── Named Workout Library ──────────────────────────────────────────────────

export type WorkoutCategory =
  | "recovery" | "endurance" | "tempo" | "sweetspot"
  | "threshold" | "vo2max" | "neuromuscular" | "intermittent";

export interface NamedWorkout {
  name: string;
  category: WorkoutCategory;
  durationMin: number;
  tss: number;
  rationale: string;
  structure: string;
  executionCue: string;
  successFeel: string;
  tags: string[];
}

export const WORKOUT_LIBRARY: NamedWorkout[] = [

  // RECOVERY
  {
    name: "Spin & Recover",
    category: "recovery",
    durationMin: 30,
    tss: 20,
    rationale: "Active recovery -- flushes metabolic waste without adding new training stress.",
    structure: "30 min continuous @ 50-60% FTP, 90+ rpm, no structure",
    executionCue: "Keep power at 50-60% FTP and cadence above 90 rpm. The heaviness should ease in the last 10 minutes.",
    successFeel: "You should feel noticeably better at minute 25 than minute 5.",
    tags: ["recovery", "beginner-friendly"],
  },
  {
    name: "Easy Flush",
    category: "recovery",
    durationMin: 45,
    tss: 30,
    rationale: "Sustained low-intensity blood flow promotes lactate clearance -- often more valuable than complete rest.",
    structure: "10 min easy build -> 25 min Z1 @ 55% FTP -> 10 min cooldown",
    executionCue: "The 25-minute Z1 block is non-negotiable. Resist the urge to push harder -- this ride's job is biochemical, not cardiovascular.",
    successFeel: "Finish feeling energized, not depleted. If you're tired at the end, you went too hard.",
    tags: ["recovery"],
  },

  // ENDURANCE / FOUNDATION
  {
    name: "Foundation Ride",
    category: "endurance",
    durationMin: 60,
    tss: 60,
    rationale: "Builds mitochondrial density and fat-oxidation enzymes -- the aerobic base that every higher-intensity session rests on.",
    structure: "10 min warmup -> 40 min Z2 @ 65-73% FTP -> 10 min cooldown",
    executionCue: "Hold 65-73% FTP the entire 40 minutes. Cadence 88-95 rpm. If you can't complete full sentences, you're above Z2.",
    successFeel: "You should finish feeling like you could easily ride 30 more minutes. That's the correct Z2 intensity.",
    tags: ["aerobic-base", "beginner-friendly", "zwift-ftp-builder"],
  },
  {
    name: "Long Endurance",
    category: "endurance",
    durationMin: 90,
    tss: 90,
    rationale: "Extended aerobic volume trains the body to spare glycogen and run predominantly on fat.",
    structure: "15 min warmup -> 65 min Z2 @ 65-73% FTP -> 10 min cooldown",
    executionCue: "The first 30 minutes feel easy -- resist the temptation to increase intensity. The last 20 minutes are where real metabolic adaptation happens.",
    successFeel: "Slightly tired but not depleted at 90 minutes. If you're wiped out, you rode too hard in the first half.",
    tags: ["aerobic-base", "volume"],
  },
  {
    name: "Z2 with Cadence Drills",
    category: "endurance",
    durationMin: 60,
    tss: 58,
    rationale: "Foundation ride with short high-cadence inserts to improve neuromuscular efficiency.",
    structure: "10 min warmup -> 4x (8 min Z2 @ 68% + 2 min @ 100-110 rpm / 65%) -> 10 min cooldown",
    executionCue: "During the 2-min high-cadence inserts, let your legs spin freely -- don't mash. Power will drop slightly; that's fine.",
    successFeel: "The 100-rpm blocks should feel almost bouncy, not choppy. If upper body is rocking, drop to 95 rpm.",
    tags: ["aerobic-base", "technique"],
  },
  {
    name: "Surge Ride",
    category: "endurance",
    durationMin: 60,
    tss: 72,
    rationale: "Long Z2 ride with embedded 1-minute power surges at 110% FTP -- adds metabolic variety without full interval recovery cost.",
    structure: "12 min warmup -> 36 min Z2 @ 68% FTP with 6x1 min surges @ 110% FTP (5 min apart) -> 12 min cooldown",
    executionCue: "The surges should be sharp and decisive -- full power for 1 minute, then immediately drop back to Z2 pace.",
    successFeel: "The Z2 sections between surges should still feel controlled. If surges prevent Z2 recovery, shorten them to 45 seconds.",
    tags: ["aerobic-base", "mixed-intensity", "base-phase-ok"],
  },

  // TEMPO
  {
    name: "Tempo Cruise",
    category: "tempo",
    durationMin: 60,
    tss: 72,
    rationale: "Trains lactate clearance and glycogen storage at Z3.",
    structure: "10 min warmup -> 2x15 min @ 78-83% FTP (5 min recovery) -> 15 min cooldown",
    executionCue: "Hold 78-83% FTP. You should be able to say 3-4 words if asked. Don't drift above 85%.",
    successFeel: "The second 15-minute block should feel harder than the first, but completeable.",
    tags: ["tempo", "z3", "zwift-ftp-builder"],
  },
  {
    name: "Tempo Ladder",
    category: "tempo",
    durationMin: 75,
    tss: 90,
    rationale: "Progressively longer blocks teach the body to sustain Z3 for extended periods.",
    structure: "12 min warmup -> 10 min + 15 min + 20 min @ 80% FTP (5 min recovery each) -> 13 min cooldown",
    executionCue: "Start the 10-minute block at 78%. Build to 81% for the 15-min. The 20-min block is the main stimulus at 82-83%.",
    successFeel: "The 20-minute block should be genuinely hard by minutes 16-20.",
    tags: ["tempo", "progression"],
  },
  {
    name: "Strength Endurance",
    category: "tempo",
    durationMin: 65,
    tss: 80,
    rationale: "Low-cadence (55-65 rpm) Z3 efforts build leg muscular strength while developing aerobic fitness.",
    structure: "15 min warmup -> 3x8 min @ 78-84% FTP / 55-65 rpm (4 min recovery @ 60% / 90 rpm) -> 14 min cooldown",
    executionCue: "Keep cadence deliberately at 55-65 rpm during work intervals. Quads will work much harder than normal at this power.",
    successFeel: "Quads should feel muscularly tired (like after a leg workout) rather than cardiovascularly depleted.",
    tags: ["tempo", "strength", "muscular-endurance"],
  },

  // SWEET SPOT
  {
    name: "Sweet Spot Classic",
    category: "sweetspot",
    durationMin: 60,
    tss: 78,
    rationale: "The most time-efficient training zone (88-93% FTP): hard enough to drive FTP adaptation, easy enough to recover in 24-48 hours.",
    structure: "12 min warmup -> 3x10 min @ 88-93% FTP (4 min recovery) -> 14 min cooldown",
    executionCue: "Start each 10-min block at 88% -- not 93%. Pacing discipline on block 1 makes block 3 possible.",
    successFeel: "All 3 blocks completed with even power. Block 3 is hard, but you finish it.",
    tags: ["sweetspot", "ftp-builder", "zwift-build-me-up"],
  },
  {
    name: "Extended Sweet Spot",
    category: "sweetspot",
    durationMin: 75,
    tss: 100,
    rationale: "Two long sweet-spot blocks; extended time at 88-92% FTP creates a substantial aerobic adaptation signal.",
    structure: "15 min warmup -> 2x20 min @ 88-92% FTP (8 min recovery) -> 12 min cooldown",
    executionCue: "Use minutes 1-4 of the 8-minute recovery to genuinely recover below 65% FTP. Second block power should be within 3% of first.",
    successFeel: "If you faded more than 3% in block 2, spend another week at Sweet Spot Classic before progressing here.",
    tags: ["sweetspot", "ftp-builder", "advanced"],
  },
  {
    name: "Sweet Spot Progression",
    category: "sweetspot",
    durationMin: 70,
    tss: 90,
    rationale: "Ascending blocks (10->15->20 min) apply progressive overload within a single session.",
    structure: "12 min warmup -> 10 min + 15 min + 20 min @ 90% FTP (5 min recovery each) -> 8 min cooldown",
    executionCue: "Treat the 10-min block as a warm-into-it at 88%. Step to 90% for the 15-min, then push to 92% if available for the 20-min block.",
    successFeel: "The 20-min block should feel substantially harder than the 10-min opener.",
    tags: ["sweetspot", "progression"],
  },

  // THRESHOLD
  {
    name: "Threshold Development",
    category: "threshold",
    durationMin: 60,
    tss: 82,
    rationale: "Short blocks directly at lactate turn point; 8 minutes is long enough to maximally stress the system, short enough to complete all 4 with quality.",
    structure: "12 min warmup -> 4x8 min @ 97-102% FTP (4 min recovery) -> 12 min cooldown",
    executionCue: "Start block 1 at 97% -- not 102%. Quality beats duration here.",
    successFeel: "4 blocks completed, last block power within 5% of first.",
    tags: ["threshold", "ftp-builder", "zwift-ftp-builder"],
  },
  {
    name: "Threshold Cruise Intervals",
    category: "threshold",
    durationMin: 60,
    tss: 82,
    rationale: "5x5-minute blocks at threshold -- more total threshold time than 4x8 min, with shorter individual reps.",
    structure: "12 min warmup -> 5x5 min @ 98-102% FTP (2.5 min recovery) -> 13 min cooldown",
    executionCue: "The 2.5-minute recovery is intentionally short. By rep 4, accumulated lactate IS the stimulus.",
    successFeel: "Rep 5 should be genuinely hard. If all 5 felt similar, the short recovery didn't challenge you enough.",
    tags: ["threshold", "intermediate"],
  },
  {
    name: "2x20 FTP Blocks",
    category: "threshold",
    durationMin: 70,
    tss: 98,
    rationale: "The gold-standard FTP benchmark: two sustained 20-minute blocks at threshold reveal your true current ceiling.",
    structure: "15 min warmup -> 2x20 min @ 97-100% FTP (8 min recovery) -> 7 min cooldown",
    executionCue: "Start block 1 at 97%. By minute 15 you should feel 'I can hold this, just barely.' The second block gets harder -- that's correct.",
    successFeel: "If both 20-min blocks completed at target power, FTP estimate is accurate. Fade > 3-4% = consider a re-test.",
    tags: ["threshold", "advanced", "classic"],
  },
  {
    name: "Over-Under Intervals",
    category: "threshold",
    durationMin: 65,
    tss: 92,
    rationale: "Alternating just above and just below FTP trains the body to clear lactate while sustaining high power.",
    structure: "12 min warmup -> 3x9 min cycling (3 min @ 105% / 3 min @ 93%) (5 min recovery) -> 11 min cooldown",
    executionCue: "Don't ease below 90% during the 'under' phases -- that defeats the lactate-buffering purpose.",
    successFeel: "By rep 3, the 'over' phases feel genuinely hard. If they felt manageable, FTP may be underestimated.",
    tags: ["threshold", "advanced", "over-under"],
  },
  {
    name: "Descending Threshold",
    category: "threshold",
    durationMin: 65,
    tss: 90,
    rationale: "Decreasing interval lengths (12->10->8->6 min) stepping up 2% each block; trains mental resilience by ending hardest when most fatigued.",
    structure: "12 min warmup -> 12 min @ 97% + 10 min @ 99% + 8 min @ 101% + 6 min @ 103% FTP (equal rest each) -> 11 min cooldown",
    executionCue: "Each block gets shorter but steps up 2% in power. Knowing it's only 6 minutes at the end is exactly the point.",
    successFeel: "The 6-minute block at 103% feels like a sprint after exhausting work. Completing it = this session worked.",
    tags: ["threshold", "advanced", "mental-toughness"],
  },

  // VO2MAX
  {
    name: "Norwegian 4x4",
    category: "vo2max",
    durationMin: 60,
    tss: 90,
    rationale: "Gold-standard VO2max protocol; four 4-minute blocks at 106-110% FTP raise aerobic ceiling more efficiently than any other protocol.",
    structure: "12 min warmup -> 4x4 min @ 106-110% FTP (4 min recovery) -> 16 min cooldown",
    executionCue: "The first 2 minutes of each rep feel manageable. The last 2 minutes are where the adaptation happens. Cadence 95+ rpm.",
    successFeel: "By rep 4, you should barely be able to finish. If rep 4 felt like rep 2, the power target was too low.",
    tags: ["vo2max", "norwegian", "advanced"],
  },
  {
    name: "4x4 Two-Set",
    category: "vo2max",
    durationMin: 65,
    tss: 85,
    rationale: "Two sets of 2x4-minute VO2max intervals with an 8-minute easy block -- delivers the Norwegian stimulus in a more accessible format.",
    structure: "12 min warmup -> (2x4 min @ 108% / 4 min recovery) -> 8 min easy Z2 -> (2x4 min @ 108% / 4 min recovery) -> 9 min cooldown",
    executionCue: "Use the 8-minute easy block genuinely -- drop below 65% FTP. The second set will feel harder; that's by design.",
    successFeel: "All 4 reps completed at target power. Once this feels manageable, graduate to the standard Norwegian 4x4.",
    tags: ["vo2max", "intermediate", "norwegian-variant"],
  },
  {
    name: "5x5 VO2max",
    category: "vo2max",
    durationMin: 70,
    tss: 100,
    rationale: "Five 5-minute blocks at VO2max; 5 minutes is the optimal rep duration -- long enough to fully stress the system, short enough to maintain quality.",
    structure: "15 min warmup -> 5x5 min @ 108-112% FTP (5 min recovery) -> 5 min cooldown",
    executionCue: "Equal work:rest (5:5) is critical. Don't rush the recovery -- HR should be declining through the first 3 recovery minutes.",
    successFeel: "Rep 5 is the hardest thing you'll do this week. All 5 completed = excellent.",
    tags: ["vo2max", "zwift-build-me-up"],
  },
  {
    name: "Micro Intervals",
    category: "vo2max",
    durationMin: 55,
    tss: 80,
    rationale: "Short 1-minute bursts at 115-120% FTP accumulate VO2max stress without pacing discipline required by longer intervals.",
    structure: "12 min warmup -> 12x1 min @ 115-120% FTP (1 min recovery) -> 19 min cooldown",
    executionCue: "The 1:1 work:rest ratio keeps you returning before full recovery. By rep 8, the recovery minute won't feel like enough -- that's the signal.",
    successFeel: "The last 4 reps should be noticeably harder than the first 4. If all 12 felt similar, power target was too low.",
    tags: ["vo2max", "short-intervals"],
  },

  // NEUROMUSCULAR
  {
    name: "Sprint Builder",
    category: "neuromuscular",
    durationMin: 50,
    tss: 50,
    rationale: "15-20 second maximal efforts recruit fast-twitch muscle fibers -- essential even in base phase; these short efforts don't create meaningful lactate accumulation.",
    structure: "15 min warmup -> 8x15 s ALL OUT (2.5 min recovery) -> 15 min Z2 flush",
    executionCue: "Each sprint is 100% -- not 80%, not 90%. Wind up for 3-5 seconds before the clock starts. 2.5 full minutes between efforts.",
    successFeel: "Your last sprint should produce nearly the same peak power as your first.",
    tags: ["neuromuscular", "sprint", "zwift-ftp-builder", "base-phase-ok"],
  },
  {
    name: "Race Day Opener",
    category: "neuromuscular",
    durationMin: 35,
    tss: 30,
    rationale: "Pre-event activation -- brief punchy efforts 24-48 hours before a race activate the neuromuscular system without adding fatigue.",
    structure: "10 min easy warmup -> 3x1 min @ 110% FTP (3 min easy recovery) -> 5 min @ 80% -> 10 min easy spindown",
    executionCue: "Three 1-minute efforts at 110% FTP: sharp and decisive, not all-out sprints. These are neuromuscular reminders, not training stimuli.",
    successFeel: "Legs feel awake and reactive. If you feel fatigued after this, you need another rest day before your event.",
    tags: ["pre-event", "taper", "activation"],
  },

  // INTERMITTENT
  {
    name: "30/30 Blitz",
    category: "intermittent",
    durationMin: 60,
    tss: 78,
    rationale: "30s hard / 30s easy creates a metabolic double-hit, keeping oxygen uptake elevated through the off periods -- accumulates VO2max stress efficiently.",
    structure: "12 min warmup -> 3 sets of 8x(30 s @ 120% / 30 s @ 50%) with 5 min set recovery -> 14 min cooldown",
    executionCue: "The on intervals are 120% FTP -- hard effort, not sprint. Never coast during the off intervals -- active recovery at 50% maintains elevated oxygen uptake.",
    successFeel: "Sets 1-2 are hard. Set 3 is very hard. Completing all 8 reps in set 3 = success.",
    tags: ["intermittent", "zwift-ftp-builder"],
  },
];

// ─── Phase Workout Selection ────────────────────────────────────────────────
export const PHASE_GUIDELINES = {
  Base: {
    focus: "aerobic foundation",
    primary: ["Foundation Ride", "Long Endurance", "Z2 with Cadence Drills", "Sprint Builder", "Surge Ride", "Strength Endurance"],
    supporting: ["Tempo Cruise", "Tempo Ladder", "Easy Flush", "Spin & Recover"],
    avoid: ["2x20 FTP Blocks", "Norwegian 4x4", "Over-Under Intervals", "5x5 VO2max", "Descending Threshold"],
    note: "80% Z1-Z2 volume. Sprint Builder and Surge Ride are acceptable. One hard session per week maximum.",
  },
  Build: {
    focus: "FTP and VO2max development",
    primary: ["Sweet Spot Classic", "Extended Sweet Spot", "Sweet Spot Progression", "Threshold Development", "Threshold Cruise Intervals", "Norwegian 4x4"],
    supporting: ["Foundation Ride", "Long Endurance", "Tempo Cruise", "30/30 Blitz", "Micro Intervals", "4x4 Two-Set"],
    avoid: [],
    note: "Progressive overload. Introduce sweet-spot/threshold in early Build; add VO2max in mid/late Build.",
  },
  Recovery: {
    focus: "adaptation and regeneration",
    primary: ["Spin & Recover", "Easy Flush", "Foundation Ride"],
    supporting: ["Tempo Cruise"],
    avoid: ["Threshold Development", "2x20 FTP Blocks", "Norwegian 4x4", "5x5 VO2max", "Over-Under Intervals"],
    note: "Volume cut 40-60%. At most one short quality session (Tempo Cruise). The body adapts DURING recovery weeks.",
  },
} as const;

export const PROGRESSION_LADDER = [
  "Foundation Ride",
  "Tempo Cruise",
  "Sweet Spot Classic",
  "Sweet Spot Progression",
  "Extended Sweet Spot",
  "Threshold Development",
  "Threshold Cruise Intervals",
  "Over-Under Intervals",
  "Norwegian 4x4",
  "5x5 VO2max",
  "2x20 FTP Blocks",
] as const;

export const WORKOUT_LIBRARY_PROMPT = `
NAMED WORKOUT PROTOCOLS -- always use these exact names as session titles.

RECOVERY:
- "Spin & Recover" -- 30 min, 50-60% FTP, 90+ rpm. Flush metabolic waste. Cue: heaviness eases in last 10 min.
- "Easy Flush" -- 45 min (10 warmup -> 25 Z1 @ 55% -> 10 cooldown). Post-hard-session lactate clearance. Never push harder.

ENDURANCE / FOUNDATION:
- "Foundation Ride" -- 60 min (10 warmup -> 40 Z2 @ 65-73% -> 10 cooldown). Core aerobic base. If you can't speak in sentences, you're above Z2.
- "Long Endurance" -- 90 min (15 warmup -> 65 Z2 @ 65-73% -> 10 cooldown). Last 20 min is where glycogen depletes and fat-oxidation adaptation occurs.
- "Z2 with Cadence Drills" -- 60 min, Z2 with 4x2 min @ 100-110 rpm. Pedaling efficiency builder.
- "Surge Ride" -- 60 min, Z2 base with 6x1 min surges @ 110% FTP (5 min apart). Metabolic variety without threshold recovery cost.

TEMPO (Z3 -- 76-90% FTP):
- "Tempo Cruise" -- 60 min (10 warmup -> 2x15 min @ 80% / 5 min recovery -> 15 cooldown). 3-4 word sentences at target pace.
- "Tempo Ladder" -- 75 min (12 warmup -> 10+15+20 min @ 80% / 5 min each -> 13 cooldown). 20-min block is the main stimulus.
- "Strength Endurance" -- 65 min (15 warmup -> 3x8 min @ 80% / 55-65 rpm / 4 min recovery -> 14 cooldown). Quads burn muscularly -- correct signal.

SWEET SPOT (88-93% FTP -- most time-efficient zone):
- "Sweet Spot Classic" -- 60 min (12 warmup -> 3x10 min @ 90% / 4 min recovery -> 14 cooldown). Start at 88% not 93% -- pacing discipline makes block 3 possible.
- "Extended Sweet Spot" -- 75 min (15 warmup -> 2x20 min @ 90% / 8 min recovery -> 12 cooldown). Second block within 3% of first = progression ready.
- "Sweet Spot Progression" -- 70 min (12 warmup -> 10+15+20 min @ 90% / 5 min each -> 8 cooldown).

THRESHOLD (97-105% FTP -- requires TSB >= -12):
- "Threshold Development" -- 60 min (12 warmup -> 4x8 min @ 100% / 4 min recovery -> 12 cooldown). Quality > duration.
- "Threshold Cruise Intervals" -- 60 min (12 warmup -> 5x5 min @ 100% / 2.5 min recovery -> 13 cooldown). Short recovery IS the stimulus.
- "2x20 FTP Blocks" -- 70 min (15 warmup -> 2x20 min @ 98% / 8 min recovery -> 7 cooldown). Gold standard FTP benchmark.
- "Descending Threshold" -- 65 min (12 warmup -> 12+10+8+6 min stepping up 2% per block / equal rest -> 11 cooldown).
- "Over-Under Intervals" -- 65 min (12 warmup -> 3x9 min cycling 3 min@105%/3 min@93% / 5 min recovery -> 11 cooldown).

VO2MAX (106-120% FTP -- requires TSB >= -5 and intermediate+ rider):
- "Norwegian 4x4" -- 60 min (12 warmup -> 4x4 min @ 108% / 4 min recovery -> 16 cooldown). Last 2 min of each rep MUST be hard. Cadence 95+ rpm.
- "4x4 Two-Set" -- 65 min (12 warmup -> [2x4 min @ 108% / 4 rec] + 8 min Z2 + [2x4 min @ 108% / 4 rec] -> 9 cooldown). Beginner-friendly Norwegian.
- "5x5 VO2max" -- 70 min (15 warmup -> 5x5 min @ 110% / 5 min recovery -> 5 cooldown). Equal work:rest critical.
- "Micro Intervals" -- 55 min (12 warmup -> 12x1 min @ 118% / 1 min recovery -> 19 cooldown). Last 4 reps harder than first 4.

NEUROMUSCULAR (acceptable in Base -- minimal lactate):
- "Sprint Builder" -- 50 min (15 warmup -> 8x15 s ALL OUT / 2.5 min recovery -> 15 Z2 flush).
- "Race Day Opener" -- 35 min (10 warmup -> 3x1 min @ 110% / 3 min easy -> 5 min @ 80% -> 10 spindown). Pre-event only (24-48h before race).

INTERMITTENT:
- "30/30 Blitz" -- 60 min (12 warmup -> 3 sets of 8x(30s@120% / 30s@50%) / 5 min rest -> 14 cooldown). Active recovery during off intervals.

RIDER LEVEL (use wPerKg from input):
- < 2.5 W/kg: Foundation, Tempo, Sprint Builder, Surge Ride, Spin & Recover ONLY. No sweet spot > 3x10 min. No threshold.
- 2.5-3.0 W/kg: Add Sweet Spot Classic, Micro Intervals, 30/30 Blitz. Threshold only in late Build at TSB >= -8.
- 3.0-3.5 W/kg: Full sweet spot + Threshold Development + Threshold Cruise + 4x4 Two-Set.
- 3.5+ W/kg: Full library including Norwegian 4x4, 2x20 FTP Blocks, Over-Under Intervals.
- If wPerKg null: infer from ftpWatts -- < 150W beginner, 150-220W intermediate, > 220W trained.

SESSION READINESS (TSB prerequisites -- cite actual TSB when substituting):
- VO2max: TSB >= -5. Below -> substitute Sweet Spot Classic.
- Threshold: TSB >= -12. Below -> substitute Sweet Spot Classic or Tempo Cruise.
- Sweet Spot: TSB >= -20. Below -> substitute Tempo Cruise.
- Neuromuscular: TSB >= -15.
- Tempo, Foundation, Recovery: always appropriate.

PROGRESSION LADDER (follow in order, never skip rungs):
Foundation -> Tempo Cruise -> Sweet Spot Classic -> Extended Sweet Spot -> Threshold Development -> Over-Under Intervals -> Norwegian 4x4

WEEKLY SEQUENCING:
- Hardest session: schedule day 2-3 of week (after rest day) when TSB is highest.
- Long Endurance: schedule late in week (pre-fatigued legs still generate aerobic signal).
- Pattern: rest/recovery -> hard -> easy -> hard -> easy -> long endurance -> rest.
- Never two hard sessions on consecutive days.

PHASE SELECTION:
- Base -> Foundation, Long Endurance, Surge Ride, Z2 Cadence Drills, Sprint Builder, Tempo Cruise. Max 1 hard/week.
- Build -> Sweet Spot, Threshold, VO2max. Bookend with Foundation. 2-3 hard/week max.
- Recovery -> Spin & Recover, Easy Flush, Foundation only. At most one Tempo Cruise. Volume -40-60%.
`.trim();
