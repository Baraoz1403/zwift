import { NextResponse } from "next/server";
import { pilotModeStatus } from "@/lib/pilot-mode";

export async function GET() {
  return NextResponse.json({
    ...pilotModeStatus(),
    sourceCommit: "309d8f2232c8c1bdf590b2461173f1a6bce9bc1a",
    productionProjectProtected: true,
    externalWriteScope: "explicit_icu_workout_approval_only",
  });
}
