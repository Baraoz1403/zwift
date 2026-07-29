import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan, setCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet, kvSet } from "@/lib/kv";
import { getFingerprint, fingerprintToPromptSummary, saveCoachingNote } from "@/lib/rider-fingerprint";
import type { WeeklyWorkout } from "@/lib/ai";

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
      "Always call this tool when the athlete requests a plan change — do not just describe the change in text.",
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
          description: "Full workout description with intervals, targets, and instructions",
        },
        targetPowerPctFtp: {
          type: "string",
          description: "Target power range as percentage of FTP, e.g. '56-75%' or '85-95%'",
        },
        type: {
          type: "string",
          enum: ["endurance", "sweet-spot", "threshold", "vo2max", "sprint", "recovery", "rest", "race"],
          description: "Workout type category",
        },
        reason: { type: "string", description: "Brief physiological reason for this change (1 sentence)" },
      },
      required: ["day", "title", "durationMin", "type"],
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

// ── Tool execution ────────────────────────────────────────────────────────────

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

    const updatedWorkout: WeeklyWorkout = {
      ...(idx >= 0 ? plan.workouts[idx] : {}),
      day: input.day,
      title: input.title,
      durationMin: input.durationMin,
      type: input.type,
      ...(input.description ? { description: input.description } : {}),
      ...(input.targetPowerPctFtp ? { targetPowerPctFtp: input.targetPowerPctFtp } : {}),
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

  // ── Load all context in parallel ──────────────────────────────────────────
  const [state, currentPlan, loadRaw, fingerprint, storedHistoryRaw] = await Promise.all([
    getStoredAthleteState(athleteId).catch(() => null),
    getCachedPlan(athleteId, weekOf).catch(() => null),
    kvGet(`zwift:${athleteId}:training_load`).catch(() => null),
    getFingerprint(athleteId).catch(() => null),
    kvGet(CHAT_HISTORY_KEY(athleteId)).catch(() => null),
  ]);

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

  if (macro?.currentPhase) contextLines.push(`Training phase: ${macro.currentPhase}`);

  if (currentPlan) {
    const workoutList = currentPlan.workouts
      .map(w => {
        const isToday = w.day === todayDayName;
        const marker = isToday ? " ← TODAY" : "";
        return `  ${w.day}: ${w.title} (${w.durationMin}min, ${w.type ?? "?"})${marker}`;
      })
      .join("\n");
    contextLines.push(`\nThis week's plan:\n${workoutList}`);
    if (currentPlan.summary) contextLines.push(`\nWeek summary: ${currentPlan.summary.slice(0, 400)}`);
  }

  // Full 30-ride fingerprint — the most important context
  const fpSummary = fingerprintToPromptSummary(fingerprint);
  const fpSection = fpSummary
    ? `\n${fpSummary}`
    : "\n(No ride history yet — plan based on profile only.)";

  const systemPrompt =
    "You are a knowledgeable, direct AI cycling coach with REAL authority to modify the athlete's training plan.\n\n" +
    "CRITICAL RULES:\n" +
    "- When the athlete asks to change ANY workout, ALWAYS call the update_workout tool — do not just describe the change.\n" +
    "- When the athlete shares something important (injury, fatigue, goal change), ALWAYS call add_coach_note — then acknowledge.\n" +
    "- After calling a tool, give a brief, direct confirmation (1-2 sentences). Don't repeat the full plan.\n" +
    "- Be direct and practical. 2-4 sentences max unless the athlete asks for a detailed explanation.\n" +
    "- Always respect the rider's wishes. If they want to swap or drop a workout, do it — don't argue.\n\n" +
    "ATHLETE CONTEXT:\n" +
    contextLines.join("\n") +
    fpSection;

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
      const err = await aiRes1.text();
      console.error("Anthropic error:", aiRes1.status, err);
      return NextResponse.json({ ok: false, error: "AI service error." }, { status: 502 });
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
          result = await execUpdateWorkout(athleteId, weekOf, block.input as UpdateWorkoutInput);
          if (result.ok) planUpdated = true;
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
