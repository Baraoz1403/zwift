# Intervals.icu connect flow — content + implementation notes for Claude Code

Prepared by Claude (Cowork) per Barak's request. Research is done; this hands
off the actual UI/code wiring, since `lib/` and API routes are Claude Code's
territory per CLAUDE.md's role split, and `lib/ai.ts` / `lib/periodization.ts`
/ `lib/plan-runner.ts` / the weekly-plan API routes were showing as actively
modified (uncommitted) when this was written, suggesting Claude Code may
already be mid-task in this area.

## Why no OAuth, and why no real screenshots

Two things were checked before writing this:

1. **OAuth was considered and rejected.** Intervals.icu does support real
   OAuth2 (`intervals.icu/oauth/authorize` → user approves → exchange code for
   a token, zero manual key-copying). But getting a client_id/secret requires
   emailing david@intervals.icu with an app name, public website URL, privacy
   policy URL, and logo, then waiting for manual approval. Intervals.icu's own
   docs say plainly: *"you don't need to do all this if you just want access
   to your own data. Use your API key."* Since this dashboard is single-user,
   OAuth is disproportionate — the personal API key (Basic auth) is the
   correct, intended mechanism here. No further OAuth research needed.

2. **Real screenshots of the actual Developer Settings page aren't
   possible from this session.** That page only exists behind Barak's own
   Intervals.icu login, which this session has no access to. What follows is
   accurate written copy (verified against Intervals.icu's own docs at
   forum.intervals.icu/t/api-access-to-intervals-icu/609), not a photographed
   walkthrough. If real screenshots are wanted, someone with an active
   Intervals.icu session needs to grab them (or grant Claude in Chrome access
   to a logged-in browser tab).

## The actual flow (verified against Intervals.icu's docs)

1. Go to **intervals.icu** and log in (or create a free account).
2. Click **Settings** (top-right of any page once logged in).
3. Scroll to the bottom of the Settings page — the section is called
   **"Developer Settings."**
4. Click **Generate** next to API Key. A key appears (a long alphanumeric
   string). Click to copy it.
5. Come back to this dashboard's **Connections** panel and paste the key into
   the Intervals.icu field, then save.

That's the whole flow — no redirect, no app approval, no waiting.

## Suggested in-app copy (drop-in for the Connections panel)

**Step 1 — "Open Intervals.icu"**
> Don't have an account yet? It's free — sign up takes under a minute.
> [Open intervals.icu →] (opens in new tab)

**Step 2 — "Generate your API key"**
> Once logged in, click **Settings** (top right), then scroll all the way
> down to **Developer Settings**. Click **Generate**, then copy the key it
> shows you.

**Step 3 — "Paste it here"**
> [API key input field] [Connect button]
> We only use this to sync your training plans — never anything else.

**Error/validation copy**, if the pasted key fails a live test call:
> That key didn't work — double check you copied the whole string with no
> extra spaces, or generate a fresh one from Developer Settings.

**Success copy:**
> ✓ Connected. Your next generated plan will sync automatically.

## Implementation notes for Claude Code

- Validate the key immediately on paste by making a lightweight authenticated
  call (e.g. `GET /api/v1/athlete/0/profile` with Basic auth `API_KEY:<key>`)
  server-side, not just saving it blind — so the rider gets instant
  success/failure feedback instead of finding out at next plan-generation
  time. This mirrors the existing `lib/intervals.ts` Basic-auth pattern
  already used elsewhere in the codebase — no new auth mechanism needed.
- No OAuth routes, no new redirect/callback pages — this is strictly a
  "paste a key, validate it live" UI, consistent with what's already built.
- Copy above is deliberately plain-language and short per the project's
  existing tone (see the shrunk "Talk to your coach" box, the simplified
  Connections captions removed elsewhere this session) — avoid re-adding
  dense explanatory paragraphs.
