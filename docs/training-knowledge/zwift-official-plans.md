# Zwift's own training plans and workout categories - catalog

A catalog of how Zwift's built-in plans/workouts (the ones visible in the
desktop app's "Workouts" library, shown in earlier screenshots) are actually
structured, so the AI weekly-plan prompt (`WEEKLY_PLAN_SYSTEM_PROMPT` in
`lib/ai.ts`) and the `.zwo` generator (`lib/zwo.ts`) use the same vocabulary
and shapes real Zwift plans do, instead of inventing arbitrary ones.

## FTP Builder (6 weeks, beginner-oriented)
- 4-5 workouts/week, most under an hour, ~4h48m/week total.
- Heavily Zone 1-2: across the whole plan, Z1 11h48m and Z2 9h57m vs only
  Z3 5h7m and Z4 1h50m - i.e. the large majority of volume is easy.
- Recurring workout categories used:
  - **Foundation training** - low intensity, mostly Zone 2 endurance.
  - **Strength training** - short, repeated maximal efforts for
    neuromuscular recruitment (not a long hard interval set - brief sprints
    with long recovery).
  - **Tempo training** - time spent in Zone 3.
  - One optional/unstructured day most weeks ("ride as you feel").
- Progresses gently week to week (slightly more Z3/Z4 by week 6) rather than
  jumping straight into hard intervals.

## Build Me Up (13 weeks, 52 workouts, more demanding)
- ~4h34m/week, opens with a Ramp Test (FTP test) and ends with a 20-minute
  all-out test.
- Much more high-intensity exposure than FTP Builder across the full plan:
  Z3 13h54m, Z4 9h49m, Z5 4h27m, Z6 2h6m (vs FTP Builder's Z4 1h50m, Z6
  6m total) - i.e. meaningfully harder once a rider has a base.

## Zwift Academy (hardest, short maximal efforts)
- Field tests and race/breakaway simulations: 20-second and one-minute
  near-maximal intervals, not steady long efforts.

## Recognized workout categories (used as the `type` vocabulary in our AI
prompt and `.zwo` generator)
| Category | Real-world shape | Power |
|---|---|---|
| Endurance / Foundation | one long steady block | Zone 1-2 (~55-75% FTP) |
| Tempo | one steady block, higher than endurance | Zone 3 (~76-87% FTP) |
| Threshold | repeated 5-8min efforts | ~95-105% FTP |
| Sweet Spot | repeated 8-15min efforts | ~88-94% FTP |
| VO2 | short, sharp 2-3min efforts | ~106-120% FTP |
| Intermittent | short 30s on/30s off bursts | ~110%+ FTP on, easy off |
| Strength | 5-8x ~15s near-maximal sprints, long recovery | 150%+ FTP on, easy off |
| Recovery | very easy spin | <55% FTP |
| Rest | no ride | - |

`lib/zwo.ts`'s `buildSteps()` now generates a distinct step shape for each
of these (recovery/strength/intermittent/threshold-sweet-spot-VO2/default
endurance-tempo), and the AI prompt is told to pick from this exact list of
type names so the generated `.zwo` file's structure actually matches the
label shown on the weekly-plan card.

## Important correction re: syncing custom workouts to other devices
Zwift's own FAQ on custom `.zwo` files (see source below) says: after
placing the file in `Documents/Zwift/Workouts/{userid}` and opening Zwift
once on that PC/Mac, Zwift automatically uploads the custom workout to your
account, and it then syncs to your phone/other devices under "Custom
Workouts" - no Training Connections API needed for this part. (The
Training Connections API is still relevant for the larger goal of this
project generating/pushing workouts without any manual file step at all,
but day-to-day cross-device syncing already works once the file is placed
and Zwift is opened once.)

## Sources consulted (June 2026)
- [Zwift workouts: FTP Builder - What's on Zwift?](https://whatsonzwift.com/workouts/ftp-builder)
- [Zwift workouts: Build Me Up - What's on Zwift?](https://whatsonzwift.com/workouts/build-me-up)
- [Zwift workouts and training plans - What's on Zwift?](https://whatsonzwift.com/workouts)
- ['Build me up' or 'FTP builder'? - Zwift Forums](https://forums.zwift.com/t/build-me-up-or-ftp-builder/86783)
- [Zwift training plans: A beginner's guide - Cyclingnews](https://www.cyclingnews.com/features/zwift-training-plans/)
