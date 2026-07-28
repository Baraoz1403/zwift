/**
 * lib/whatsapp.ts — Twilio WhatsApp sender
 *
 * Sends WhatsApp messages via Twilio's WhatsApp API.
 * Requires three env vars:
 *   TWILIO_ACCOUNT_SID   — from Twilio Console
 *   TWILIO_AUTH_TOKEN    — from Twilio Console
 *   TWILIO_WHATSAPP_FROM — your approved WhatsApp sender, e.g. "whatsapp:+14155238886"
 *                          (Twilio sandbox number during development)
 *
 * SETUP:
 * 1. Create a free Twilio account at twilio.com
 * 2. In Twilio Console → Messaging → Try it out → Send a WhatsApp message
 *    - Join the sandbox by sending "join <word>" to +1-415-523-8886
 * 3. Set TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886"
 * 4. Once ready for production: apply for a WhatsApp Business number in Twilio
 *
 * No npm package needed — pure fetch to the Twilio REST API.
 */

const TWILIO_API = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

export interface SendWhatsAppResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/**
 * Send a WhatsApp message to a single recipient.
 *
 * @param to   E.164 phone number, e.g. "+972501234567"
 * @param body Message text (max 1600 chars for WhatsApp)
 */
export async function sendWhatsApp(to: string, body: string): Promise<SendWhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !from) {
    // Gracefully degrade: log locally but don't crash the webhook handler
    console.warn("[whatsapp] Twilio env vars not configured — message not sent.");
    return { ok: false, error: "Twilio not configured" };
  }

  const toWA = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const params = new URLSearchParams({ To: toWA, From: from, Body: body });

  try {
    const res = await fetch(TWILIO_API(accountSid), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data.message as string) ?? `HTTP ${res.status}`;
      console.error("[whatsapp] Twilio error:", msg);
      return { ok: false, error: msg };
    }

    return { ok: true, sid: data.sid as string };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp] Network error:", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Build the post-workout feedback message sent to the athlete's WhatsApp
 * right after Intervals.icu detects a completed activity.
 */
export function buildFeedbackMessage(params: {
  firstName: string | null;
  workoutTitle: string;
  durationMin: number;
  avgHr: number | null;
  baseUrl: string;
}): string {
  const { firstName, workoutTitle, durationMin, avgHr, baseUrl } = params;
  const name = firstName ?? "Athlete";
  const dur  = durationMin > 0 ? `${durationMin} min` : "";
  const hr   = avgHr && avgHr > 0 ? ` · avg HR ${Math.round(avgHr)} bpm` : "";
  const link = `${baseUrl}/m/today`;

  return [
    `✅ *${name}, great work!*`,
    ``,
    `*${workoutTitle}* ${dur}${hr}`,
    ``,
    `How hard was it? Rate 1–5 (1 = Easy, 5 = Max) so your coach can personalise next week:`,
    link,
  ].join("\n");
}
