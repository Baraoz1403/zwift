# Cycling training periodization - working notes

Distilled principles used to ground the AI weekly-plan prompt
(`WEEKLY_PLAN_SYSTEM_PROMPT` in `lib/ai.ts`), so the AI is reasoning from the
same structure real coaches/plans use rather than improvising. These are
summarized principles, not copied text from any specific commercial plan.

## Hard/easy structure
- 2-3 high-intensity sessions per week is the practical ceiling for a
  recreational rider - more than that compromises recovery.
- Never schedule two hard (intervals/sweet spot/threshold/VO2) days back to
  back. Put an easy endurance day or full rest day right after the hardest
  session of the week.
- Roughly 80% of weekly volume easy/endurance (Zone 2), 20% hard - the
  "polarized"/80-20 guideline.

## Progression and load
- Increase total weekly volume by about 5-10% when recent rides show stable
  or improving form - not more.
- Pull back (fewer and/or easier sessions) on signs of fatigue: rising heart
  rate at a similar power, a recent spike in ride frequency/volume, or a
  statistically flagged anomalous ride (see heart-rate-analysis.md).
- A recovery week (lower volume, lower intensity) roughly every 3-4 weeks is
  standard in published plans, even outside a single week's plan.

## Phases (longer-term context, not single-week scope yet)
- Base: aerobic Zone 2 development.
- Build: race-specific intensity introduced.
- Peak: sharp high-intensity work.
- Recovery: active recovery, lower load.

## Session count
- The number of sessions in a week should reflect the rider's actual recent
  frequency (from their own ride history), not a fixed template - a rider
  averaging 3 rides/week shouldn't suddenly be given 6.

## Related notes in this folder
- recovery-week.md - detail on how a recovery week should actually be
  structured (volume cut %, common failure mode).
- intensity-distribution.md - the polarized/pyramidal question behind the
  80-20 guideline above, and how the mix should shift Base vs. Build.
- vo2max-protocols.md - structure for the hardest session type mentioned
  above (interval length, recovery ratio).
- ftp-testing.md - how/when the FTP this whole prompt's % targets are
  built on should be re-tested.

## Sources consulted (June 2026)
- [How to Structure a Cycling Training Week](https://roadcyclingacademy.com/how-to-structure-a-cycling-training-week/)
- [Periodization for Cycling: Structured FTP Training Plans](https://ftpzonecalculator.com/guides/periodization-ftp-training/)
- [Implementing Cycling Block Periodization & Workouts](https://www.evoq.bike/blog/cycling-block-periodization)
- [FTP Training for Cyclists - Evidence-Based Guide](https://roadmancycling.com/topics/ftp-training)
