# VO2max interval structure - working notes

Distilled principles for how a "VO2max"/Zone 5 session should actually be
structured, to sanity-check the AI's session design and the .zwo block
generator (lib/zwo.ts). Summarized principles, not copied text from any
specific commercial plan.

## Power zone and effort duration
- VO2max efforts sit at roughly 105-120% of FTP - this app's Zwift-category
  vocabulary already maps to this range; nothing to change there.
- Effective interval length is 3-10 minutes (long enough to actually reach
  VO2max, which doesn't happen instantly) - most real-world prescriptions
  cluster around 3-5 minutes per rep.

## Common, well-supported structures
- **4x4 protocol** (most validated in research): 4 reps of 4 minutes at
  106-120% FTP, with 4 minutes easy recovery between reps. The last rep
  should be the hardest one - if it feels manageable, the target power was
  too low for the next attempt.
- **2 sets of (2x4min on / 4min off)** with an ~8-minute easy block between
  the two sets - a way to fit 4 hard reps into a session with a built-in
  half-way breather, useful for less experienced riders or when 4 reps
  back-to-back is too much.
- **Billat 30/30s**: 30s at ~100% of VO2max-effort power / 30s at ~50% of
  that power, repeated. Short reps, short recovery - oxygen uptake stays
  elevated through the "easy" 30s, so total time at/near VO2max ends up
  high despite each individual rep being short. A useful lower-fatigue
  alternative to long reps for the same physiological target.

## Implication for this app
- Any VO2max/"Zone 5" session the AI generates should keep individual hard
  reps in the 3-5 minute band (or use the 30/30 short-rep variant
  explicitly, not as a typo'd short rep of a long-rep session), with
  recovery intervals roughly equal to work intervals for the 4x4-style
  sessions. This matches docs/training-knowledge/zwift-official-plans.md's
  existing interval vocabulary - this note adds the "why" behind the
  duration choice.

## Sources consulted (June 2026)
- [Science of VO2max Intervals - InsCyd](https://inscyd.com/article/vo2max-intervals/)
- [How to Perform VO2 Max Intervals with your PowerMeter - FasCat Coaching](https://fascatcoaching.com/blogs/training-tips/vo2-max-intervals/)
- [VO2max Intervals Cycling - Roadman Cycling](https://roadmancycling.com/blog/cycling-vo2max-intervals)
