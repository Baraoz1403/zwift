# CLAUDE.md — Developer Rules for the Zwift AI Dashboard

This file tells Claude Code / Cowork how to work safely in this project.
Read it before making any changes.

---

## Project spirit — the standard we hold ourselves to

This project is built by a cyclist who trains seriously, not by an IT department.
Every hour spent debugging a recurring bug is an hour stolen from actual training.
That shapes how we work here.

**Permanent fixes, not patches.** When a bug surfaces, the goal is to understand
*why* it happens and close that door for good — not apply a workaround that leaves
the root cause intact. A bug that comes back is a failure of the fix, not just bad
luck. Before committing any fix, ask: what would have to be true for this to happen
again? Then address that too.

**Initiative over instruction.** If something looks fragile, broken, or likely to
cause a problem — fix it or flag it without waiting to be asked. The user should not
have to discover the same failure twice and then ask for it to be addressed. Spotting
the adjacent problem and solving it proactively is part of the job.

**No technical debt accumulation.** Quick hacks have a place in exploration, but
they must be replaced before they reach production. If a workaround ships, it ships
with a comment explaining exactly why it exists and what the permanent fix requires.

**Own the outcome.** "I made the change" is not the finish line — "the feature
works correctly in production" is. That means checking deploys, thinking through
edge cases before they hit the user, and catching regressions before they do.

**Full transparency, unconditionally.**
מנהל הפרויקט מצפה מקלוד לשקיפות מלאה ומולטת, דיווחים מלאים באמינות מוחלטת.
The project manager expects complete and unfiltered reporting — not summaries that
omit inconvenient details, not status updates that round up. If something failed,
say so. If something is uncertain, say so. If a fix only partially worked, report
what's still open. Credibility is the foundation everything else rests on.

**Continuous learning and pursuit of excellence.**
מנהל הפרויקט מצפה לחתירה מתמדת ללימוד, שיפור, תיקון מתוך שאיפה למצוינות.
Every session is an opportunity to improve — not just to complete the task, but to
understand it better, spot patterns, and raise the bar. Mistakes are expected;
repeating them without learning from them is not. The goal is not "good enough"
but the best that can actually be delivered.

This is the culture of the project. It applies to every session, every fix,
every deploy — not just when explicitly reminded.

---

## Project overview

A personal Next.js App Router dashboard for Zwift training data.
- **Framework**: Next.js 14 App Router (server components + client components)
- **Styles**: Single `app/globals.css` file (CSS custom properties + utility classes)
- **Data**: Zwift's unofficial API via `lib/zwift.ts` (reverse-engineered, bearer-token auth)
- **AI**: OpenAI API via `lib/ai.ts` for training plan generation and insights
- **Deploy**: GitHub → Vercel (auto-deploy on push to `main`)
- **Git repo**: `C:\Users\barak\Zwift Project` (this folder)

---

## Language rule

Conversation language and product language are separate. The user talks to
Claude in Hebrew — that does **not** mean any UI text, button labels, error
messages, or alert strings in the dashboard should be Hebrew. **All
dashboard-facing text stays in English**, regardless of what language the
chat with Claude happens in.

This has regressed before: a prior session translated banners/buttons/error
strings to Hebrew because the conversation itself was in Hebrew. Don't let
conversation language leak into `app/dashboard/*.tsx` or any user-facing
string in the codebase.

---

## CRITICAL: File editing rules

### Never use bash for file edits

`sed -i`, `echo > file`, and similar shell writes do **not** persist to
Windows/OneDrive-mounted files from the Linux bash sandbox. The write appears
to succeed but the file on disk is unchanged.

**Always use the `Edit` or `Write` tool for any file modification.**
This is the single most important rule in this document.

### OneDrive cloud-only files

Some files in `lib/` exist only in the cloud (not downloaded to the local disk
cache). Bash can't see or read them. The `Read` tool downloads them on demand.

Affected files: `lib/periodization.ts`, `lib/training-load.ts`,
`lib/adherence.ts`, `lib/zwo.ts`

If a file looks missing to bash, use the `Read` tool instead.

### Bash's view can be stale or garbled — don't trust it for verification

Beyond the cloud-only files above, bash's view of *any* file in this OneDrive
mount can lag behind the real file (missing the tail end of a recent edit) or
mangle non-ASCII characters (em dashes, arrows like `→`/`↔`) into replacement
characters. This has caused false "syntax error" results from running `tsc`
or `grep` in bash right after an edit — the real file (confirmed via `Read`)
was fine; bash's cached copy just hadn't caught up or had corrupted a comment.

