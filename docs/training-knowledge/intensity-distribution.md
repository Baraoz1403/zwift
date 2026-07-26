# Polarized vs. pyramidal intensity distribution - working notes

Distilled principles for how the *mix* of easy/threshold/hard sessions
across a week should shift depending on the rider's current
periodization phase (lib/periodization.ts). Summarized principles, not
copied text from any specific commercial plan.

## The two models
- **Polarized**: almost all volume at easy (zone 1-2) or hard (zone 4-5),
  with very little time spent at threshold/sweet-spot in between.
- **Pyramidal**: still mostly easy volume, but with a meaningful middle
  layer of threshold/sweet-spot work between the easy and hard ends -
  the most commonly observed pattern in elite training logs (roughly
  77% zone 1, 15% zone 2-3, 8% zone 4-5 in one commonly cited dataset).

## What the evidence actually shows
- Some controlled studies found polarized training producing larger
  VO2max/threshold-power gains over short (9-16 week) windows. Other
  research finds pyramidal is what well-trained and elite endurance
  athletes actually do most of the time, and a head-to-head in elite
  rowers found polarized was *not* superior to pyramidal. Net: both work;
  there isn't a single proven "best" distribution, and the right one
  shifts with context.

## Practical implication for periodization phase
- Base phase (limited recent structure, building the aerobic floor) skews
  more polarized - mostly easy endurance riding plus some genuinely hard
  efforts, minimal "medium" threshold work.
- Build phase (progressive overload, the bulk of a mesocycle) shifts more
  pyramidal - threshold/sweet-spot sessions enter the mix alongside
  endurance and hard intervals, since that middle-intensity work is what's
  most race/event-specific.
- This app has no separate "intensity-distribution" output today - this is
  qualitative context for how the AI should vary session *types* across
  Base vs. Build weeks (lib/periodization.ts's `phase` field), not a new
  numeric layer. It complements, rather than replaces, the trainingLoad-
  driven count/freshness logic already in lib/training-load.ts.

## Sources consulted (June 2026)
- [Polarised vs Pyramidal Training: Which Is Right for You? - Roadman Cycling](https://roadmancycling.com/answers/polarised-or-pyramidal-training)
- [Polarized training vs Pyramidal training - InsCyd](https://inscyd.com/article/polarized-training-vs-pyramidal-training/)
- [The training intensity distribution among well-trained and elite endurance athletes](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4621419/)
- [Eleven-Week Preparation Involving Polarized Intensity Distribution Is Not Superior to Pyramidal Distribution in National Elite Rowers](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5539230/)
