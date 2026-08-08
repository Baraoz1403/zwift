import { NextResponse } from "next/server";

/** Raw credential read-back is intentionally unavailable in the pilot. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Credential read-back is disabled." },
    { status: 410 },
  );
}
