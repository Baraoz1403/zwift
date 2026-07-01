/**
 * Low-level Zwift API client.
 *
 * This talks directly to Zwift's own backend using the same reverse-engineered
 * flow validated by the standalone test script: an OAuth2 "password grant"
 * against secure.zwift.com, followed by authenticated calls to Zwift's data
 * API host using the resulting bearer token.
 *
 * This is not an officially documented API. Zwift could change it without
 * notice - every function here fails loudly (throws a typed error) rather
 * than silently returning bad data, so problems surface immediately in the
 * UI instead of showing wrong numbers.
 */

const AUTH_HOST = "secure.zwift.com";
const AUTH_PATH = "/auth/realms/zwift/protocol/openid-connect/token";
const API_HOST = "us-or-rly101.zwift.com";

const GAME_CLIENT_HEADERS = {
  Platform: "OSX",
  Source: "Game Client",
  "User-Agent":
    "CNL/3.30.8 (macOS 13 Ventura; Darwin Kernel 22.4.0) zwift/1.0.110983 curl/7.78.0",
};

export class ZwiftAuthError extends Error {}
export class ZwiftApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface ZwiftLoginResult {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
}

/**
 * Logs in to Zwift with a user's own email + password.
 * Throws ZwiftAuthError for bad credentials, ZwiftApiError for unexpected
 * responses (e.g. Zwift changed the endpoint shape).
 */
export async function loginToZwift(
  username: string,
  password: string
): Promise<ZwiftLoginResult> {
  let resp: Response;
  try {
    resp = await fetch(`https://${AUTH_HOST}${AUTH_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: "Zwift Game Client",
        grant_type: "password",
        username,
        password,
      }).toString(),
    });
  } catch (e) {
    throw new ZwiftApiError(
      `Network error reaching Zwift's auth server: ${(e as Error).message}`,
      0
    );
  }

  if (resp.status === 401) {
    throw new ZwiftAuthError("Incorrect Zwift email or password.");
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new ZwiftApiError(
      `Unexpected response from Zwift auth server (HTTP ${resp.status}): ${body.slice(
        0,
        300
      )}`,
      resp.status
    );
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new ZwiftApiError("Zwift login response had no access_token.", resp.status);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in ?? 3600,
  };
}

export interface ZwiftProfile {
  id?: number | string;
  firstName?: string;
  lastName?: string;
  ftp?: number;
  weight?: number;
  // Zwift's rider "Level" shown on the site/Companion app, split by
  // discipline. Confirmed real field names (via a reverse-engineered Go
  // client's struct definitions, not guessed): achievementLevel is the
  // cycling level and runAchievementLevel is the running level, each stored
  // as level*100 (e.g. level 32 with some XP into the next level reads as
  // ~3200-3299) - divide by 100 and floor to get the displayed level number.
  achievementLevel?: number;
  runAchievementLevel?: number;
  /** ISO date string (YYYY-MM-DD) if Zwift returns it - not always present.
   *  Used to auto-derive ageYears without the rider having to type it in. */
  dateOfBirth?: string;
  [key: string]: unknown;
}

