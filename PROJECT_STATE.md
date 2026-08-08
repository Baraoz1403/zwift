# Volt Pilot Project State

Last updated: 2026-08-08

## Outcome

- Prove the full one-athlete Volt loop: isolated deployment, real Zwift and Intervals.icu connections, exact latest 30 activities, one professionally generated week, controlled Intervals.icu write, read-back verification, and final confirmation in Zwift.

## Protected baseline

- Source commit: `309d8f2232c8c1bdf590b2461173f1a6bce9bc1a` from public repository `Baraoz1403/zwift`.
- Production Vercel project `prj_vTyOSYvJj5E1XNzqP08COpG9gQJ9`, its domains, aliases, environment variables, and deployments are read-only and must not be changed.
- Local repository push URL is disabled. No change may be pushed to `Baraoz1403/zwift`.

## Acceptance contract

- Create a new Vercel project and URL dedicated to the pilot.
- Initial deployment is external-write blocked by default.
- Credentials are entered only through the secured pilot, never chat or source control.
- Read the athlete profile and exactly the latest 30 qualifying activities.
- Generate and display the week of 2026-08-10 through 2026-08-16 with rationale and quality evidence before sync.
- After Barak approves the displayed week, replace only planned `WORKOUT` events in that target week in Intervals.icu; completed activities, notes, races, other event types, and other weeks remain untouched.
- Snapshot targeted existing planned workouts before replacement and verify created events through an Intervals.icu API read-back.
- Confirm final availability in the Zwift app; no undocumented Zwift read-back endpoint counts as proof.

## Verification gates

- Unit and connector-contract tests pass.
- Production build passes.
- Secret scan contains no real credentials.
- Initial hosted URL is verified and cannot perform external writes.
- Live reads must show 30 activities before plan generation.
- Live writes require a separate action-time approval after the actual week is displayed.

## Current status

- Vercel plugin connected successfully.
- Vercel team identified: `team_rBkJtnfQOc5kMIrGWVNiGtv0`.
- Production project identified and protected.
- Fresh local pilot copy created from the exact production commit; push disabled.
- Default two-key external-write boundary added across Intervals.icu workout create/delete, webhook registration, FTP update, direct Zwift upload, TrainingPeaks writes, and WhatsApp delivery.
- Scheduled crons removed; production URL fallback removed; raw ICU credential read-back disabled.
- Planner corrected to use the exact latest 30 dated Zwift activities instead of the previous 15-activity default.
- Verification: 6 pilot contract tests passed; Next.js production build completed with 94 routes. The pre-existing Marco chat warning about `getCachedIdentity` remains outside this pilot gate.
- Infrastructure gate deployed as a separate Vercel project `prj_ABGJAivOBzoW6T6cK3xcaZ25hP9G` at `https://volt-pilot-read-only.vercel.app/`.
- Hosted verification: deployment `dpl_3Dm5RNvMLmySx2CqqUYcCovPi1ms` is READY, returned HTTP 200, is `noindex`, and was visually inspected in the cloud browser.
- The infrastructure page is only a deployment/connectivity proof; it does not yet contain the full Volt application or account connections.
- No live-account connection yet. No external write performed.

## Next safe step

- Give the GitHub connector access to the pilot source repository (or create a dedicated branch/repository), then deploy the verified full Next.js pilot into the isolated Vercel project and configure pilot-only environment variables.
