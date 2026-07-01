# Structured Plan Templates

Week-by-week templates for common training goals and durations. These are
distilled from published plans (Zwift official, Hal Higdon, FasCat, Coggan/
TrainingPeaks methodology) and represent "what a coached athlete would likely
get" for each profile. Used by the AI weekly-plan generator to anchor session
design to proven structures, not just principles.

---

## How to use this file

The AI reads the rider's goal, experience level, and current phase
(lib/periodization.ts) and then uses the matching template as a starting
point. Templates show TYPES of sessions per week, not specific workouts — the
actual session is still generated dynamically. Templates ensure the weekly
structure (hard/easy alternation, volume shape, key sessions) matches what
real coaches prescribe.

---

## Template A: FTP Builder — Beginner (4 weeks / 1 mesocycle)

**Target rider**: Zwift Level <15, FTP set, 3–4 sessions/week available.
**Primary reference**: Zwift FTP Builder (6-week plan), condensed to 4-week mesocycle.

### Weeks 1–3 (Build weeks)
| Day | Session Type | Zone | Duration |
|-----|-------------|------|---------|
| Mon | REST | — | — |
| Tue | Foundation | Z2 | 45–60 min |
| Wed | Strength (sprints) | Z6 (15–30s), Z1 recovery | 45–55 min |
| Thu | REST or easy spin | Z1 | 20–30 min |
| Fri | Tempo | Z3 | 60–75 min |
| Sat | Foundation (longer) | Z2 | 60–75 min |
| Sun | REST | — | — |

**Volume progression across 3 build weeks**: +5–10% total duration per week.
**Key rule**: No two hard days (Tempo, Strength) back-to-back.

### Week 4 (Recovery week)
| Day | Session Type | Zone | Duration |
|-----|-------------|------|---------|
| Tue | Easy spin | Z1–Z2 | 30–40 min |
| Thu | Easy Foundation | Z2 | 40–50 min |
| Sat | Short Foundation | Z2 | 45 min |
| All others | REST | — | — |

**Volume cut**: 40–50% vs the biggest build week.

---

## Template B: FTP Builder — Intermediate (4 weeks / 1 mesocycle)

**Target rider**: Zwift Level 15–35, FTP tested, 4–5 sessions/week available.
**Primary reference**: Build Me Up structure, adapted for 4-week mesocycle.

### Weeks 1–3 (Build weeks)
| Day | Session Type | Zone | Duration |
|-----|-------------|------|---------|
| Mon | REST | — | — |
| Tue | Sweet Spot intervals | Z3–Z4 (88–94%) | 60–75 min |
| Wed | Foundation | Z2 | 60–75 min |
| Thu | Threshold Development | Z4 (95–105%) | 60–75 min |
| Fri | REST or Recovery spin | Z1 | 20–30 min |
| Sat | Long Foundation or SS | Z2 or Z3–Z4 | 75–90 min |
| Sun | REST | — | — |

**Hard days**: Tue (SS) and Thu (Threshold) separated by easy Wed.
**Progression**: Increase interval duration by 2–3 min per rep each week,
or add one more rep. Never increase both volume and intensity simultaneously.

### Week 4 (Recovery week)
| Day | Session | Zone | Duration |
|-----|---------|------|---------|
| Tue | Easy Foundation | Z2 | 45 min |
| Thu | Short Tempo | Z3 | 45–55 min |
| Sat | Foundation | Z2 | 60 min |
| Others | REST | — | — |

---

## Template C: General Fitness / Fun (ongoing, no specific event)

**Target rider**: Rides for fun, general health, no race goal. 2–4 sessions/week.

**No mesocycle pressure**: no build/recovery periodization needed unless training
load (lib/training-load.ts) shows fatigue.

**Week structure**:
| Session | Type | Zone | Duration |
|---------|------|------|---------|
| Session 1 | Foundation (easy endurance) | Z2 | 45–60 min |
| Session 2 | Mixed/Group ride or Tempo | Z2–Z3 | 45–60 min |
| Session 3 (optional) | Strength or Intermittent | Z6/Z5 | 45 min |
| Session 4 (optional) | Free ride / easy spin | Z1–Z2 | 30–45 min |

