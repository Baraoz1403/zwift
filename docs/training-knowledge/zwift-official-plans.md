# Zwift Official Training Plans — Structured Knowledge Base
# Source: whatsonzwift.com (published with Zwift's permission)
# Used by: WEEKLY_PLAN_SYSTEM_PROMPT in lib/ai.ts

---

## HOW ZWIFT THINKS ABOUT TRAINING GOALS

### FTP Builder (Beginner, 6 weeks)
**Target rider:** New to structured training, building a base.
**Volume:** 3h37m/week → 5h31m/week (gradual ramp, one recovery dip at week 3)
**Stress progression:** Week1: 167sp → W2: 231 → W3: 214 (recovery) → W4: 277 → W5: 296 → W6: 335
**Zone distribution across full plan:** Z1: 11h48m, Z2: 9h57m, Z3: 5h7m, Z4: 1h50m, Z5: 0, Z6: 6m
**Core principle:** 80% of training is Z1-Z2. High intensity introduced slowly.

**Weekly workout sequence (repeating pattern):**
- Day 1: Foundation (Z1-Z2 endurance block, 48-66min)
- Day 2: Strength (short maximal sprints, neuromuscular, 54-69min)
- Day 3: Foundation (Z1-Z2 endurance, same or slightly longer)
- Day 4: Tempo (Z3 block, 67-86min) ← hardest day of week
- Day 5: Optional easy ride (40-44min, free ride feel)

**Workout type introduction timeline:**
- Weeks 1-3: Foundation + Strength + Tempo only
- Week 4: Intermittent appears (30s on/off, Z4/Z6)
- Weeks 5-6: Threshold Development replaces some Tempo (Z4 intervals)

**Key insight for AI:** For a beginner FTP goal, NEVER start with threshold intervals.
Start with 3 days/week of Foundation+Strength+Tempo, add intensity in week 4+.

---

### Build Me Up (Advanced, 13 weeks)
**Target rider:** Experienced Zwifter ready for serious FTP improvement.
**Volume:** ~4h34m/week average
**Total stress:** 5,149sp (vs FTP Builder's 1,520sp = 3.4x more demanding)
**Zone distribution:** Z1: 18h42m, Z2: 10h28m, Z3: 13h54m, Z4: 9h49m, Z5: 4h27m, Z6: 2h6m
**Core principle:** Much more Z3/Z4/Z5/Z6. Opens with a Ramp Test, closes with a 20min all-out.

**Structure:**
- Week 0: Testing week (Ramp Test to establish FTP baseline)
- Weeks 1-4: Base building with Z3/Z4 introduction
- Weeks 5-8: Build phase, more Z4/Z5
- Weeks 9-12: Peak phase, Z5/Z6 efforts
- Week 13: Taper + final test

**Key insight for AI:** For an advanced FTP goal, include Z4-Z5 intervals from week 1.
Plan should start with FTP test. End with a PR attempt or race.

---

## WORKOUT TYPE LIBRARY (Zwift's official categories)

Each workout type below is a direct match to what Zwift uses in their plans.
Use these EXACT types when building weekly plans.

| Type | Description | Power zone | Duration of efforts | When to use |
|------|-------------|-----------|---------------------|-------------|
| **Foundation** | Steady endurance block, mostly Z2 | Z1-Z2 (55-75% FTP) | One long block, 40-90min | Every week, base of all plans |
| **Strength** | Short maximal sprints + long recovery | Z6+ (150%+ FTP), 15-30s on | 5-8 reps of 15-30s | Neuromuscular, weekly in FTP Builder |
| **Tempo** | Sustained Z3 effort | Z3 (76-87% FTP) | 20-40min continuous | Mid-base, great for fitness/weight goals |
| **Intermittent** | 30s on/30s off alternating | Z5-Z6 on, Z1 off | 10-20 reps of 30s | Intro to high intensity, week 4+ |
| **Sweet Spot** | Repeated sub-threshold | 88-94% FTP | 8-15min per effort, 2-4 reps | Core FTP builder, weeks 3-8 |
| **Threshold Development** | Lactate threshold intervals | 95-105% FTP | 5-10min per effort, 2-4 reps | FTP improvement, weeks 5-12 |
| **VO2max** | Short sharp efforts above FTP | 106-120% FTP | 2-4min per effort, 3-6 reps | Advanced, Build Me Up weeks 8+ |
| **Recovery** | Very easy spin | Z1 (<55% FTP) | Full session, 20-40min | After hard days, before event |
| **Rest** | Day off | — | — | Weekly, never skip |

---

## PERIODIZATION RULES ZWIFT USES

### The 3:1 Rule
Zwift consistently uses 3 weeks of load + 1 recovery week.
FTP Builder week 3 stress (214sp) < week 2 (231sp) despite being week 3.
Build Me Up shows same pattern at larger scale.

### Volume Ramp Rate
Zwift increases weekly duration by ~8-12% per week during load blocks.
FTP Builder: 3h37m → 4h55m = +36% over 2 weeks, then recovery.
Never increase volume AND intensity in the same week.

### Workout Sequencing (within a week)
Zwift's rule: Hard day → Easy day → Hard day → Easy day
Never two hard days back to back.
"Hard" = Threshold, VO2, Intermittent, Sweet Spot.
"Easy" = Foundation, Recovery, Strength (if short enough).

---

## GOAL-SPECIFIC RECOMMENDATIONS

### Goal: Improve FTP
- Week 1-2: Foundation + Strength + Tempo
- Week 3+: Add Sweet Spot intervals (88-94%)
- Week 5+: Add Threshold Development (95-105%)
- Always: Recovery day after each hard day
- Test FTP at start and end

### Goal: Lose Weight / Fitness
- Prioritize volume in Z2 (fat-burning zone)
- Longer Foundation sessions > intensity
- Add Tempo for caloric burn
- Keep Strength for metabolism boost
- Avoid high Z4/Z5 (fatigue suppresses adherence)

### Goal: Event / Gran Fondo prep
- 12+ weeks out: Build volume (Foundation-heavy)
- 6-8 weeks out: Add Sweet Spot and Threshold
- 3-4 weeks out: Peak with VO2 efforts
- 2 weeks out: Reduce volume 30%, keep intensity
- Final week: Taper to 40% volume, one short sharp effort

### Goal: General Fitness (Fun)
- 2-3 days/week, mixed intensity
- No periodization pressure
- Include variety: one Foundation, one Strength or Tempo, one free ride
- Keep sessions ≤60min for adherence

---

## SESSION LENGTH GUIDANCE

| Available time | Recommended structure |
|---------------|----------------------|
| 45min | Warm-up (10min) + Main block (25-30min) + Cool-down (5min) |
| 60min | Warm-up (10min) + Main block (40-45min) + Cool-down (5min) |
| 90min | Warm-up (15min) + Main block (60-65min) + Cool-down (10min) |
| 90min+ | Long Foundation or full Sweet Spot set; Tempo w/ multiple blocks |

IMPORTANT: Always fit the workout within the rider's stated session length.
A 45min rider should NEVER get a plan that requires 90min to execute properly.

