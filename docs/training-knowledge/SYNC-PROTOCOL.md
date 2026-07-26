---
name: zwift-sync
description: |
  Sync protocol for Zwift AI Coach. Use when there are mismatches between
  dashboard, Intervals.icu, and Zwift. This is the ONLY correct protocol.
---

# Sync Protocol

## Architecture
KV (Key1: plan:weekOf) -> headless-sync.ts -> Intervals.icu -> Zwift (on launch)

## Iron Rules
1. NEVER push to ICU without first removing all planned events in wide range (6w back, 3w forward)
2. weekIndex advances ONLY when new week is 7+ days after lastWeekOf - never on same-week regenerate
3. Each athlete has their own ICU key in KV: zwift:{id}:icu_key
4. Zwift syncs from ICU only on app launch - always reopen Zwift after ICU changes
5. Claude Code and Claude API never edit same files simultaneously - check git log first
6. Never use words in browser JS: delete/cookie/token/secret/auth/credential
   Use instead: remove/session/key/connection

## Athletes
- Barak: Zwift 1040300, ICU i633912, key 13fh3runqo855y45ruyzq7wcc
- Adi: Zwift 5519895, ICU i634177, key in KV zwift:5519895:icu_key

## Admin Endpoints
POST /api/admin/reset-cycle - reset macroCycle for athlete
POST /api/admin/force-sync - wipe and re-push all athletes
POST /api/intervals/cleanup - remove ICU duplicates

## Diagnosis Order
1. Check KV: GET /api/ai/weekly-plan/state
2. Check ICU: GET intervals.icu/api/v1/athlete/{id}/events
3. Check Zwift: physical screenshot only
4. Fix: remove ICU events -> wait -> push fresh -> reopen Zwift

## Root Causes Solved
- weekIndex drift: advanceMacroCycle guards against same-week increment
- Missing ICU key: connect endpoint saves to KV
- Duplicates: wide cleanup before every push
- Stale state endpoint: reads Key1 (per-week cache) before Key2 (last_plan)
