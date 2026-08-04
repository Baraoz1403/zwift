import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan, setCachedPlan, getIntervalsCredentials, getCachedIdentity } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet, kvSet } from "@/lib/kv";
import { getFingerprint, fingerprintToPromptSummary, saveCoachingNote } from "@/lib/rider-fingerprint";
import { pushWorkoutToIntervals, listIntervalsEvents, deleteEventFromIntervals, fetchIcuActivities } from "@/lib/intervals";
import { buildIcuPerformanceContext } from "@/lib/icu-performance-context";
import { generateZwoXml } from "@/lib/zwo";
import type { WeeklyWorkout } from "@/lib/ai";
import type { WorkoutStructureBlock } from "@/lib/zwo";

/**
 * POST /api/m/chat
 *
 * Mobile + tablet coach chat. The coach has REAL capabilities:
 *   1. update_workout  — modifies a day's workout in the KV plan (persisted immediately)
 *   2. add_coach_note  — saves a coaching note to the rider fingerprint
 *
 * Context fed to every request:
 *   - Full rider fingerprint summary (30+ ride history, feel scores, FTP trend)
 *   - Current week's plan (all workouts)
 *   - Training load (CTL/ATL/TSB)
 *   - Rider profile (goals, age, session preferences)
 *
 * Chat history is persisted to KV (key: zwift:{id}:chat_history) so the
 * conversation is identical on every device.
 */

// Anthropic API calls can take 10-20s on large contexts — without this,
// Vercel's default 10s limit fires and the athlete sees "communication error".
export const maxDuration = 30;

const CHAT_HISTORY_KEY = (id: string) => `zwift:${id}:chat_history`;
const CHAT_HISTORY_TTL = 30 * 24 * 60 * 60; // 30 days
const MAX_HISTORY = 40; // messages stored (20 exchanges)
const CONTEXT_MESSAGES = 20; // messages sent to Anthropic each call

interface StoredMessage {
  role: "user" | "coach";
  text: string;
  ts: number;
  toolAction?: string; // e.g. "Updated Tuesday's workout"
}

// ── Tool definitions for Anthropic tool use ──────────────────────────────────

const TOOLS = [
  {
    name: "update_workout",
    description:
      "Update or replace a workout in the athlete's current weekly training plan. " +
      "Use when the athlete asks to change, modify, swap, adjust, shorten, or replace a specific day's workout. " +
      "Always call this tool when the athlete requests a plan change — do not just describe the change in text. " +
      "CRITICAL: description is REQUIRED — always write the complete workout structure: warmup blocks, main interval sets with exact power % and durations, recovery durations, cooldown. Example: 'Warmup 10min @50-60% FTP. Main: 3×8min @88-93% FTP / 4min @50% FTP. Cooldown 10min @50% FTP.' Without description, the athlete sees the old workout content and ICU gets a hollow ZWO file.",
    input_schema: {
      type: "object",
      properties: {
        day: {
          type: "string",
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          description: "Which day to update",
        },
        title: { type: "string", description: "New workout title (concise, e.g. 'Easy Endurance Spin')" },
        durationMin: { type: "number", description: "Duration in minutes" },
        description: {
          type: "string",
          description: "REQUIRED — complete workout structure: warmup (duration + power %), main intervals (sets × duration @ power % / recovery duration @ power %), cooldown. Example: 'Warmup 10min @50-60% FTP. Main: 3×8min @88-93% FTP with 4min @50% FTP recovery. Cooldown 10min @50% FTP.' Must include ALL blocks — never leave empty.",
        },
        targetPowerPctFtp: {
          type: "string",
          description: "Target power range as percentage of FTP for the main effort, e.g. '56-75%' or '85-95%'",
        },
        type: {
          type: "string",
          enum: ["endurance", "sweet-spot", "threshold", "vo2max", "sprint", "recovery", "rest", "race"],
          description: "Workout type category",
        },
        reason: { type: "string", description: "Brief physiological reason for this change (1 sentence)" },
      },
      required: ["day", "title", "durationMin", "type", "description"],
    },
  },
  {
    name: "add_coach_note",
    description:
      "Save a permanent coaching note about this athlete. " +
      "Use when the athlete shares important information that should influence ALL future training plans: " +
      "injury, fatigue pattern, lifestyle constraint, goal change, race date, strong preference. " +
      "These notes are injected into every future plan generation.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string", description: "The coaching observation or athlete note to save permanently" },
      },
      required: ["note"],
    },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert "Tuesday" + weekOf (Monday YYYY-MM-DD) → YYYY-MM-DD for that day. */
