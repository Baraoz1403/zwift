import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { getStoredAthleteState, getCachedPlan } from "@/lib/kv-plan-state";
import { mondayOfCurrentWeek } from "@/lib/periodization";
import { kvGet } from "@/lib/kv";
import { getFingerprint } from "@/lib/rider-fingerprint";

/**
 * POST /api/m/chat
 *
 * Mobile coach chat endpoint. Accepts { message: string } and returns
 * { reply: string }. Includes athlete plan + profile as system context
 * so the AI can give personalized responses.
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "Not logged in." }, { status: 401 });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ ok: false, error: "Session invalid." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { message } = body as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, error: "message is required." }, { status: 400 });
  }

  const athleteId = session.athleteId;
  const weekOf = mondayOfCurrentWeek();

  // Fetch context in parallel (best-effort — failures don't break the chat)
  const [state, currentPlan, loadRaw, fingerprint] = await Promise.all([
    getStoredAthleteState(athleteId).catch(() => null),
    getCachedPlan(athleteId, weekOf).catch(() => null),
    kvGet(`zwift:${athleteId}:training_load`).catch(() => null),
    getFingerprint(athleteId).catch(() => null),
  ]);

  const profile = state?.riderProfile;
  const macro = state?.macroCycle;

  // FTP from fingerprint (most recent)
  const ftpEntry = fingerprint?.ftpHistory?.length
    ? fingerprint.ftpHistory[fingerprint.ftpHistory.length - 1]
    : null;
  const ftpWatts = ftpEntry?.ftp ?? null;
  let trainingLoad: Record<string, unknown> | null = null;
  try {
    if (loadRaw) trainingLoad = JSON.parse(loadRaw);
  } catch { /* ignore */ }

  // Build a concise athlete context block for the system prompt
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];

  const todayWorkout = currentPlan?.workouts.find(
    w => w.date === todayStr || w.day === todayDayName
  ) ?? null;

  const contextLines: string[] = [
    `Today's date: ${todayStr} (${todayDayName})`,
  ];

  if (ftpWatts) contextLines.push(`Athlete FTP: ${ftpWatts}W`);

  if (trainingLoad) {
    const { ctl, atl, tsb, freshness } = trainingLoad as Record<string, unknown>;
    contextLines.push(
      `Training load — CTL (fitness): ${ctl}, ATL (fatigue): ${atl}, TSB (freshness): ${tsb} → ${freshness}`
    );
  }

  if (profile) {
    if (profile.goals?.length) {
      const GOAL_MAP: Record<string, string> = { fitness:"improve fitness", ftp:"raise FTP", weight:"lose weight", event:"event prep", fun:"fun" };
      contextLines.push(`Goals: ${profile.goals.map((g: string) => GOAL_MAP[g] ?? g).join(", ")}`);
    }
    if (profile.daysRange) contextLines.push(`Sessions per week: ${profile.daysRange}`);
    if (profile.sessionLength) contextLines.push(`Typical session: ${profile.sessionLength} min`);
    if (profile.ageYears) contextLines.push(`Age: ${profile.ageYears}`);
    if (profile.eventDate) contextLines.push(`Target event date: ${profile.eventDate}`);
  }

  if (macro?.currentPhase) contextLines.push(`Training phase: ${macro.currentPhase}`);

  if (todayWorkout) {
    contextLines.push(
      `Today's planned workout: "${todayWorkout.title}" — ${todayWorkout.durationMin} min` +
      (todayWorkout.targetPowerPctFtp ? `, target ${todayWorkout.targetPowerPctFtp} FTP` : "") +
      (todayWorkout.description ? `. ${todayWorkout.description.slice(0, 200)}` : "")
    );
  }

  if (currentPlan) {
    const workoutTitles = currentPlan.workouts
      .filter(w => {
        const t = (w.title + " " + (w.type ?? "")).toLowerCase();
        return !t.includes("rest") && !t.includes("recovery") && !t.includes("off");
      })
      .map(w => `${w.day}: ${w.title} (${w.durationMin}min)`)
      .join("; ");
    if (workoutTitles) {
      contextLines.push(`This week's plan: ${workoutTitles}`);
    }
    if (currentPlan.summary) {
      contextLines.push(`Week summary: ${currentPlan.summary.slice(0, 300)}`);
    }
  }

  const systemPrompt =
    "You are a knowledgeable and supportive AI cycling coach. " +
    "You give concise, practical, evidence-based advice. " +
    "Keep responses clear and direct — 2-4 paragraphs maximum. " +
    "Be encouraging but honest. Don't be overly technical unless asked.\n\n" +
    "ATHLETE CONTEXT:\n" +
    contextLines.join("\n");

  // Call Anthropic Claude API
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "AI not configured." }, { status: 503 });
  }

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: [{ role: "user", content: message.trim() }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic API error:", aiRes.status, errText);
      return NextResponse.json({ ok: false, error: "AI service error." }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text ?? "I couldn't generate a response. Please try again.";

    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("Coach chat error:", err);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
