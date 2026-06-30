# Recovery-week design - working notes

Distilled principles backing the "Recovery" phase in lib/periodization.ts
(currently a fixed every-4th-week placement). Summarized principles, not
copied text from any specific commercial plan.

## What a recovery week actually is
- A planned week of reduced training load - roughly 40-60% volume cut -
  while keeping a small amount of intensity, not a total off week. The
  point is letting accumulated fatigue clear while fitness (built over the
  prior weeks) consolidates, not detraining.
- "Recovery week" and "deload week" are the same idea under different
  names across different sources.

## Standard cadence
- The classic structure is 3 build weeks -> 1 recovery week (Joe Friel's
  3:1), which lines up with this app's MESOCYCLE_LENGTH = 4. For masters
  riders or anyone running higher absolute load, 2:1 is sometimes more
  sustainable - a possible future per-rider tweak, not implemented yet.
- Typical 4-week shape: week 1 baseline, week 2 +5-10%, week 3 another
  +5-10% (the biggest week), week 4 drops 40-60% with a touch of intensity
  retained. This app doesn't yet vary Base/Build week load week-to-week
  (each Build week's volume comes from trainingLoad/ridesLast7Days, not a
  fixed escalation schedule) - the recovery-week cut is the one explicit
  load-shape rule currently enforced.

## The most common failure mode
- Riders feel guilty about reduced volume and ride harder to compensate,
  turning the recovery week into just another moderate week - the next
  build cycle then starts already carrying fatigue instead of fresh. This
  is exactly why the weekly-plan prompt instruction for `cycle.phase ===
  "Recovery"` is unconditional (it overrides trainingLoad-driven freshness
  read on purpose) rather than a soft suggestion the AI can talk itself out
  of.

## Sources consulted (June 2026)
- [Cycling Recovery Week: What to Do and Why It Works - Roadman Cycling](https://roadmancycling.com/blog/cycling-recovery-week-what-to-actually-do)
- [Cycling Rest Week Guide - Structure, Volume, Timing - Roadman Cycling](https://roadmancycling.com/blog/cycling-rest-week-guide)
- [Deload Week Guide: When, Why & How to Deload](https://ttrening.com/learn/articles/deload-weeks)
