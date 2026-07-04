/**
 * TrainingPeaks API client
 *
 * Auth approach: TrainingPeaks stores a JWT in the `Production_tpAuth` cookie.
 * This same JWT value works as a Bearer token for api.trainingpeaks.com.
 * Users copy it from DevTools → Application → Cookies, paste it once into
 * our "Connect TrainingPeaks" form, and we store it (encrypted) in their
 * Zwift session cookie. No partnership or OAuth client credentials required.
 *
 * Why this works: TrainingPeaks' own web app sends this cookie with every
 * request, and the API validates it as a standard Bearer token.
 *
 * Zwift sync: when a user connects TrainingPeaks to Zwift (in the Zwift
 * Companion app), any planned workout added to their TP calendar automatically
 * appears in Zwift's workout menu. Pushing via this integration is therefore
 * a supported, legitimate path — TrainingPeaks is Zwift's official partner.
 */

const TP_API = "https://api.trainingpeaks.com";

export interface TPAthleteProfile {
  Id: number | string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  [key: string]: unknown;
}

/** Validate a TP token and return the athlete profile. Throws on failure. */
export async function fetchTPProfile(tpToken: string): Promise<TPAthleteProfile> {
  const res = await fetch(`${TP_API}/v1/athlete/profile`, {
    headers: {
      Authorization: `Bearer ${tpToken}`,
      Accept: "application/json",
      "User-Agent": "ZwiftAIDashboard/1.0",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TrainingPeaks auth failed (${res.status}): ${body.slice(0, 120)}`);
  }
  return res.json() as Promise<TPAthleteProfile>;
}

/** Map our AI workout type to TrainingPeaks WorkoutType string */
function toTPWorkoutType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("run")) return "Run";
  if (t.includes("swim")) return "Swim";
  if (t.includes("strength") || t.includes("gym")) return "Strength";
  if (t.includes("walk")) return "Walk";
  return "Bike";
}

export interface PushWorkoutOptions {
  tpToken: string;
  tpAthleteId: string;
  /** YYYY-MM-DD */
  workoutDay: string;
  title: string;
  description: string;
  /** minutes */
  durationMin: number;
  type: string;
  /** Optional TSS estimate */
  tssPlanned?: number;
  /** %FTP target as string e.g. "75-85%" */
  targetPower?: string;
}

export interface PushWorkoutResult {
  ok: boolean;
  workoutId?: string | number;
  error?: string;
  status?: number;
  responseBody?: string;
}

/**
 * Push a single planned workout to TrainingPeaks calendar.
 *
 * Endpoint: POST https://api.trainingpeaks.com/v2/workouts/plan
 * Docs: https://github.com/TrainingPeaks/PartnersAPI/wiki/Workouts-Create
 */
export async function pushWorkoutToTP(opts: PushWorkoutOptions): Promise<PushWorkoutResult> {
  const body = {
    AthleteId: opts.tpAthleteId,
    WorkoutDay: opts.workoutDay,
    WorkoutType: toTPWorkoutType(opts.type),
    Title: opts.title,
    Description: opts.description,
    TotalTimePlanned: opts.durationMin / 60,      // TP uses decimal hours
    ...(opts.tssPlanned ? { TSSPlanned: opts.tssPlanned } : {}),
  };

  try {
    const res = await fetch(`${TP_API}/v2/workouts/plan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.tpToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "ZwiftAIDashboard/1.0",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }

    if (res.ok) {
      return {
        ok: true,
        workoutId: (parsed as Record<string, unknown>)?.Id ?? (parsed as Record<string, unknown>)?.id,
        status: res.status,
      };
    }

    return {
      ok: false,
      status: res.status,
      error: `HTTP ${res.status}`,
      responseBody: text.slice(0, 300),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