**Key insight**: For a Fun goal, variety > optimization. Include at least one
Foundation and rotate between Strength, Tempo, and free rides for the others.
Sessions ≤60 min → better adherence than long workouts.

---

## Template D: Event Preparation (Gran Fondo / Long Ride, 12 weeks out)

**Target rider**: Has a big event in ~12 weeks. Goal is to complete it, not race it.

### Phase 1: Build Volume (Weeks 1–6)
Focus: Long Foundation rides getting progressively longer.
Key sessions per week:
- 1× Long Foundation (Z2) — the primary session; this is the "long run" equivalent
- 1–2× Sweet Spot (Z3–Z4, 2×15–20 min)
- 1× Short Recovery spin or rest

### Phase 2: Add Specificity (Weeks 7–10)
Focus: Threshold intervals + event-pace efforts.
Key sessions per week:
- 1× Long Foundation (Z2) at event distance target
- 1× Threshold Development (Z4, 4×8–10 min)
- 1× Sweet Spot (if energy allows)
- Recovery day after each hard session

### Phase 3: Taper (Weeks 11–12)
- Week 11: Cut volume 30–35%, keep one Threshold session
- Week 12: Cut volume another 40% vs week 10; 2–3 easy rides only; ONE short
  sharp effort (e.g., 2×5 min Z4 to keep legs sharp)
- Event day: arrive fresh, not tired

---

## Template E: Recovery Week (any plan, every 4th week)

Regardless of goal or level, every 4th week is a recovery week.

**Volume**: 40–60% of the previous week's total duration.
**Intensity**: Nothing harder than Z3. No Sweet Spot, no Threshold, no VO2.
**Session count**: Reduce by 1–2 sessions vs build weeks.
**Example (from 4×/week down to 2–3×/week)**:
- Tue: 30–40 min easy Z2 Foundation
- Thu: 40 min Z2 Foundation
- Sat: 45–50 min Z2, maybe one short (5–10 min) Z3 Tempo block if feeling good

**Why this is enforced unconditionally**: Fitness built in build weeks is only
consolidated during recovery. Riders who ride hard through recovery weeks carry
fatigue into the next mesocycle and plateau or get injured. The app's
periodization layer (lib/periodization.ts) enforces this via the `Recovery`
phase flag, which overrides training-load freshness signals on purpose.

---

## Session count guidelines (by rider profile)

| Rider's recent weekly rides | Recommended sessions in plan |
|---------------------------|------------------------------|
| 1–2 rides/week average | 2 sessions (no more; build habit first) |
| 3 rides/week average | 3 sessions (the standard) |
| 4–5 rides/week average | 4 sessions, including one optional |
| 6+ rides/week average | 5 sessions max; 1 always easy/recovery |

**Key principle**: Plan session count matches the rider's ACTUAL history, not
an ideal. A rider doing 2 rides/week shouldn't suddenly be given 5.
See periodization.md and lib/training-load.ts for how ride frequency is computed.

---

## Intermediate/Advanced cycling plans: additional Zwift programs

Beyond the templates above, Zwift offers additional structured plans the AI
should be aware of:

| Plan | Duration | Level | Key feature |
|------|----------|-------|-------------|
| FTP Builder | 6 weeks | Beginner | 3–4 sessions/week; Foundation + Tempo progression |
| Build Me Up | 13 weeks | Advanced | 4–5 sessions; opens + closes with FTP test |
| Crit Crusher | 6 weeks | Intermediate | Criterium specificity; lots of Z5/Z6 |
| Gran Fondo | 8 weeks | Intermediate | High-volume Z2 base for long-ride prep |
| Zwift Racing Academy | 10 weeks | Advanced | Race-specific, high intensity; starts with ramp test |

## Sources consulted (July 2026)
- zwift-official-plans.md (this project)
- periodization.md (this project)
- recovery-week.md (this project)
- [Hal Higdon Half Marathon Novice 1](https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/)
- [FasCat Coaching Sweet Spot Base Framework](https://fascatcoaching.com/blogs/training-tips/sweet-spot-training)
- [TrainingPeaks Coggan Power Zones](https://www.trainingpeaks.com/blog/power-training-levels/)
