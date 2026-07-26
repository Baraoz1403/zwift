# FTP testing protocols - working notes

Distilled principles for how/when a rider's FTP should be tested or
re-estimated, and how stale an FTP value can get before training-load math
(lib/training-load.ts) and target-power ranges in the weekly plan start
drifting from reality. Summarized principles, not copied text from any
specific commercial plan.

## Common protocols
- **20-minute test**: warm up 10-15min (include one 5min hard effort to
  clear anaerobic reserve), then ride as hard as sustainable for exactly 20
  minutes, FTP = 95% of that average power. The most widely used protocol.
- **Ramp test**: stepped effort to failure (e.g. Zwift's: 100W start,
  +20W/min) - the app/algorithm extrapolates FTP from the best ~1-minute
  effort. Less mentally demanding than the 20-minute test, well suited to
  smart trainers.
- Both are estimates, not lab-grade lactate-threshold measurements - good
  enough to drive training zones, not exact physiology.

## Re-testing cadence
- Re-test every 4-8 weeks during structured training; testing more often
  than every 3-4 weeks doesn't give real fitness changes time to show up.
- An FTP that hasn't been updated in a long time, especially after a
  visible upward trend in recent avgWatts/avgHeartRate efficiency, is a
  candidate for a "you may want to re-test your FTP" nudge - useful context
  for the AI Insights feature, not just the weekly-plan generator.

## Implication for this app
- `targetPowerPctFtp` ranges and the training-load proxy (lib/training-load.ts)
  are only as good as the FTP on file. Zwift's own FTP field is exposed via
  the profile API already; there's no separate "test reminder" feature yet,
  but the staleness signal above is a reasonable future addition (e.g. flag
  if ftp hasn't changed in 8+ weeks while avgWatts has been trending up).

## Sources consulted (June 2026)
- [FTP Test Cycling 2026: Complete How-To Guide & Protocols](https://cyclingarchives.com/ftp-test-cycling-2026-complete-how-to-guide-coggan-friel-ramp-8-minute-protocols/)
- [The FTP Test: Physiology and New Testing Protocols - TrainingPeaks](https://www.trainingpeaks.com/blog/the-physiology-of-ftp-and-new-testing-protocols/)
- [Relationship Between the Critical Power Test and a 20-min FTP Test in Cycling](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7862708/)
