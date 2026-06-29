/**
 * One-off, exploratory diagnostics - NOT a permanent feature.
 *
 * Checks, against one of the rider's own real activities, whether three
 * not-officially-documented things actually work in practice:
 *   1. Downloading the activity's raw FIT file (in-ride HR/cadence/power
 *      time-series live inside this file, if we can get it).
 *   2. Whether the activity object carries any field that distinguishes a
 *      free ride from a group ride / event.
 *   3. Whether GET /api/activities/{id}/rideon returns who specifically
 *      gave a "Ride On", not just a count.
 *
 * Every step is wrapped so one failure doesn't stop the others - the whole
 * point is to see exactly what works and what doesn't on a real account.
 */

import { ZwiftActivity } from "./zwift";
import { debugRecordFields, type FitFieldSummary } from "./fit-parser";

const API_HOST = "us-or-rly101.zwift.com";

const GAME_CLIENT_HEADERS = {
  Platform: "OSX",
  Source: "Game Client",
  "User-Agent":
    "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
};

const RIDE_TYPE_HINT_PATTERN = /group|event|subgroup|type|tag|world/i;

export interface DiagnosticsReport {
  activityId: string;
  activityName?: string;
  rawKeys: string[];
  rideTypeCandidates: Record<string, unknown>;
  fitFile: {
    attempted: boolean;
    urlTried?: string;
    ok: boolean;
    status?: number;
    contentType?: string;
    byteLength?: number;
    looksLikeFit?: boolean;
    error?: string;
    /**
     * Every field number actually seen in this FIT file's RECORD messages
     * (including developer fields, which the real per-ride parser doesn't
     * decode) - here specifically to answer "is cadence (field 4) really
     * missing from the file, or just not where the parser looks for it?"
     */
    fieldSummary?: FitFieldSummary[];
  };
  rideOn: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    count?: number;
    sample?: unknown;
    error?: string;
  };
}

async function tryFitFile(activity: ZwiftActivity): Promise<DiagnosticsReport["fitFile"]> {
  const bucket = activity.fitFileBucket as string | undefined;
  const key = activity.fitFileKey as string | undefined;

  if (!bucket || !key) {
    return { attempted: false, ok: false, error: "Activity has no fitFileBucket/fitFileKey." };
  }

  const url = `https://${bucket}.s3.amazonaws.com/${key}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return {
        attempted: true,
        urlTried: url,
        ok: false,
        status: resp.status,
        error: body.slice(0, 200),
      };
    }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // FIT files have the ASCII signature ".FIT" at byte offset 8-11.
    const sig =
      bytes.length >= 12
        ? String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
        : "";
    const looksLikeFit = sig === ".FIT";
    return {
      attempted: true,
      urlTried: url,
      ok: true,
      status: resp.status,
      contentType: resp.headers.get("content-type") ?? undefined,
      byteLength: bytes.length,
      looksLikeFit,
      fieldSummary: looksLikeFit ? debugRecordFields(buf) : undefined,
    };
  } catch (e) {
    return { attempted: true, urlTried: url, ok: false, error: (e as Error).message };
  }
}

async function tryRideOn(
  accessToken: string,
  activityId: string
): Promise<DiagnosticsReport["rideOn"]> {
  const url = `https://${API_HOST}/api/activities/${activityId}/rideon`;
  try {
    const resp = await fetch(url, {
      headers: {
        ...GAME_CLIENT_HEADERS,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { attempted: true, ok: false, status: resp.status, error: body.slice(0, 200) };
    }
    const data = await resp.json();
    const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
    return {
      attempted: true,
      ok: true,
      status: resp.status,
      count: arr ? arr.length : undefined,
      sample: arr ? arr.slice(0, 2) : data,
    };
  } catch (e) {
    return { attempted: true, ok: false, error: (e as Error).message };
  }
}

export async function runActivityDiagnostics(
  accessToken: string,
  activity: ZwiftActivity
): Promise<DiagnosticsReport> {
  const rawKeys = Object.keys(activity);
  const rideTypeCandidates: Record<string, unknown> = {};
  for (const key of rawKeys) {
    if (RIDE_TYPE_HINT_PATTERN.test(key)) {
      rideTypeCandidates[key] = activity[key];
    }
  }

  // Zwift activity ids are 64-bit and exceed what a JS "number" can hold
  // exactly (Number.MAX_SAFE_INTEGER). If the API gives us an "id_str"
  // string field alongside the numeric "id", use that for anything that
  // needs the exact id - otherwise it silently gets rounded by JSON parsing
  // and any lookup by id (like the rideon endpoint) 404s on a wrong id.
  const exactActivityId = (activity.id_str as string | undefined) ?? String(activity.id);

  const [fitFile, rideOn] = await Promise.all([
    tryFitFile(activity),
    tryRideOn(accessToken, exactActivityId),
  ]);

  return {
    activityId: exactActivityId,
    activityName: activity.name,
    rawKeys,
    rideTypeCandidates,
    fitFile,
    rideOn,
  };
}
