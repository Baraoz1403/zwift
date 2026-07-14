// tests/workout-selection.test.mjs
// Standalone acceptance tests for the Workout Selection Engine.
// Run with: node tests/workout-selection.test.mjs
// No Jest, no Next.js, no KV required.

var WORKOUT_TO_FAMILY = {
  "Z2 with Cadence Drills":"endurance","Surge Ride":"endurance",
  "Endurance with Muscle Tension":"endurance","Endurance Openers":"endurance",
  "Tempo Cruise":"tempo","Tempo Ladder":"tempo","Sub-Threshold Blocks":"tempo","Strength Endurance":"tempo",
  "Sweet Spot Primer":"sweetSpot","Sweet Spot Classic":"sweetSpot","3x15 Sweet Spot":"sweetSpot",
  "Extended Sweet Spot":"sweetSpot","Sweet Spot Progression":"sweetSpot",
  "Sweet Spot Time Trial":"sweetSpot","Low-Cadence Sweet Spot":"sweetSpot",
  "Short Threshold Intervals":"threshold","Threshold Development":"threshold",
  "Threshold Cruise Intervals":"threshold","Critical Power Development":"threshold",
  "Threshold Pyramid":"threshold","2x20 FTP Blocks":"threshold",
  "Descending Threshold":"threshold","Over-Under Intervals":"threshold","FTP Test Protocol":"threshold",
  "Micro Intervals":"vo2max","VO2max Pyramid":"vo2max","60/60 Intervals":"vo2max",
  "4x4 Two-Set":"vo2max","Norwegian 4x4":"vo2max","3-Minute VO2max Repeats":"vo2max",
  "5x5 VO2max":"vo2max","Seiler 4x8":"vo2max",
  "Sprint Builder":"neuromuscular","Spin-Up Sprints":"neuromuscular",
  "Anaerobic Bursts":"anaerobic","Race Day Opener":"neuromuscular",
  "15/15 Micro-Intervals":"anaerobic","30/30 Blitz":"anaerobic",
  "Tabata Protocol":"anaerobic","40/20 HIIT":"anaerobic","40/20 Ronnestad":"anaerobic"
};

var FAMILY_PROGRESSION = {
  endurance:["Surge Ride","Z2 with Cadence Drills","Endurance with Muscle Tension","Endurance Openers"],
  tempo:["Tempo Cruise","Tempo Ladder","Strength Endurance","Sub-Threshold Blocks"],
  sweetSpot:["Sweet Spot Primer","Sweet Spot Classic","3x15 Sweet Spot","Low-Cadence Sweet Spot","Extended Sweet Spot","Sweet Spot Progression","Sweet Spot Time Trial"],
  threshold:["Short Threshold Intervals","Threshold Development","Threshold Cruise Intervals","Threshold Pyramid","Over-Under Intervals","2x20 FTP Blocks","Descending Threshold","Critical Power Development"],
  vo2max:["VO2max Pyramid","Micro Intervals","60/60 Intervals","4x4 Two-Set","Norwegian 4x4","3-Minute VO2max Repeats","5x5 VO2max","Seiler 4x8"],
  neuromuscular:["Sprint Builder","Spin-Up Sprints","Anaerobic Bursts","Race Day Opener"],
  anaerobic:["15/15 Micro-Intervals","30/30 Blitz","40/20 HIIT","40/20 Ronnestad","Tabata Protocol"]
};

var PHASE_ALLOWED = {
  Base:["endurance","tempo","neuromuscular"],
  Build:["endurance","tempo","sweetSpot","threshold","vo2max","neuromuscular"],
  Specialty:["sweetSpot","threshold","vo2max","neuromuscular","anaerobic"],
  Taper:["endurance","tempo","sweetSpot"],
  RaceWeek:["endurance","neuromuscular"],
  Recovery:["endurance"]
};

function getAllowedFamilies(phase) {
  return PHASE_ALLOWED[phase.replace(/\s+/g,"")] || PHASE_ALLOWED[phase]
    || ["endurance","tempo","sweetSpot","threshold","vo2max","neuromuscular"];
}

