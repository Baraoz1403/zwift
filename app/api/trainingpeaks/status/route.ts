/**
 * GET /api/trainingpeaks/status
 * Returns whether TrainingPeaks is connected in the current session.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Always dynamic, never cached - the polling loop in weekly-plan.tsx (waiting
// for the TrainingPeaks bookmarklet to complete) depends on every call
// hitting the real, current cookie state. A cached {connected:false} here
// would make that poll spin forever even after a genuinely successful connect.
export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  // TP credentials are stored in dedicated small cookies (not the main session)
  // to avoid the 4KB browser cookie size limit.
  const tpToken = cookieStore.get("zwift_tp_token")?.value;
  const tpAthleteId = cookieStore.get("zwift_tp_id")?.value;
  const tpExpires = cookieStore.get("zwift_tp_expires")?.value;

  // Token is present but may be expired — check the expiry timestamp.
  // zwift_tp_expires stores epoch-ms when the token stops being valid.
  const tokenExpired = tpExpires ? Date.now() > Number(tpExpires) : false;

  const res = NextResponse.json({
    connected: !!tpToken && !tokenExpired,
    tokenExpired,
    tpAthleteId: tpAthleteId ?? null,
  });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