**When verifying a change you just made, trust the `Read` or `Grep` tool's
output, not bash's.** If bash and Read disagree, Read is right. Real deploys
(`deploy.bat`, Vercel's build) read the actual files directly on Windows, not
through this sandbox's mount, so they aren't affected by this.

---

## Deploy process

To deploy: run `deploy.bat` from `C:\Users\barak\Zwift Project`.

What it does:
1. Runs `check.bat` — verifies CSS and component files aren't truncated
2. `git add .` — stages all changes
3. `git commit -m "Auto deploy ..."` — commits
4. `git push` — pushes to GitHub; Vercel auto-rebuilds

**Don't push broken files.** check.bat will catch common truncation issues
from OneDrive sync, but it's not exhaustive.

**Alternatively**: Claude can deploy using the `deploy-zwift` skill (say "פרוס").
It replicates check.bat checks in bash and runs git operations directly.

Production URL: **https://zwift-delta.vercel.app**

---

## CSS design system

See `DESIGN_SYSTEM.md` for the full reference. Key rules:

- Colors: use `var(--accent)`, `var(--bg)`, `var(--text)`, `var(--muted)` — never hardcode hex
- Stat card grid: `stat-grid stat-grid-compact` = 5 columns (signal chips + stat cards)
- Rides summary grid: `stat-grid stat-grid-6` = 6 columns
- Header cards: `header-cards-grid` = 3 columns desktop / 1 column mobile
- Section headings: use `section-title` class (not `card-eyebrow`)
- Icons: colored dot badges use `stat-card-icon c-amber` / `c-red` / `c-teal` / etc.

---

## Architecture notes

### Server vs client components

- `app/dashboard/page.tsx` — server component, fetches Zwift data, renders layout
- Files with `"use client"` — client components (activity-chart, rides-table, etc.)
- No "use client" = server component

### Suspense boundary

`ChartDataSection` in `page.tsx` is wrapped in `<Suspense>`. It downloads FIT
files (per-ride telemetry) for the most recent 30 rides. Everything outside the
Suspense boundary renders immediately; this section streams in afterwards.

### ZwiftActivity interface

`lib/zwift.ts` exports `ZwiftActivity`. It has `[key: string]: unknown` to allow
any API field, plus explicit typed fields for commonly-used properties:
`avgCadence`, `avgHeartRate`, `fitFileBucket`, `fitFileKey`, etc.

### Training-plan sync: TrainingPeaks + Intervals.icu

The dashboard can auto-push each generated weekly plan to either or both of:

- **TrainingPeaks** (`lib/trainingpeaks.ts`) — cookie/token based (`Production_tpAuth`
  exchanged for a 1h Bearer token via the bookmarklet at `/connect-tp`). TP's own
  *official* Partner API is OAuth2, approval-gated (7–10 day review), and explicitly
  **not available for personal use** — so this integration deliberately uses TP's
  internal `tpapi.trainingpeaks.com` API instead, discovered via the open-source
  `trainingpeaks-mcp` project.
- **Intervals.icu** (`lib/intervals.ts`) — a personal API key (Basic auth, generated
  by the rider once at intervals.icu/settings → Developer Settings) with **no
  approval process** — genuinely self-service, unlike TP. Workouts are pushed as a
  real `.zwo` file (`generateZwoXml`), the same one used for the manual Zwift
  download, so Intervals.icu parses real structure and can relay it on to Garmin/Zwift
  via the sync the rider sets up once in their own Intervals.icu account.

Which platform(s) auto-sync targets is a rider-facing choice — see the segmented
control rendered under the Connections panel in `weekly-plan.tsx`
(`syncTarget`, persisted under the `zwiftSyncTarget` localStorage key: `"trainingpeaks"
| "intervals" | "both"`). `syncPlanToConnectedPlatforms()` is the single entry point
that respects this choice; both underlying push functions (`pushPlanToTP`,
`pushPlanToIntervals`) already no-op safely if their platform isn't connected, so
`"both"` (the default) is always safe regardless of what the rider has set up.

---

## Common mistakes to avoid

| Mistake | Correct approach |
|---|---|
| `sed -i 's/foo/bar/' file.tsx` | Use the `Edit` tool |
| Hard-coding `#2f8fe0` or `#ff6600` | Use `var(--accent)` |
| Using `display: grid` on `.dashboard-header` | It's a flex container |
| Adding `gridColumn: "1/-1"` to a flex child | Only works inside CSS grid |
| Using `className="section"` as a section wrapper | Use `<div className="section fade-in">` |
| Forgetting `style={{ margin: 0 }}` on `section-title` | Default margin adds unwanted space |


## ⛔ עיקרון יסוד — בניית אימון

**הספרייה (MyWhoosh/Zwift) היא תורה — לא קטלוג לבחירת אימונים.**

כל אימון שה-AI מייצר חייב להיות:
- מורכב block by block (warmup, intervals, cooldown) עם ערכים מדויקים
- מנומק פיזיולוגית לכל בלוק
- מותאם לנתוני המתאמן הספציפיים (TSB, FTP, שלב במחזור)

אסור לבחור תבנית מוכנה ולשנות ערכים. כל אימון = יצירה חדשה.

## ⛔ כלל עבודה — Claude Code ו-Claude

שני הכלים לא עובדים על אותם קבצים בו-זמנית.
Claude Code עובד על קוד מקומי.
Claude עובד רק על בדיקות ו-API calls.
לפני כל שינוי קוד — בדוק git log לראות מה השתנה.