function getAllowedFamiliesByLevel(wPerKg) {
  if (wPerKg == null || wPerKg < 2.5) return ["endurance","tempo","neuromuscular"];
  if (wPerKg < 3.0) return ["endurance","tempo","sweetSpot","neuromuscular","anaerobic"];
  if (wPerKg < 3.5) return ["endurance","tempo","sweetSpot","threshold","vo2max","neuromuscular","anaerobic"];
  return ["endurance","tempo","sweetSpot","threshold","vo2max","neuromuscular","anaerobic"];
}

function intensityCapFromTsb(tsb, baseMax) {
  if (tsb == null) return Math.min(baseMax, 2);
  if (tsb < -30) return 0;
  if (tsb < -20) return 1;
  if (tsb < -10) return Math.min(baseMax, 2);
  return baseMax;
}

function baseIntensityCap(cyclingLevel, wPerKg) {
  if (wPerKg != null && wPerKg < 2.5) return 1;
  if (wPerKg != null && wPerKg < 3.0) return 2;
  return 3;
}

function determineProgression(family, lastCompleted, exposureCount) {
  var ladder = FAMILY_PROGRESSION[family];
  if (!ladder || ladder.length === 0) return { action:"INTRO", targetIndex:0 };
  if (!lastCompleted || !WORKOUT_TO_FAMILY[lastCompleted]) return { action:"INTRO", targetIndex:0 };
  var currentIdx = ladder.indexOf(lastCompleted);
  if (currentIdx === -1) return { action:"INTRO", targetIndex:0 };
  if (exposureCount === 0) return { action:"REGRESS", targetIndex:Math.max(0, currentIdx - 1) };
  if (exposureCount >= 2) {
    var target = Math.min(ladder.length - 1, currentIdx + 1);
    return { action: currentIdx === target ? "REPEAT" : "PROGRESS", targetIndex: target };
  }
  return { action:"REPEAT", targetIndex:currentIdx };
}

function rankFamilies(allowed, exposure, lastCompleted, phase) {
  var intensityWeight = { endurance:1,tempo:2,sweetSpot:3,threshold:4,vo2max:5,neuromuscular:3,anaerobic:4 };
  var isHighIntensityPhase = /build|specialty/i.test(phase);
  var scored = allowed.map(function(fam) {
    var exp = exposure[fam] || 0;
    var hasHistory = Boolean(lastCompleted[fam]);
    var weight = intensityWeight[fam];
    var score = 10 - Math.min(exp * 3, 9);
    if (!hasHistory && isHighIntensityPhase && weight >= 3) score += 3;
    if (isHighIntensityPhase) score += weight * 0.5;
    else score += (6 - weight) * 0.5;
    return { fam: fam, score: score };
  });
  var end = scored.find(function(s) { return s.fam === "endurance"; });
  if (end) end.score = Math.max(end.score, 2);
  return scored.sort(function(a,b) { return b.score-a.score; }).map(function(s) { return s.fam; });
}

function runSelectionEngine(opts) {
  var coachingState = opts.coachingState;
  var trainingLoad = opts.trainingLoad;
  var phase = opts.phase;
  var cyclingLevel = opts.cyclingLevel;
  var ftp = opts.ftp;
  var weightKg = opts.weightKg;

  var effectiveFtp = ftp || null;
  var effectiveWeight = weightKg || null;
  var wPerKg = effectiveFtp && effectiveWeight && effectiveWeight > 0
    ? Math.round((effectiveFtp / effectiveWeight) * 100) / 100 : null;
  var tsb = trainingLoad ? trainingLoad.tsb : null;
  var baseCap = baseIntensityCap(cyclingLevel, wPerKg);
  var maxIntensitySessions = intensityCapFromTsb(tsb, baseCap);
  var phaseAllowed = getAllowedFamilies(phase);
  var levelAllowed = getAllowedFamiliesByLevel(wPerKg);
  var allowed = phaseAllowed.filter(function(f) { return levelAllowed.indexOf(f) !== -1; });
  var exposure = coachingState && coachingState.exposureLast21Days
    ? coachingState.exposureLast21Days
    : { endurance:0,tempo:0,sweetSpot:0,threshold:0,vo2max:0,neuromuscular:0,anaerobic:0 };
  var lastCompleted = coachingState && coachingState.lastCompletedByFamily
    ? coachingState.lastCompletedByFamily : {};
  var ranked = rankFamilies(allowed, exposure, lastCompleted, phase);
  var priorityFamily = ranked[0] || null;
  var eligibleFamilies = maxIntensitySessions > 0
    ? ranked.slice(0, Math.min(2, ranked.length))
    : [];
  if (eligibleFamilies.indexOf("endurance") === -1 && allowed.indexOf("endurance") !== -1) {
    eligibleFamilies.push("endurance");
  }
  var eligibleWorkouts = [];
  for (var i = 0; i < eligibleFamilies.length; i++) {
    var fam = eligibleFamilies[i];
    var ladder = FAMILY_PROGRESSION[fam];
    if (!ladder) continue;
    var prog = determineProgression(fam, lastCompleted[fam], exposure[fam] || 0);
    eligibleWorkouts.push({ title: ladder[prog.targetIndex], stimulusFamily: fam });
  }
  return { priorityFamily: priorityFamily, maxIntensitySessions: maxIntensitySessions,
           eligibleWorkouts: eligibleWorkouts, allowed: allowed };
}