async function getProfilesJson(
  path: string,
  accessToken: string
): Promise<ZwiftProfile> {
  let resp: Response;
  try {
    resp = await fetch(`https://${API_HOST}${path}`, {
      headers: {
        ...GAME_CLIENT_HEADERS,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    throw new ZwiftApiError(
      `Network error fetching Zwift profile: ${(e as Error).message}`,
      0
    );
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new ZwiftApiError(
      `Zwift profile API returned HTTP ${resp.status}: ${body.slice(0, 300)}`,
      resp.status
    );
  }

  return (await resp.json()) as ZwiftProfile;
}

/**
 * Fetches the logged-in rider's own profile.
 *
 * The initial connection test 404'd by guessing the athlete id from the JWT
 * "sub" claim and calling /api/profiles/{that-uuid}. The actual, correct
 * call for "my own profile" is the literal path /api/profiles/me - no id
 * lookup needed at all. (Confirmed against Sauce4Zwift, an actively
 * maintained companion app that uses this exact same endpoint.)
 */
export async function fetchOwnProfile(accessToken: string): Promise<ZwiftProfile> {
  return getProfilesJson("/api/profiles/me", accessToken);
}

/**
 * Fetches another rider's profile by their real Zwift player id (the `id`
 * field from fetchOwnProfile/fetchProfileById - not the JWT's UUID). Used
 * for future features like event/race comparisons.
 */
export async function fetchProfileById(
  accessToken: string,
  athleteId: string | number
): Promise<ZwiftProfile> {
  return getProfilesJson(`/api/profiles/${athleteId}`, accessToken);
}

export interface ZwiftActivity {
  id: number;
  // The exact 64-bit activity id as a string. JS numbers can't hold ids this
  // large without rounding, so anything that looks up an activity by id
  // (e.g. the rideon endpoint) should prefer id_str over id when present.
  id_str?: string;
  name?: string;
  sport?: string;
  startDate?: string;
  endDate?: string;
  distanceInMeters?: number;
  totalElevation?: number;
  avgWatts?: number;
  calories?: number;
  movingTimeInMs?: number;
  // Cadence and heart rate may be present in the activity list response
  // depending on the Zwift API version - accessed as typed fields here so
  // the compiler knows about them, even though they come via [key: string].
  avgCadence?: number;
  avgHeartRate?: number;
  fitFileBucket?: string;
  fitFileKey?: string;
  [key: string]: unknown;
}

async function fetchActivitiesPage(
  accessToken: string,
  athleteId: string | number,
  start: number,
  limit: number
): Promise<{ ok: true; data: ZwiftActivity[] } | { ok: false; status: number; body: string }> {
  let resp: Response;
  try {
    resp = await fetch(
      `https://${API_HOST}/api/profiles/${athleteId}/activities?start=${start}&limit=${limit}`,
      {
        headers: {
          ...GAME_CLIENT_HEADERS,
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );
  } catch (e) {
    throw new ZwiftApiError(
      `Network error fetching Zwift activities: ${(e as Error).message}`,
      0
    );
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, body };
  }

  const data = await resp.json();
  return { ok: true, data: Array.isArray(data) ? (data as ZwiftActivity[]) : [] };
}

/**
 * Fetches the rider's ride/run history.
 * Endpoint shape confirmed via an actively maintained third-party Zwift
 * client (bzimmer/gravl): GET /api/profiles/{athleteId}/activities
 *
 * Zwift's API caps how many activities a *single* request can return (an
 * undocumented `limit` ceiling that rejects anything too large with HTTP 400
 * "limit.too.large") - a single request therefore only ever returns the
 * rider's most recent page, never their whole history. That used to mean
 * the dashboard's oldest visible ride was wherever that one page ran out
 * (e.g. a few months back for an active rider), even though older rides
 * exist further back. To actually have "months of history" rather than
 * "one page of history", this first finds the largest page size Zwift will
 * accept for this account, then walks forward through subsequent pages
 * (`start` += page size each time) and concatenates them, stopping only
 * when Zwift returns a page that's smaller than asked for (the genuine end
 * of the rider's history) or a hard safety cap on page count is hit - so
 * one extremely prolific account can't turn this into an unbounded number
 * of requests on every dashboard load.
 */
export async function fetchActivities(
  accessToken: string,
  athleteId: string | number,
  limit: number = 200
): Promise<ZwiftActivity[]> {
  const candidateSizes = Array.from(new Set([limit, 100, 50, 25]))
    .filter((n) => n <= limit)
    .sort((a, b) => b - a);

  let pageSize: number | null = null;
  let firstPageData: ZwiftActivity[] = [];
  let lastError: { status: number; body: string } | null = null;

  for (const n of candidateSizes) {
    const result = await fetchActivitiesPage(accessToken, athleteId, 0, n);
    if (result.ok) {
      pageSize = n;
      firstPageData = result.data;
      break;
    }
    lastError = { status: result.status, body: result.body };
    // Only worth retrying smaller if it's specifically a "too large" style
    // rejection - any other error (auth, 500, etc.) should fail loudly now.
    if (!/limit/i.test(result.body)) break;
  }

  if (pageSize == null) {
    throw new ZwiftApiError(
      `Zwift activities API returned HTTP ${lastError?.status}: ${(lastError?.body ?? "").slice(0, 300)}`,
      lastError?.status ?? 0
    );
  }

  const all: ZwiftActivity[] = [...firstPageData];

  // Safety cap: at most this many pages (e.g. 20 pages x 100 = up to 2000
  // rides), so this still finishes in a bounded number of requests.
  const MAX_PAGES = 20;

  // Pages 1..MAX_PAGES-1 fetched in small concurrent batches rather than one
  // at a time - a rider with a long history used to mean up to ~19
  // sequential round trips to Zwift's servers just to load the dashboard,
  // which is most of why the page felt slow even after the FIT-download work
  // was moved out of the critical path. We don't know the true page count
  // ahead of time, so each batch is requested speculatively; once a page
  // comes back shorter than a full page (the genuine end of history) or
  // errors, later results in that same batch are discarded and pagination
  // stops - same end result as the old one-at-a-time loop, just faster when
  // there's more history to walk through.
  const BATCH_SIZE = 4;
  let nextPage = 1;
  let done = firstPageData.length !== pageSize;

  while (!done && nextPage < MAX_PAGES) {
    const batchPages = Array.from(
      { length: Math.min(BATCH_SIZE, MAX_PAGES - nextPage) },
      (_, i) => nextPage + i
    );
    const batchResults = await Promise.all(
      batchPages.map((page) => fetchActivitiesPage(accessToken, athleteId, page * pageSize, pageSize))
    );

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      if (!result.ok) {
        done = true; // we already have real history - don't fail the whole fetch over a later page.
        break;
      }
      all.push(...result.data);
      if (result.data.length < pageSize) {
        done = true;
        break;
      }
    }

    nextPage += batchPages.length;
  }

  return all;
}

/**
 * Downloads the raw FIT file for an activity (per-second ride telemetry
 * lives inside it - see lib/fit-parser.ts for the part that decodes it).
 *
 * Confirmed working against a real account via a one-off diagnostic test:
 * the bucket+key form a plain, unauthenticated object URL - no Bearer token
 * needed for this part, unlike every other call in this file.
 */
export async function fetchActivityFit(activity: ZwiftActivity): Promise<ArrayBuffer> {
  const bucket = activity.fitFileBucket as string | undefined;
  const key = activity.fitFileKey as string | undefined;
  if (!bucket || !key) {
    throw new ZwiftApiError("This activity has no FIT file reference.", 0);
  }

  const url = `https://${bucket}.s3.amazonaws.com/${key}`;
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new ZwiftApiError(`Network error downloading FIT file: ${(e as Error).message}`, 0);
  }

  if (!resp.ok) {
    throw new ZwiftApiError(`FIT file download returned HTTP ${resp.status}`, resp.status);
  }

  // Node's built-in fetch (undici) has a known bug (nodejs/node#47130) where
  // reading a large response body in one shot via resp.arrayBuffer() can
  // throw "RangeError: Maximum call stack size exceeded" deep inside its own
  // internal body consumer - this is exactly the crash this app kept hitting,
  // triggered by FIT files being multi-hundred-KB bodies. Reading the body
  // manually, chunk by chunk via the stream reader, and concatenating once
  // at the end avoids that internal code path entirely.
  if (!resp.body) {
    return await resp.arrayBuffer();
  }

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  const reader = resp.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.length;
    }
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged.buffer;
}

export interface RideOnGiver {
  id?: number;
  profileId?: number;
  fullName?: string;
  profileImageUrl?: string;
  createDate?: string;
  [key: string]: unknown;
}

/**
 * Who specifically gave a "Ride On" on one activity (not just the aggregate
 * count already included on the activity object).
 *
 * IMPORTANT: activityId must be the *exact* id - Zwift activity ids are
 * 64-bit and lose precision as a JS number, so always pass the activity's
 * id_str here, never `String(activity.id)` if id_str is available.
 */
export async function fetchRideOns(
  accessToken: string,
  activityId: string
): Promise<RideOnGiver[]> {
  let resp: Response;
  try {
    resp = await fetch(`https://${API_HOST}/api/activities/${activityId}/rideon`, {
      headers: {
        ...GAME_CLIENT_HEADERS,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    throw new ZwiftApiError(`Network error fetching Ride On givers: ${(e as Error).message}`, 0);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new ZwiftApiError(
      `Ride On API returned HTTP ${resp.status}: ${body.slice(0, 300)}`,
      resp.status
    );
  }

  const data = await resp.json();
  return Array.isArray(data) ? (data as RideOnGiver[]) : [];
}
