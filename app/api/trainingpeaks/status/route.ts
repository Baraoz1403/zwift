/**
 * GET /api/trainingpeaks/status
 * Returns whether TrainingPeaks is connected in the current session.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

  return NextResponse.json({
    connected: !!tpToken && !tokenExpired,
    tokenExpired,
    tpAthleteId: tpAthleteId ?? null,
  });
}