// Test runner
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  OK  " + name);
    passed++;
  } catch(e) {
    console.error("  FAIL " + name);
    console.error("       " + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || ("Expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)));
}

console.log("\nWorkout Selection Engine -- Acceptance Tests\n");

// A: Fresh rider -> endurance is priority in Base phase, no threshold/vo2max
test("A -- Fresh rider Base phase: endurance reachable, threshold/vo2max excluded", function() {
  var result = runSelectionEngine({
    coachingState: null,
    trainingLoad: { tsb: 5 },
    phase: "Base",
    cyclingLevel: 30,
    ftp: 200,
    weightKg: 70
  });
  assert(result.allowed.indexOf("endurance") !== -1, "endurance should be allowed in Base");
  assert(result.allowed.indexOf("threshold") === -1, "threshold must not be allowed in Base");
  assert(result.allowed.indexOf("vo2max") === -1, "vo2max must not be allowed in Base");
});

// B: 3x sweetSpot -> sweetSpot NOT priority
test("B -- 3x sweetSpot in 21 days: sweetSpot is not priority", function() {
  var result = runSelectionEngine({
    coachingState: {
      exposureLast21Days: { endurance:0,tempo:0,sweetSpot:3,threshold:0,vo2max:0,neuromuscular:0,anaerobic:0 },
      lastCompletedByFamily: { sweetSpot:"Sweet Spot Classic" }
    },
    trainingLoad: { tsb: 0 },
    phase: "Build",
    cyclingLevel: 40,
    ftp: 250,
    weightKg: 70
  });
  assert(result.priorityFamily !== "sweetSpot",
    "sweetSpot should not be priority with 3x exposure, got: " + result.priorityFamily);
});

// C: TSB < -30 -> maxIntensitySessions = 0
test("C -- TSB below -30: maxIntensitySessions = 0", function() {
  var result = runSelectionEngine({
    coachingState: null,
    trainingLoad: { tsb: -35 },
    phase: "Build",
    cyclingLevel: 50,
    ftp: 280,
    weightKg: 70
  });
  assertEqual(result.maxIntensitySessions, 0,
    "Expected 0 intensity sessions, got " + result.maxIntensitySessions);
});

// D: Beginner W/kg < 2.5 -> no threshold or vo2max
test("D -- Beginner W/kg < 2.5: no threshold or vo2max eligible", function() {
  var result = runSelectionEngine({
    coachingState: null,
    trainingLoad: { tsb: 10 },
    phase: "Build",
    cyclingLevel: 10,
    ftp: 150,
    weightKg: 80
  });
  var hasThreshold = result.eligibleWorkouts.some(function(w) { return w.stimulusFamily === "threshold"; });
  var hasVo2max = result.eligibleWorkouts.some(function(w) { return w.stimulusFamily === "vo2max"; });
  assert(!hasThreshold, "Threshold must not be eligible for beginner");
  assert(!hasVo2max, "VO2max must not be eligible for beginner");
});

// E: Base phase -> no vo2max or threshold
test("E -- Base phase: no vo2max or threshold for trained rider (4.28 W/kg)", function() {
  var result = runSelectionEngine({
    coachingState: null,
    trainingLoad: { tsb: 15 },
    phase: "Base",
    cyclingLevel: 60,
    ftp: 300,
    weightKg: 70
  });
  var hasThreshold = result.eligibleWorkouts.some(function(w) { return w.stimulusFamily === "threshold"; });
  var hasVo2max = result.eligibleWorkouts.some(function(w) { return w.stimulusFamily === "vo2max"; });
  assert(!hasThreshold, "Threshold must not be eligible in Base phase");
  assert(!hasVo2max, "VO2max must not be eligible in Base phase");
});

// F: REPEAT with 1 dose at Sweet Spot Primer
test("F -- 1 dose of Sweet Spot Primer -> REPEAT (stay at Sweet Spot Primer)", function() {
  var result = runSelectionEngine({
    coachingState: {
      exposureLast21Days: { endurance:3,tempo:3,sweetSpot:1,threshold:3,vo2max:3,neuromuscular:3,anaerobic:3 },
      lastCompletedByFamily: {
        endurance:"Z2 with Cadence Drills",tempo:"Sub-Threshold Blocks",
        sweetSpot:"Sweet Spot Primer",threshold:"Critical Power Development",
        vo2max:"5x5 VO2max",neuromuscular:"Sprint Builder"
      }
    },
    trainingLoad: { tsb: 5 },
    phase: "Build",
    cyclingLevel: 40,
    ftp: 230,
    weightKg: 70
  });
  assertEqual(result.priorityFamily, "sweetSpot",
    "Expected sweetSpot as priority, got " + result.priorityFamily);
  var ss = result.eligibleWorkouts.find(function(w) { return w.stimulusFamily === "sweetSpot"; });
  assert(ss != null, "Expected sweetSpot in eligible list");
  assertEqual(ss.title, "Sweet Spot Primer",
    "Expected REPEAT at Sweet Spot Primer (1 dose), got " + ss.title);
});

// F2: PROGRESS with 2 doses -> Sweet Spot Classic
test("F2 -- 2 doses of Sweet Spot Primer -> PROGRESS to Sweet Spot Classic", function() {
  var result = runSelectionEngine({
    coachingState: {
      exposureLast21Days: { endurance:3,tempo:3,sweetSpot:2,threshold:3,vo2max:3,neuromuscular:3,anaerobic:3 },
      lastCompletedByFamily: {
        endurance:"Z2 with Cadence Drills",tempo:"Sub-Threshold Blocks",
        sweetSpot:"Sweet Spot Primer",threshold:"Critical Power Development",
        vo2max:"5x5 VO2max",neuromuscular:"Sprint Builder"
      }
    },
    trainingLoad: { tsb: 5 },
    phase: "Build",
    cyclingLevel: 40,
    ftp: 230,
    weightKg: 70
  });
  assertEqual(result.priorityFamily, "sweetSpot",
    "Expected sweetSpot as priority, got " + result.priorityFamily);
  var ss = result.eligibleWorkouts.find(function(w) { return w.stimulusFamily === "sweetSpot"; });
  assert(ss != null, "Expected sweetSpot in eligible list");
  assertEqual(ss.title, "Sweet Spot Classic",
    "Expected PROGRESS to Sweet Spot Classic (2 doses), got " + ss.title);
});

// G: REGRESS - family unseen in 21 days steps back one rung
test("G -- Family unseen 21 days -> REGRESS one rung", function() {
  var result = determineProgression("threshold", "Threshold Cruise Intervals", 0);
  assertEqual(result.action, "REGRESS", "Expected REGRESS, got " + result.action);
  var ladder = FAMILY_PROGRESSION.threshold;
  var currentIdx = ladder.indexOf("Threshold Cruise Intervals");
  assertEqual(result.targetIndex, currentIdx - 1,
    "Expected rung " + (currentIdx - 1) + ", got " + result.targetIndex);
});

console.log("\nResults: " + passed + " passed, " + failed + " failed\n");
if (failed > 0) process.exit(1);
