# Zwift AI Dashboard — Product Specification

> This document is the single source of truth for what we are building and why.
> Every code change must be traceable to a requirement here.
> When in doubt: read this first.

---

## Vision — One Sentence

The athlete enters their profile once, opens the dashboard, and finds a world-class weekly training plan waiting — built by an AI coaching brain that has studied their ride history, knows where they are in their season, and gives them clear, personalized direction for every single session.

---

## The Athlete

**Barak — Serious Amateur Cyclist**
- FTP: ~235W, ~3.2 W/kg (Intermediate)
- Trains 4–5 days/week, 50–70 min/session
- Uses Zwift primarily; also Intervals.icu
- Goal: FTP improvement + fitness + body composition
- **Does not want to be a coach.** Sets profile once, expects excellent plans automatically.
- Standard: "Open Zwift and find an excellent daily and weekly plan waiting. Period."

---

## Core Principle — The Coaching Brain

The AI is not a scheduler. It is a coach. A coach does three things:

1. **Studies the athlete** — actual ride data, TSB, adherence, ride quality, HR trends
2. **Plans ahead** — 14-week season arc with phase logic (Base → Build → Peak)
3. **Communicates personally** — every session has a reason, an execution cue, and a success criterion tied to THIS athlete's actual numbers

**Fundamental rule (from CLAUDE.md):**
> The library is scripture — not a catalog to pick from.
> Every workout is a new creation. Never choose a ready template and change values.
> Every workout = built block by block with precise physiological rationale.

---

## Features — Specification

### F1: Rider Profile
**What it does:** Stores the athlete's goals, FTP, weight, event date, training days/week, session length preference.

**Acceptance criteria:**
- Profile stored in KV, persists across sessions
- FTP pulled automatically from Zwift API (updated on each login)
- Weight pulled from Zwift API
- Profile inputs the athlete controls: goals (text), event date, days/week, session length, notes
- Profile data flows into every plan generation call — never generates a plan without it

---

### F2: Season Plan (14-week arc)
**What it does:** Generated once from the rider's profile. Defines the macro structure of the season — which phase each week is in, what the primary and secondary quality sessions should be, the TSS target, and a coaching note.

**Acceptance criteria:**
- Generated via POST `/api/ai/season-plan`
- Stored in KV, TTL 120 days
- Phases: Base (weeks 1–6), Build (weeks 7–11), Peak (weeks 12–14)
- Each week has: phase, theme, tuesdayTitle, thursdayTitle, tssTarget, coachNote
- Titles are exact names from the workout library — no invented names
- Recovery weeks auto-inserted every 4th week
- Season plan is shown to the rider in the dashboard (not hidden)
- Season context injected into every weekly plan generation

**Not acceptable:**
- Generating a season plan with identical sessions across consecutive weeks
- Season plan that doesn't progress (same tuesdayTitle for 3+ weeks in a row)

---

### F3: Weekly Training Plan
**What it does:** 7-day plan generated each Monday. Derived from the season plan + athlete's current state (TSB, recent rides, adherence, HR trends).

**Acceptance criteria:**
- Generated via `/api/ai/weekly-plan`
- Cached in KV, TTL 7 days
- Contains exactly 7 days (Mon–Sun), including rest days
- Each workout has: day, date, type, title, durationMin, targetPowerPctFtp, description, structure[]
- Structure is always present for non-rest sessions (warmup + intervals/blocks + cooldown)
- Structure duration sum = durationMin exactly
- Plan is auto-synced to Intervals.icu on generation (server-side)
- Plan references the season plan's week (tuesdayTitle, thursdayTitle respected)

**Week shape (enforced, not suggested):**
Rest → Easy/Foundation → **Hard** (highest TSB) → Rest → **Moderate-Hard** → Moderate → Long Endurance → Rest

**Hard session minimum (Base phase, Intermediate rider):**
- 1–2 hard sessions (Sweet Spot ≥88% FTP)
- TSB < -20 is the only acceptable reason to drop to 0 hard sessions
- "Recovery needed" without a specific TSB number is not acceptable

---

### F4: Workout Quality Standard
**This is the most important feature. Everything else is infrastructure.**

Workout quality lives in the **structure**, not in text descriptions. No coaching text is shown on workout cards — the athlete trusts the plan because it is visibly correct and well-structured.

A quality workout means:
1. **Correct session type** for the athlete's TSB, phase, and W/kg — never a template picked at random
2. **Exact power targets** derived from their FTP (if FTP=235W: Sweet Spot = 207–216W, not a generic percentage)
3. **Correct structure** — warmup + intervals/blocks + cooldown, durations sum to total, cadence targets on every block
4. **Appropriate progression** — each week harder or different than the previous in a measurable way
5. **Coherent week** — sessions relate to each other (hard → easy → hard, long on Saturday, rest after hard)

The athlete should look at the weekly plan and think "this coach knows what they're doing" — not because of explanatory text, but because the workouts look right.

---

### F5: Today Page (`/today`)
**What it does:** Mobile-first page showing today's workout from the active weekly plan.

