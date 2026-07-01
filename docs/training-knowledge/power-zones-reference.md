# Cycling Power Zones Reference

Distilled from Dr. Andy Coggan's 7-zone system (the standard used by Zwift,
TrainingPeaks, most coaching software). All targets are percentages of the
rider's FTP (Functional Threshold Power). This is the single source of truth
for power targets in weekly-plan descriptions and workout block generators.

---

## Coggan's 7 Power Zones

| Zone | Name | % FTP | Heart Rate | Perceived Exertion | Feel |
|------|------|--------|------------|-------------------|------|
| Z1 | Active Recovery | <55% | <68% HRmax | RPE <2 | Very easy, can fully converse, no sensation of fatigue |
| Z2 | Endurance | 56–75% | 69–83% | RPE 2–3 | "All day" pace; LSD training; leg effort low but real; full conversation possible |
| Z3 | Tempo | 76–90% | 84–94% | RPE 3–4 | Spirited group ride feel; requires focus; halting conversation possible |
| Z4 | Lactate Threshold | 91–105% | 95–105% | RPE 4–5 | Just below/above time-trial effort; deep rhythmic breathing; 10–30min blocks |
| Z5 | VO2 Max | 106–120% | >106% | RPE 6–7 | 3–8min intervals; strong leg burn; conversation impossible; ragged breathing |
| Z6 | Anaerobic Capacity | >121% | N/A | RPE >7 | 30s–3min blasts; severe fatigue; HR not useful guide |
| Z7 | Neuromuscular Power | N/A (maximal) | N/A | Maximal | Sprints/jumps <30s; musculoskeletal stress; not metabolic |

---

## Key relationships for AI plan generation

### The "sweet spot" sits between Z3 and Z4
- Sweet spot = 84–97% FTP (upper Z3 through lower Z4)
- Best training effect-to-fatigue ratio; see sweet-spot-training.md

### The 80/20 Rule in zone terms
- 80% of weekly volume in Z1–Z2 (aerobic base)
- 20% in Z4–Z6 (intensity)
- Z3/tempo is the "middle zone" — useful but not the primary focus of most plans

### How zones map to workout types (Zwift vocabulary)
| Zwift Workout Type | Power Zone |
|-------------------|------------|
| Foundation | Z1–Z2 |
| Strength (sprints) | Z6–Z7 |
| Tempo | Z3 |
| Sweet Spot | Z3–Z4 (84–94%) |
| Threshold Development | Z4 (95–105%) |
| VO2 Max intervals | Z5 |
| Intermittent (30/30s) | Z5–Z6 on / Z1 off |
| Recovery spin | Z1 |

---

## Running zones by pace / heart rate

Unlike cycling, running zones are typically defined by heart rate (% HRmax)
or pace (%race pace). The principle is the same — aerobic base vs threshold vs
above-threshold — just without power as the reference.

| Running Zone | % Max HR | Feel |
|-------------|----------|------|
| Easy / Zone 2 | 60–75% | Conversation possible; "easy jog" |
| Aerobic threshold | 76–84% | Marathon pace roughly; still comfortable long-effort |
| Tempo / Threshold | 85–92% | 10K–half marathon race effort; conversation broken |
| VO2 Max interval | 93–100% | 3K–5K race effort; very hard; short efforts only |

---

## Practical implication: never use absolute watts

When generating training plans, always express intensity as % FTP or as a named
zone. Never suggest absolute watt targets ("aim for 200W") because FTP varies
wildly between riders. Instead say "Z4 intervals at 95–105% FTP" or "Sweet Spot
at 88–94%".

## Sources consulted (July 2026)
- [Cycling Power Zones Explained - TrainingPeaks / Dr. Andy Coggan](https://www.trainingpeaks.com/blog/power-training-levels/)
- [Coggan Power Zones - the 7-level system](https://fascatcoaching.com/blogs/training-tips/power-training-levels)
- Cross-referenced with zwift-official-plans.md zone mapping table
