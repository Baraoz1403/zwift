import { EncryptJWT, jwtDecrypt } from "jose";
import { createHash } from "node:crypto";
import { SESSION_COOKIE_NAME, SessionPayload } from "./session-constants";

/**
 * Encrypted session cookie helpers.
 *
 * The cookie never contains the user's Zwift email/password - only a
 * short-lived Zwift access token (+ refresh token + athlete id), and the
 * whole payload is encrypted (not just signed) using SESSION_SECRET, so it
 * can't be read even if someone got hold of the raw cookie value.
 *
 * There is no database in this version: the encrypted cookie itself *is*
 * the session store.
 *
 * This file uses Node's real crypto module, so it can only run in the
 * Node.js runtime (route handlers, server components) - never in Next.js
 * middleware, which runs on the Edge runtime and can't bundle "node:crypto".
 * middleware.ts imports SESSION_COOKIE_NAME from ./session-constants
 * directly for that reason - see that file for details.
 */

export { SESSION_COOKIE_NAME };
export type { SessionPayload };

function getKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local before running the app."
    );
  }
  // Derive a fixed-length 256-bit key from whatever secret string is configured.
  return createHash("sha256").update(secret).digest();
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  const key = getKey();
  return await new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("30d") // cookie lifetime; the Zwift token inside may expire sooner
    .encrypt(key);
}

export async function decryptSession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const key = getKey();
    const { payload } = await jwtDecrypt(token, key);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
