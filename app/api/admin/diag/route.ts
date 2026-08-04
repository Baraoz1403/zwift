import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { buildAuthHeader } from "@/lib/intervals";

export async function GET() {
  const athletes = await kvGet("zwift:athletes");
  const ids: string[] = athletes ? JSON.parse(athletes) : [];
  const results: Record<string, unknown> = {};

  for (const id of ids) {
    const icuKey = await kvGet(`zwift:${id}:icu_key`);
    if (!icuKey) { results[id] = { status: "no_key" }; continue; }

    try {
      const res = await fetch(`https://intervals.icu/api/v1/athlete/me/profile`, {
        headers: { Authorization: buildAuthHeader(icuKey) },
      });
      const text = await res.text();
      // Return first 300 chars of the profile JSON to see structure
      results[id] = { status: res.status, profileSnippet: text.slice(0, 300) };
    } catch (e) {
      results[id] = { error: String(e) };
    }
  }
  return NextResponse.json({ athletes: ids, results });
}