function dayNameToDate(weekOf: string, dayName: string): string {
  const ORDER = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const idx = ORDER.indexOf(dayName);
  if (idx < 0) return weekOf;
  const monday = new Date(weekOf + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() + idx);
  return monday.toISOString().slice(0, 10);
}

/**
 * After a workout is updated in KV, push it to Intervals.icu so Zwift sees it.
 * Replaces any existing WORKOUT event on the same day (delete-then-create).
 * Best-effort: does not throw, returns ok/error for logging.
 */
async function pushUpdatedWorkoutToIcu(
  icuKey: string,
  icuAthleteId: string,
  weekOf: string,
  workout: UpdateWorkoutInput,
  riderName?: string,
): Promise<{ pushed: boolean; error?: string }> {
  try {
    const workoutDate = dayNameToDate(weekOf, workout.day);

    // Delete any existing WORKOUT events for this day so we don't duplicate
    const existing = await listIntervalsEvents(icuKey, workoutDate, workoutDate, icuAthleteId).catch(() => []);
    for (const ev of existing.filter(e => e.category === "WORKOUT")) {
      await deleteEventFromIntervals(icuKey, ev.id, icuAthleteId).catch(() => {});
    }

    // Generate ZWO XML — pass riderName so personal TextEvent messages are injected
    const zwoXml = generateZwoXml(
      {
        title: workout.title,
        type: workout.type,
        durationMin: workout.durationMin,
        description: workout.description,
        targetPowerPctFtp: workout.targetPowerPctFtp,
      },
      undefined,
      "Zwift Dashboard AI",
      riderName,
    );

    const result = await pushWorkoutToIntervals({
      apiKey: icuKey,
      athleteId: icuAthleteId,
      workoutDay: workoutDate,
      title: workout.title,
      description: workout.description ?? workout.title,
      durationMin: workout.durationMin,
      type: workout.type,
      zwoXml,
    });

    return { pushed: result.ok, error: result.error };
  } catch (e) {
    return { pushed: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────

/**
 * Regenerate a WorkoutStructureBlock[] from the coach's update inputs.
 * Used to rebuild the power graph and session-structure panel after a coach edit.
 * Better than clearing structure entirely (which left just a 🚴 placeholder).
 */
function inferStructure(type: string, durationMin: number, targetPowerPctFtp?: string): WorkoutStructureBlock[] {
  const nums = (targetPowerPctFtp ?? "").match(/\d+/g)?.map(Number) ?? [];
  const mainPower = nums.length >= 2 ? ((nums[0] + nums[1]) / 2) / 100
                  : nums.length === 1 ? nums[0] / 100
                  : 0.70;
  const t = type.toLowerCase();
  const warmMin = Math.max(5, Math.round(durationMin * 0.15));
  const coolMin = Math.min(5, Math.max(3, Math.round(durationMin * 0.08)));
  const mainMin = Math.max(1, durationMin - warmMin - coolMin);

  if (t.includes("interval") || t.includes("sweet") || t.includes("threshold") || t.includes("vo2")) {
    const onMin  = t.includes("vo2") ? 3 : t.includes("threshold") ? 8 : 5;
    const offMin = Math.max(2, Math.round(onMin * 0.5));
    const repeats = Math.max(2, Math.round(mainMin / (onMin + offMin)));
    return [
      { type: "warmup",    durationMin: warmMin,              powerFtp: 0.60, label: "Warm up" },
      { type: "intervals", durationMin: repeats * (onMin + offMin), powerFtp: mainPower, recoveryPowerFtp: 0.50, repeats, onSec: onMin * 60, offSec: offMin * 60, label: "Main set" },
      { type: "cooldown",  durationMin: coolMin,              powerFtp: 0.50, label: "Cool down" },
    ];
  }
  if (t.includes("recover")) {
    return [
      { type: "warmup",      durationMin: warmMin, powerFtp: mainPower, label: "Easy start" },
      { type: "steadystate", durationMin: mainMin, powerFtp: mainPower, label: "Easy effort" },
      { type: "cooldown",    durationMin: coolMin, powerFtp: 0.45,      label: "Cool down" },
    ];
  }
  // Endurance / Tempo / default
  return [
    { type: "warmup",      durationMin: warmMin, powerFtp: mainPower, label: "Warm up" },
    { type: "steadystate", durationMin: mainMin, powerFtp: mainPower, label: "Main effort" },
    { type: "cooldown",    durationMin: coolMin, powerFtp: 0.50,      label: "Cool down" },
  ];
}

interface UpdateWorkoutInput {
  day: string;
  title: string;
  durationMin: number;
  description?: string;
  targetPowerPctFtp?: string;
  type: string;
  reason?: string;
}

async function execUpdateWorkout(
  athleteId: string,
  weekOf: string,
  input: UpdateWorkoutInput,
): Promise<{ ok: boolean; message: string; toolAction?: string }> {
  try {
    const plan = await getCachedPlan(athleteId, weekOf);
    if (!plan) return { ok: false, message: "No plan found for this week. Generate a plan first." };

    const idx = plan.workouts.findIndex(
      w => w.day?.toLowerCase() === input.day.toLowerCase(),
    );

    // Destructure away old structure — Marco's update replaces it with a freshly
    // inferred structure so the power graph and Session structure panel reflect
    // the NEW workout (not the old one). Without this, the card showed 🚴 and
    // the old blocks after every coach edit.
    const { structure: _cleared, ...oldWorkout } = (idx >= 0 ? plan.workouts[idx] : {}) as Partial<WeeklyWorkout>;
    const effectivePowerPct = input.targetPowerPctFtp ?? (oldWorkout as WeeklyWorkout).targetPowerPctFtp;
    const updatedWorkout: WeeklyWorkout = {
      ...oldWorkout,
      day: input.day,
      title: input.title,
      durationMin: input.durationMin,
      type: input.type,
      ...(input.description ? { description: input.description } : {}),
      ...(effectivePowerPct ? { targetPowerPctFtp: effectivePowerPct } : {}),
      // Regenerate structure from the updated type/duration/power so the graph
      // is immediately visible and the session-structure panel shows correct blocks.
      structure: inferStructure(input.type, input.durationMin, effectivePowerPct),
    };

    const updatedWorkouts = [...plan.workouts];
    if (idx >= 0) {
      updatedWorkouts[idx] = updatedWorkout;
    } else {
      updatedWorkouts.push(updatedWorkout);
    }

    await setCachedPlan(athleteId, { ...plan, workouts: updatedWorkouts });

    const action = `Updated ${input.day}'s workout to "${input.title}" (${input.durationMin} min)`;
    return { ok: true, message: `Successfully updated ${input.day}: "${input.title}" for ${input.durationMin} minutes.`, toolAction: action };
  } catch (e) {
    return { ok: false, message: `Failed to update plan: ${String(e)}` };
  }
}

async function execAddCoachNote(
  athleteId: string,
  input: { note: string },
): Promise<{ ok: boolean; message: string; toolAction?: string }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await saveCoachingNote(athleteId, today, input.note);
    return {
      ok: true,
      message: "Note saved to your coaching profile. It will influence all future training plans.",
      toolAction: `Saved coaching note: "${input.note.slice(0, 60)}${input.note.length > 60 ? "…" : ""}"`,
    };
  } catch (e) {
    return { ok: false, message: `Failed to save note: ${String(e)}` };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { message } = body as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, error: "message is required." }, { status: 400 });
  }

  const athleteId = String(session.athleteId);
  const weekOf = mondayOfCurrentWeek();

  // ── ICU credentials (needed for auto-push after workout update) ───────────
  const cookieIcuKey = cookieStore.get("zwift_intervals_key")?.value ?? null;
  const cookieIcuId  = cookieStore.get("zwift_intervals_id")?.value ?? null;
  // Fall back to KV-stored creds if cookies aren't set (other device connected ICU)
  const kvIcuCreds = cookieIcuKey ? null : await getIntervalsCredentials(athleteId).catch(() => null);
  const icuKey    = cookieIcuKey ?? kvIcuCreds?.icuKey ?? null;
  const icuAthleteId = cookieIcuId ?? kvIcuCreds?.icuId ?? null;

  // ── Load all context in parallel ──────────────────────────────────────────
  const [state, currentPlan, loadRaw, fingerprint, storedHistoryRaw, storedPerfCtxRaw, cachedIdentity] = await Promise.all([
    getStoredAthleteState(athleteId).catch(() => null),
    getCachedPlan(athleteId, weekOf).catch(() => null),
    kvGet(`zwift:${athleteId}:training_load`).catch(() => null),
    getFingerprint(athleteId).catch(() => null),
    kvGet(CHAT_HISTORY_KEY(athleteId)).catch(() => null),
    // ICU performance context: pre-computed during plan generation, cached for 7 days.
    // Contains 50/30/20-weighted summary of last 30 rides — power, HR, TSS, volume, patterns.
    kvGet(`zwift:${athleteId}:icu_perf_ctx`).catch(() => null),
    getCachedIdentity(athleteId).catch(() => null),
  ]);

  // Rider first name — injected into ZWO TextEvent messages so on-screen prompts
  // say "Interval 3 of 8 — GO! Barak" instead of a generic greeting.
  const riderFirstName = cachedIdentity?.firstName ?? undefined;

  // Build ICU performance context on-demand if not yet cached.
  // This ensures Marco always has 30-ride history even before a plan is generated.
  let icuPerfCtxRaw = storedPerfCtxRaw;
  if (!icuPerfCtxRaw && icuKey && icuAthleteId) {
    try {
      const todayD = new Date().toISOString().slice(0, 10);
      const since  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const acts   = await fetchIcuActivities(icuKey, icuAthleteId, since, todayD);
      const built  = buildIcuPerformanceContext(acts);
      if (built) {
        icuPerfCtxRaw = built;
        kvSet(`zwift:${athleteId}:icu_perf_ctx`, built, 7 * 24 * 60 * 60).catch(() => {});
      }
    } catch { /* best-effort — never fail the chat request */ }
  }

  const profile = state?.riderProfile;
  const macro = state?.macroCycle;

  let trainingLoad: Record<string, unknown> | null = null;
  try { if (loadRaw) trainingLoad = JSON.parse(loadRaw); } catch { /* */ }

  const chatHistory: StoredMessage[] = storedHistoryRaw
    ? (JSON.parse(storedHistoryRaw) as StoredMessage[])
    : [];

  // ── Build system prompt ───────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];

  const contextLines: string[] = [
    `Today: ${todayStr} (${todayDayName})`,
    `Current plan week: ${weekOf}`,
  ];

  // FTP from fingerprint (most accurate source)
  const ftpEntry = fingerprint?.ftpHistory?.length
    ? fingerprint.ftpHistory[fingerprint.ftpHistory.length - 1]
    : null;
  if (ftpEntry) contextLines.push(`FTP: ${ftpEntry.ftp}W (measured ${ftpEntry.date})`);

  if (trainingLoad) {
    const { ctl, atl, tsb, freshness } = trainingLoad as Record<string, unknown>;
    contextLines.push(`Training load: CTL=${ctl}, ATL=${atl}, TSB=${tsb} → ${freshness}`);
  }

  if (profile) {
    const GOAL_MAP: Record<string, string> = { fitness:"improve fitness", ftp:"raise FTP", weight:"lose weight", event:"event prep", fun:"fun" };
    if (profile.goals?.length) contextLines.push(`Goals: ${profile.goals.map((g: string) => GOAL_MAP[g] ?? g).join(", ")}`);
    if (profile.daysRange) contextLines.push(`Sessions/week: ${profile.daysRange}`);
    if (profile.sessionLength) contextLines.push(`Typical session: ${profile.sessionLength} min`);
    if (profile.ageYears) contextLines.push(`Age: ${profile.ageYears}`);
    if (profile.eventDate) contextLines.push(`Target event: ${profile.eventDate}`);
  }

  // Compute training phase from weekIndex (MacroCycleState has weekIndex, not currentPhase)
  if (macro != null) {
    const wi = macro.weekIndex;
    const phase = wi % 4 === 3 ? "Recovery" : wi < 4 ? "Base" : "Build";
    contextLines.push(`Training phase: ${phase} (macro cycle week ${wi + 1})`);
  }

  if (currentPlan) {
    const workoutList = currentPlan.workouts
      .map(w => {
        const isToday = w.day === todayDayName;
        const marker = isToday ? " ← TODAY" : "";
        return `  ${w.day}: ${w.title} (${w.durationMin}min, ${w.type ?? "?"})${marker}`;
      })
      .join("\n");
    contextLines.push(`\nThis week's plan (YOU generated this — take full ownership):\n${workoutList}`);
    if (currentPlan.summary) contextLines.push(`\nWeek summary: ${currentPlan.summary.slice(0, 400)}`);
    contextLines.push("\nYou are the sole coach. Every workout above was prescribed by you. When asked about any session, own it and explain your physiological reasoning. Never suggest another coach created it.");
  } else {
    contextLines.push("\nNo plan generated for this week yet. Tell the athlete to open the Week view (tap the calendar icon) to generate one — do NOT say another coach may have created a plan.");
  }

  // Full 30-ride fingerprint — feel scores + FTP trajectory from submitted feedback
  const fpSummary = fingerprintToPromptSummary(fingerprint);
  const fpSection = fpSummary
    ? `\n${fpSummary}`
    : "\n(No feedback history yet.)";

  // ICU performance context — actual ride data from last 30 activities (power, HR, TSS, volume)
  // Cached from plan generation. Without this, Marco only knows CTL/ATL/TSB, not actual ride content.
  const icuPerfSection = icuPerfCtxRaw
    ? `\n\n## Last 30 Rides — Performance Context\n${icuPerfCtxRaw}`
    : "";

  const icuStatus = (icuKey && icuAthleteId)
    ? "ICU connected — update_workout will auto-push to Intervals.icu and sync to Zwift."
    : "ICU not connected — plan updates save to KV only; athlete must connect ICU in Settings for Zwift sync.";

  const systemPrompt =
    "You are Marco, a knowledgeable, direct AI cycling coach with REAL authority to modify the athlete's training plan.\n" +
    "Your name is Marco. When introducing yourself or when asked your name, say 'Marco'.\n\n" +
    "CRITICAL RULES:\n" +
    "- When the athlete asks to change ANY workout, ALWAYS call the update_workout tool — do not just describe the change.\n" +
    "- When the athlete shares something important (injury, fatigue, goal change), ALWAYS call add_coach_note — then acknowledge.\n" +
    "- After calling a tool, give a brief, direct confirmation (1-2 sentences). Don't repeat the full plan.\n" +
    "- Be direct and practical. 2-4 sentences max unless the athlete asks for a detailed explanation.\n" +
    "- Always respect the rider's wishes. If they want to swap or drop a workout, do it — don't argue.\n\n" +
    "WORKOUT UPDATE RULE — NON-NEGOTIABLE:\n" +
    "- ALWAYS provide 'description' when calling update_workout. NEVER omit it.\n" +
    "- The description must include the full block structure: warmup → intervals → cooldown.\n" +
    "- Format: 'Warmup Xmin @50-60% FTP. Main: N×Xmin @X-X% FTP / Xmin @50% FTP recovery. Cooldown Xmin @50% FTP.'\n" +
    "- Without description, the athlete sees the OLD workout content and Zwift gets a hollow file — this is a coaching failure.\n" +
    "- Also provide targetPowerPctFtp for the main effort (e.g. '85-95%' for threshold).\n\n" +
    "YOUR ZWIFT / ICU SYNC CAPABILITY:\n" +
    `- ${icuStatus}\n` +
    "- When update_workout succeeds AND ICU is connected, the tool result will say 'Also pushed to Intervals.icu'.\n" +
    "- In your reply after a successful update, ALWAYS tell the athlete: (1) what changed, (2) that it was pushed to Zwift via ICU sync.\n" +
    "- If the tool result says 'ICU push failed', tell the athlete the update is saved but the Zwift sync failed, and they should reconnect ICU in Settings.\n" +
    "- If the tool result does NOT mention ICU push, tell the athlete: 'Updated in your plan — to sync to Zwift, make sure ICU is connected in Settings.'\n" +
    "- You DO have full authority to push workouts to Zwift via Intervals.icu. Never say you cannot do this.\n\n" +
    "ATHLETE CONTEXT:\n" +
    contextLines.join("\n") +
    fpSection +
    icuPerfSection;

  // ── Build Anthropic messages from recent history ─────────────────────────
  const recentHistory = chatHistory.slice(-CONTEXT_MESSAGES);
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...recentHistory.map(m => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    })),
    { role: "user", content: message.trim() },
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI not configured." }, { status: 503 });

  // ── Phase 1: Call Anthropic (with tools) ─────────────────────────────────
  let reply = "";
  let toolAction: string | undefined;
  let planUpdated = false;

  try {
    const aiRes1 = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: anthropicMessages,
      }),
    });

    if (!aiRes1.ok) {
      const errText = await aiRes1.text();
      console.error("Anthropic error:", aiRes1.status, errText);
      // Surface a specific message based on status code so the rider knows what happened
      const humanErr = aiRes1.status === 529
        ? "Anthropic API is overloaded right now — please try again in a moment."
        : aiRes1.status === 401
        ? "AI API key is invalid or expired — please contact the admin."
        : aiRes1.status === 413 || errText.includes("too large") || errText.includes("context_length")
        ? "Conversation context is too long. Please clear the chat history and try again."
        : `AI service returned an error (${aiRes1.status}). Please try again.`;
      return NextResponse.json({ ok: false, error: humanErr }, { status: 502 });
    }

    const data1 = await aiRes1.json();
    const stopReason = data1.stop_reason;
    const content1 = data1.content ?? [];

    // ── Tool use path ──────────────────────────────────────────────────────
    if (stopReason === "tool_use") {
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const block of content1) {
        if (block.type !== "tool_use") continue;

        let result: { ok: boolean; message: string; toolAction?: string };

        if (block.name === "update_workout") {
          const workoutInput = block.input as UpdateWorkoutInput;
          result = await execUpdateWorkout(athleteId, weekOf, workoutInput);
          if (result.ok) {
            planUpdated = true;
            // Auto-push to Intervals.icu so Zwift sees the change via ICU sync
            if (icuKey && icuAthleteId) {
              const icuPush = await pushUpdatedWorkoutToIcu(icuKey, icuAthleteId, weekOf, workoutInput, riderFirstName);
              if (icuPush.pushed) {
                result.message += " Also pushed to Intervals.icu (Zwift will sync automatically).";
                result.toolAction = (result.toolAction ?? "") + " → pushed to ICU";
              } else {
                // Surface the failure to the AI so it can report it to the athlete
                result.message += ` ICU push failed (${icuPush.error ?? "unknown error"}) — plan saved in KV, but Zwift sync did not happen.`;
                console.warn("ICU push failed after workout update:", icuPush.error);
              }
            }
          }
        } else if (block.name === "add_coach_note") {
          result = await execAddCoachNote(athleteId, block.input as { note: string });
        } else {
          result = { ok: false, message: `Unknown tool: ${block.name}` };
        }

        if (result.toolAction) toolAction = result.toolAction;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.message,
        });
      }

      // ── Phase 2: Get final text response after tool execution ───────────
      const aiRes2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          system: systemPrompt,
          tools: TOOLS,
          messages: [
            ...anthropicMessages,
            { role: "assistant", content: content1 },
            { role: "user", content: toolResults },
          ],
        }),
      });

      if (aiRes2.ok) {
        const data2 = await aiRes2.json();
        reply = data2.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text ?? "";
      } else {
        reply = toolAction
          ? `Done — ${toolAction}.`
          : "I made the change, but couldn't generate a confirmation message.";
      }
    } else {
      // No tool use — plain text response
      reply = content1.find((b: { type: string; text?: string }) => b.type === "text")?.text ?? "";
    }

    if (!reply) reply = "I couldn't generate a response. Please try again.";

    // ── Persist chat history ──────────────────────────────────────────────
    const userMsg: StoredMessage = { role: "user", text: message.trim(), ts: Date.now() };
    const coachMsg: StoredMessage = {
      role: "coach",
      text: reply,
      ts: Date.now(),
      ...(toolAction ? { toolAction } : {}),
    };

    const newHistory = [...chatHistory, userMsg, coachMsg].slice(-MAX_HISTORY);
    await kvSet(CHAT_HISTORY_KEY(athleteId), JSON.stringify(newHistory), CHAT_HISTORY_TTL).catch(() => {});

    return NextResponse.json({ ok: true, reply, planUpdated, toolAction });

  } catch (err) {
    console.error("Coach chat error:", err);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
