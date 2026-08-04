import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, decryptSession } from "@/lib/session";
import { kvSet, kvGet } from "@/lib/kv";

/**
 * POST /api/admin/seed-training-load
 *
 * One-time bootstrap: writes zwift:{athleteId}:training_load to KV for the
 * currently logged-in athlete. Needed only if plan-runner ran before the
 * kvSet fix (commit 9081bad) and the key was never written.
 *
 * After seeding, every future plan generation will overwrite this with fresh
 * ICU-computed values automatically. Safe to leave in place.
 *
 * Body (optional): { ctl, atl, tsb, freshness }
 * If body is omitted, reads plan-runner's icu_perf_ctx to re-derive values.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ error: "No session" }, { status: 401 });

  const athleteId = String(session.athleteId);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use empty */ }

  // If explicit values provided, use them directly
  if (typeof body.ctl === "number" && typeof body.atl === "number" && typeof body.tsb === "number") {
    const payload = {
      ctl: body.ctl,
      atl: body.atl,
      tsb: body.tsb,
      freshness: typeof body.freshness === "string" ? body.freshness : body.tsb >= 5 ? "fresh" : body.tsb >= -10 ? "neutral" : body.tsb >= -25 ? "fatigued" : "very fatigued",
    };
    await kvSet(`zwift:${athleteId}:training_load`, JSON.stringify(payload), 14 * 24 * 60 * 60);
    return NextResponse.json({ ok: true, athleteId, wrote: payload });
  }

  // Otherwise, try to derive from icu_perf_ctx
  const perfCtxRaw = await kvGet(`zwift:${athleteId}:icu_perf_ctx`).catch(() => null);
  if (!perfCtxRaw) {
    return NextResponse.json({ error: "No icu_perf_ctx found and no explicit values supplied. Pass { ctl, atl, tsb } in body." }, { status: 400 });
  }

  try {
    const ctx = JSON.parse(perfCtxRaw) as Record<string, unknown>;
    const ctl = typeof ctx.ctl === "number" ? ctx.ctl : null;
    const atl = typeof ctx.atl === "number" ? ctx.atl : null;
    const tsb = typeof ctx.tsb === "number" ? ctx.tsb : null;
    if (ctl == null || atl == null || tsb == null) {
      return NextResponse.json({ error: "icu_perf_ctx missing ctl/atl/tsb fields", ctx }, { status: 400 });
    }
    const freshness = tsb >= 5 ? "fresh" : tsb >= -10 ? "neutral" : tsb >= -25 ? "fatigued" : "very fatigued";
    const payload = { ctl, atl, tsb, freshness };
    await kvSet(`zwift:${athleteId}:training_load`, JSON.stringify(payload), 14 * 24 * 60 * 60);
    return NextResponse.json({ ok: true, athleteId, source: "icu_perf_ctx", wrote: payload });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
