/**
 * lib/kv.ts — Thin wrapper around Vercel KV REST API.
 *
 * Used for cross-device connection persistence: when a rider connects
 * Intervals.icu or TrainingPeaks on one device, the credentials are
 * mirrored here (keyed by Zwift athlete ID) so any other device gets
 * them back automatically on the next login.
 *
 * Gracefully no-ops when KV_REST_API_URL / KV_REST_API_TOKEN are not set,
 * so the app works normally without KV configured — connections just won't
 * persist cross-device until the store is created in the Vercel dashboard.
 *
 * Setup (one-time):
 *   Vercel dashboard → project → Storage tab → "Create Database" → KV
 *   Vercel auto-adds KV_REST_API_URL and KV_REST_API_TOKEN to env vars.
 *   For local dev, copy them from Vercel to .env.local.
 */

const BASE = process.env.KV_REST_API_URL?.replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN;

/** Returns false when KV isn't configured — all operations become silent no-ops. */
export function kvAvailable(): boolean {
  return Boolean(BASE && TOKEN);
}

/**
 * Execute a single Redis command against the Vercel KV REST endpoint.
 * Returns the result value, or null on any error / missing config.
 */
async function kvCmd<T = unknown>(...args: (string | number)[]): Promise<T | null> {
  if (!BASE || !TOKEN) return null;
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      // Don't cache — we always want the latest value
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { result: T };
    return data.result ?? null;
  } catch {
    return null;
  }
}

/** Get a string value by key. Returns null if missing or KV unavailable. */
export async function kvGet(key: string): Promise<string | null> {
  return kvCmd<string>("GET", key);
}

/** Set a string value, optionally with a TTL in seconds. */
export async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  if (ttlSeconds != null) {
    await kvCmd("SET", key, value, "EX", ttlSeconds);
  } else {
    await kvCmd("SET", key, value);
  }
}

/** Set a key only if it does not already exist (NX). Returns true if the key was set (lock acquired). */
export async function kvSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const result = await kvCmd<string>("SET", key, value, "EX", ttlSeconds, "NX");
  return result === "OK";
}

/** Delete one or more keys. */
export async function kvDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await kvCmd("DEL", ...keys);
}
