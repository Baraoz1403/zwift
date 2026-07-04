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

  return NextResponse.json({
    connected: !!tpToken,
    tpAthleteId: tpAthleteId ?? null,
  });
}
