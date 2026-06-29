# Heart-rate graph analysis - working notes

Distilled principles behind `flagHeartRateAnomalies` (`lib/stats.ts`) and the
`hrFlag` guidance baked into `SYSTEM_PROMPT`/`WEEKLY_PLAN_SYSTEM_PROMPT`
(`lib/ai.ts`) - so anomaly detection and the AI's commentary on it are
grounded in real exercise-physiology concepts, not arbitrary thresholds.

## What we already compute
`flagHeartRateAnomalies` looks at each ride's `avgHeartRate / avgWatts`
ratio against the rider's own recent baseline (mean + std dev across their
last rides) and flags a ride as:
- `"low"` - heart rate unusually *low* for the power produced that day.
- `"high"` - heart rate unusually *high* for the power produced that day.

## Why a ride's HR/power ratio can be flagged

**Unusually high HR for the power (`"high"`):**
- Early-stage fatigue or overreaching - the heart compensates for reduced
  stroke volume/plasma volume by beating faster to maintain output.
- Heat, dehydration, poor sleep, illness onset, or psychological stress.
- A genuinely under-recovered rider showing classic "cardiac drift" even at
  a power that used to feel comfortable.

**Unusually low HR for the power (`"low"`):**
- Possible sensor issue (strap contact, battery) - worth a sanity check.
- Sometimes a sign of overreaching/parasympathetic suppression, where a
  fatigued autonomic nervous system blunts the normal HR response even
  though the effort is genuinely hard - this is the case the user
  specifically flagged ("difficulty raising heart rate" two days running).
- Less commonly, genuine aerobic fitness improvement (lower HR at the same
  power is normally a *good* sign) - context (recent frequency, RPE,
  illness symptoms) decides which it is, which is why the AI is instructed
  to call it out specifically by date rather than silently average it away.

## Related concept for later: aerobic decoupling / cardiac drift
Not yet implemented (today's anomaly check is ride-to-ride, not within a
single ride), but worth building next: within one steady ride, comparing
the first half's average HR:power ratio to the second half's. A well-trained
rider can hold under ~5% decoupling across ~90 minutes of steady Zone 2;
10-15%+ on the same kind of ride suggests fatigue or an underdeveloped
aerobic base. This would need pulling the FIT file's full time-series (not
just the ride average), splitting it in half, and comparing the two halves'
ratios.

## Sources consulted (June 2026)
- [Aerobic Decoupling Cycling: Cardiac Drift & Pa:HR Explained](https://roadmancycling.com/blog/aerobic-decoupling-cycling-cardiac-drift)
- [Cardiac Drift for Cyclists (Using Heart Rate Data)](https://roadcyclingacademy.com/cardiac-drift-for-cyclists/)
- [What is Aerobic Decoupling? - Tailwind Coaching](https://tailwind-coaching.com/2017/03/30/what-is-aerobic-decoupling/)
- [Quantifying training response in cycling based on cardiovascular drift using machine learning](https://pmc.ncbi.nlm.nih.gov/articles/PMC12271085/)
