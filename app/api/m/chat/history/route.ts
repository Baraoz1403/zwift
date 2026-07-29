import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { kvGet } from "@/lib/kv";

/** GET /api/m/chat/history — returns persisted chat messages for this athlete */
export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ messages: [] });
  const session = await decryptSession(raw);
  if (!session?.athleteId) return NextResponse.json({ messages: [] });

  try {
    const stored = await kvGet(`zwift:${session.athleteId}:chat_history`);
    const messages = stored ? JSON.parse(stored) : [];
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}
