/**
 * Strava API client — OAuth2 authentication and activity fetch.
 *
 * Setup required (one-time):
 *  1. Create a Strava app at https://www.strava.com/settings/api
 *  2. Set "Authorization Callback Domain" to your domain (e.g. zwift-delta.vercel.app)
 *  3. Add to Vercel env vars:
 *     STRAVA_CLIENT_ID      (from "My API Application" page on Strava)
 *     STRAVA_CLIENT_SECRET  (from the same page)
 *
 * How it works:
 *  - User clicks "Connect Strava" → GET /api/strava/oauth-start → redirects to Strava auth page
 *  - User approves → Strava redirects to /api/strava/oauth-callback?code=...
 *  - Callback exchanges code for access+refresh tokens, stores in cookie
 *  - Activity API reads cookie, calls Strava activities endpoint
 *  - Token refresh handled automatically on each request
 *
 * Activity deduplication (Strava vs Zwift):
 *  Strava aggregates Zwift auto-uploads + Garmin outdoor rides. When merging
 *  with Zwift activities, we check start_date and elapsed_time similarity
 *  (within ±5 min) to avoid counting the same ride twice.
 */

const STRAVA_AUTH_URL  = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE  = "https://www.strava.com/api/v3";

export interface StravaActivity {
  id:           number;
  name:         string;
  type:         string;  // e.g. "Ride", "Run", "VirtualRide"
  sport_type:   string;
  start_date:   string;  // ISO 8601
  elapsed_time: number;  // seconds
  moving_time:  number;  // seconds
  distance:     number;  // metres
  total_elevation_gain: number;
  average_watts?: number;
  average_heartrate?: number;
  average_cadence?: number;
  trainer: boolean;      // true = indoor / Zwift
}

export interface StravaTokens {
  access_token:  string;
  refresh_token: string;
  expires_at:    number; // Unix timestamp
  athlete_id:    number;
  athlete_name:  string;
}

/** Build the Strava OAuth authorization URL for redirecting the user. */
export function buildStravaAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri:  redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope:         "read,activity:read",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

/** Exchange an OAuth authorization code for tokens. */
export async function exchangeStravaCode(code: string): Promise<StravaTokens> {
  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set in env.");
  }

  const resp = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      grant_type:    "authorization_code",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Strava token exchange failed: ${resp.status} ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at,
    athlete_id:    data.athlete?.id ?? 0,
    athlete_name:  [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(" ") || "Strava athlete",
  };
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens> {
  const clientId     = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not set in env.");
  }

  const resp = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Strava token refresh failed: ${resp.status} ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at:    data.expires_at,
    athlete_id:    data.athlete?.id ?? 0,
    athlete_name:  [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(" ") || "Strava athlete",
  };
}

/**
 * Fetch recent Strava activities for the authenticated athlete.
 * @param accessToken  Valid Strava OAuth access token.
 * @param count        How many activities to fetch (max 200 per Strava API page).
 */
export async function fetchStravaActivities(
  accessToken: string,
  count = 60
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    per_page: String(Math.min(count, 200)),
    page: "1",
  });
  const resp = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Strava activities fetch failed: ${resp.status} ${body.slice(0, 200)}`);
  }

  return resp.json() as Promise<StravaActivity[]>;
}

/**
 * De-duplicate Strava activities against a list of Zwift activities.
 *
 * Strava often mirrors Zwift indoor rides (Zwift auto-uploads to Strava).
 * We exclude any Strava activity where start_date and moving_time are within
 * ±5 min of a known Zwift ride, since they represent the same session.
 *
 * Returns only Strava activities that are NOT already in Zwift — i.e. genuine
 * outdoor / Garmin rides the Zwift API doesn't have.
 *
 * @param stravaActivities  Raw Strava activity list.
 * @param zwiftDatesMs      Start timestamps (ms) of known Zwift activities.
 */
export function deduplicateStravaActivities(
  stravaActivities: StravaActivity[],
  zwiftDatesMs: number[]
): StravaActivity[] {
  const TOLERANCE_MS = 5 * 60 * 1000; // ±5 minutes
  return stravaActivities.filter(sa => {
    const saMs = new Date(sa.start_date).getTime();
    return !zwiftDatesMs.some(zMs => Math.abs(saMs - zMs) < TOLERANCE_MS);
  });
}
