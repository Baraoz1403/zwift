import { NextRequest, NextResponse } from "next/server";
import { loginToZwift, fetchOwnProfile, ZwiftAuthError, ZwiftApiError } from "@/lib/zwift";
import { encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { kvGet, kvSet } from "@/lib/kv";
import { mirrorZwiftAuthToKv, storeRiderIdentity } from "@/lib/kv-plan-state";
import { ensurePlanProvisioned } from "@/lib/plan-runner";

// Auto-provisioning (see ensurePlanProvisioned) can involve a full AI plan
// generation (30-60s) for an athlete who doesn't have one yet - without this,
// Vercel would cut the function at the default 10s hobby-plan limit right in
// the middle of a first-time rider's login.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are both required." },
      { status: 400 }
    );
  }

  try {
    const result = await loginToZwift(email, password);

    // Best-effort: grab the real Zwift player id from /api/profiles/me so
    // future per-rider calls (activities, events) have it. If this single
    // extra call fails for some reason, login still proceeds - the
    // dashboard's own profile fetch will surface any real problem clearly.
    let athleteId: string | undefined;
    try {
      const profile = await fetchOwnProfile(result.accessToken);
      athleteId = profile.id != null ? String(profile.id) : undefined;
      // Cache firstName + ftp so tablet/mobile pages show correct data even
      // when the live Zwift API call fails later (expired token, rate limit).
      if (athleteId) {
        storeRiderIdentity(athleteId, profile.firstName, profile.ftp).catch(() => {});
        // Save optional WhatsApp phone number provided at login
        if (phone) {
          kvSet(`zwift:${athleteId}:whatsapp_phone`, phone).catch(() => {});
        }
      }
    } catch {
      athleteId = undefined;
    }

    const cookieValue = await encryptSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      athleteId,
      expiresAt: Date.now() + result.expiresInSeconds * 1000,
    });

    const res = NextResponse.json({ ok: true });
    const isSecure = process.env.NODE_ENV === "production";
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    // Mirror the refresh token to KV so the headless cron job (see
    // app/api/ai/weekly-plan/cron/route.ts) can keep generating plans for
    // this athlete even on weeks they never open the dashboard - best
    // effort, never blocks the login response.
    if (athleteId) {
      await mirrorZwiftAuthToKv(athleteId, result.refreshToken);
    }

    // ── Restore connections from KV (cross-device persistence) ──────────────
    // If the rider connected ICU or TP on another device, their credentials are
    // stored in Vercel KV keyed by Zwift athlete ID. Restore them now so the
    // session on this device is immediately connected without manual re-setup.
    //
    // CRITICAL: every branch below has a matching "else clear the cookie"
    // path. This used to only ever SET these cookies when KV had a match for
    // the freshly-logged-in athlete, and silently left them untouched
    // otherwise - which meant a stale ICU/TP cookie from a PREVIOUS Zwift
    // account that once logged in on this same browser survived into a new
    // athlete's session unless that new athlete happened to have their own
    // KV entry already. That is exactly how one rider's Intervals.icu key
    // got attributed to a second rider sharing a browser: the second
    // rider's own KV entry was empty, the first rider's still-set cookie was
    // never cleared, and later code (since removed - see the doc comment on
    // syncPlanToIcuAndMark in lib/headless-sync.ts) treated "cookie present"
    // as "belongs to whoever is logged in now" and copied it into the wrong
    // athlete's KV entry. Explicitly clearing here whenever KV has nothing
    // for this athlete closes that gap at its source, regardless of what
    // any other code does with the cookie afterward.
    if (athleteId) {
      const cookieBase = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, path: "/" };
      const clearOpts = { ...cookieBase, maxAge: 0 };

      // Intervals.icu — API keys don't expire, restore directly
      const icuKey = await kvGet(`zwift:${athleteId}:icu_key`);
      if (icuKey) {
        const icuId   = await kvGet(`zwift:${athleteId}:icu_id`);
        const icuName = await kvGet(`zwift:${athleteId}:icu_name`);
        res.cookies.set("zwift_intervals_key",  icuKey,          { ...cookieBase, maxAge: 60 * 60 * 24 * 365 });
        res.cookies.set("zwift_intervals_id",   icuId  ?? "0",   { ...cookieBase, maxAge: 60 * 60 * 24 * 365 });
        res.cookies.set("zwift_intervals_name", icuName ?? "",   { ...cookieBase, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
      } else {
        res.cookies.set("zwift_intervals_key",  "", clearOpts);
        res.cookies.set("zwift_intervals_id",   "", clearOpts);
        res.cookies.set("zwift_intervals_name", "", { ...clearOpts, httpOnly: false });
      }

      // TrainingPeaks — restore token + refresh token; if the access token
      // expired, the existing auto-refresh logic will renew it on first push
      const tpToken = await kvGet(`zwift:${athleteId}:tp_token`);
      if (tpToken) {
        const tpId        = await kvGet(`zwift:${athleteId}:tp_id`);
        const tpRefresh   = await kvGet(`zwift:${athleteId}:tp_refresh`);
        const tpExpiresIn = await kvGet(`zwift:${athleteId}:tp_expires_in`);
        res.cookies.set("zwift_tp_token",   tpToken,           { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
        res.cookies.set("zwift_tp_id",      tpId ?? "",        { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
        if (tpRefresh) {
          res.cookies.set("zwift_tp_refresh", tpRefresh,       { ...cookieBase, maxAge: 60 * 60 * 24 * 30 });
        }
        // Record expiry at a point in the past so auto-refresh fires immediately
        // — safer than assuming the stored token is still valid
        const staleExpiry = String(Date.now() - 1);
        res.cookies.set("zwift_tp_expires", staleExpiry, { ...cookieBase, httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
        // Silence the TypeScript unused-variable warning
        void tpExpiresIn;
      } else {
        res.cookies.set("zwift_tp_token",   "", clearOpts);
        res.cookies.set("zwift_tp_id",      "", clearOpts);
        res.cookies.set("zwift_tp_refresh", "", clearOpts);
        res.cookies.set("zwift_tp_expires", "", { ...clearOpts, httpOnly: false });
      }

      // ── Auto-provision: first plan + first ICU sync, no button needed ────
      // Fire-and-forget — do NOT await. Plan generation calls Zwift + OpenAI
      // and can take 30–90 s. Awaiting it caused the login route to exceed
      // Vercel's 60 s maxDuration, killing the function mid-response and
      // surfacing as "Network error" on the client. The nightly cron and the
      // next page load both retry ensurePlanProvisioned if it didn't finish.
      void ensurePlanProvisioned(athleteId, result.accessToken).catch(() => {});
    }

    return res;
  } catch (e) {
    if (e instanceof ZwiftAuthError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof ZwiftApiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: "Unexpected server error during login." },
      { status: 500 }
    );
  }
}
