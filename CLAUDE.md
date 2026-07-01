# CLAUDE.md — Developer Rules for the Zwift AI Dashboard

This file tells Claude Code / Cowork how to work safely in this project.
Read it before making any changes.

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

Production URL: **https://zwift-fawn.vercel.app**

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
