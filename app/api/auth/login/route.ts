import { NextRequest, NextResponse } from "next/server";
import { loginToZwift, fetchOwnProfile, ZwiftAuthError, ZwiftApiError } from "@/lib/zwift";
import { encryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { kvGet } from "@/lib/kv";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

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

    // ── Restore connections from KV (cross-device persistence) ──────────────
    // If the rider connected ICU or TP on another device, their credentials are
    // stored in Vercel KV keyed by Zwift athlete ID. Restore them now so the
    // session on this device is immediately connected without manual re-setup.
    if (athleteId) {
      const cookieBase = { httpOnly: true, secure: isSecure, sameSite: "lax" as const, path: "/" };

      // Intervals.icu — API keys don't expire, restore directly
      const icuKey = await kvGet(`zwift:${athleteId}:icu_key`);
      if (icuKey) {
        const icuId   = await kvGet(`zwift:${athleteId}:icu_id`);
        const icuName = await kvGet(`zwift:${athleteId}:icu_name`);
        res.cookies.set("zwift_intervals_key",  icuKey,          { ...cookieBase, maxAge: 60 * 60 * 24 * 365 });
        res.cookies.set("zwift_intervals_id",   icuId  ?? "0",   { ...cookieBase, maxAge: 60 * 60 * 24 * 365 });
        res.cookies.set("zwift_intervals_name", icuName ?? "",   { ...cookieBase, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
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
      }
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