**Acceptance criteria:**
- Available at `/today`, no login redirect (session cookie auth)
- Shows: workout name, duration, power target in watts (not %), effort level
- Shows the description in full (not truncated)
- "Push to Zwift" button → sends to Intervals.icu → appears in Zwift
- "I'm tired" button → triggers immediate plan adjustment for today + rest of week
- "Skip today" → marks as skipped, affects next week's generation
- Week strip at bottom showing Mon–Sun with color coding (completed / today / upcoming / rest)
- Loads in under 2 seconds on mobile

---

### F6: Athlete Feedback Loop
**What it does:** Athlete inputs (feelings, notes, skips) flow back into plan generation.

**Acceptance criteria:**
- Coach panel in dashboard: free-text note + today's feeling score
- Feeling scores per session (completed this week)
- When plan is regenerated: previous week's adherence data is used
- If athlete skipped 2+ sessions: next week's volume reduced, reason stated
- If athlete reported sessions were "too hard": intensity adjusted
- If HR flag is "high" on recent rides: lighter week generated automatically

---

### F7: Platform Connections
**What it does:** Push workouts to Intervals.icu (primary) and optionally TrainingPeaks.

**Acceptance criteria:**
- Intervals.icu: connected via API key in profile. Auto-sync on plan generation.
- TrainingPeaks: connected via browser bookmarklet token. Optional.
- Sync target choice: "intervals" | "trainingpeaks" | "both" (persisted in localStorage)
- Sync status shown on each workout card: ✓ Synced / ⚠ Error (with detail)
- Manual "Push to Zwift" button on `/today` page

---

## UI Requirements

**Design standard:** Short, colorful, smart, attractive. Inspired by Zwift's own workout library (clear workout visualization, inviting to execute, not a text wall).

**Workout card (desktop dashboard):**
- Full-bleed power profile thumbnail (dominant visual element)
- Day + date (small, uppercase)
- Title (large, bold)
- Stats bar: duration · TSS · effort dots · power zone (colored)
- Sync status
- No text descriptions on cards

**Workout card (mobile /today):**
- Even cleaner — title, power target in watts, description, action buttons
- No technical jargon visible (no "TSS", no "IF")

**What is NOT acceptable:**
- Generic template names as the primary information ("Sweet Spot 2×8" as the only content)
- Descriptions that are invisible, truncated, or hidden behind a click
- Text walls (description > 3 sentences)
- Percentages instead of watts in primary display

---

## Data Architecture

```
Zwift API (rides, FTP, weight, profile)
    ↓
lib/zwift.ts → plan-runner.ts
                    ↓
Season Plan (KV: zwift:{id}:season_plan)
                    ↓
Weekly Plan Generation (lib/ai.ts)
    ← Rider Profile (KV: zwift:{id}:state)
    ← Training Load / TSB (lib/training-load.ts)
    ← Adherence history (lib/adherence.ts)
    ← Season context (seasonContextToPrompt)
                    ↓
Weekly Plan (KV: zwift:{id}:plan:{weekOf})
                    ↓                    ↓
Dashboard UI           Intervals.icu (auto-sync)
(weekly-plan.tsx)      TrainingPeaks (optional)
                    ↓
/today page (workout-card.tsx)
```

---

## Priority Order

**P0 — Must work, non-negotiable:**
1. Workout description quality (F4) — passes the WHY/HOW/SUCCESS test
2. Weekly plan generation (F3) — correct phase, TSB-aware, season-connected
3. Descriptions visible on workout cards (F4) — not hidden

**P1 — Core product:**
4. Season plan (F2) — 14-week arc guides every weekly plan
5. /today page (F5) — mobile, usable before a ride
6. Intervals.icu auto-sync (F7)

**P2 — Completes the loop:**
7. Athlete feedback → plan adjustment (F6)
8. TrainingPeaks sync (F7)

---

## What Is Out of Scope

- Multi-user / SaaS
- Run workouts (cycling only)
- Video / content library
- Social features
- Custom workout builder for the athlete
- Nutrition tracking

---

## Known Technical Debt (address in order)

1. **Force-merge architecture**: `workout-selector.ts` chooses workout titles by template. This contradicts the core principle ("every workout = new creation"). The fix is to let the AI build each workout from scratch using the library as reference, with validation replacing force-merge. **Not yet done.**
2. **Descriptions not shown on cards**: Fixed in session 2026-07-20 (weekly-plan.tsx edit). Verify in production.
3. **AI prompt quality**: Strengthened 2026-07-20 — requires exact watt numbers, prohibits generic phrases. Verify next plan generation.
4. **HEAD.lock in bash**: git commits from bash sandbox fail due to Windows lock file. Workaround: use deploy.bat from Windows.

---

## Acceptance Test — "Is This Good Enough?"

Run this test on any generated plan before considering it shipped:

1. Pick any non-rest session from the week
2. Look at the workout structure (blocks, power targets, durations)
3. Ask: is the power target derived from the athlete's actual FTP (e.g., 207W, not "88%")?
4. Ask: is the session appropriate for the current TSB and phase?
5. Ask: is this week measurably different from last week (different session, higher load, or deliberate recovery)?
6. Ask: does the week shape make sense — hard sessions where TSB is highest, long ride pre-rest?

If any answer is "no" — the plan fails. Do not ship it.
