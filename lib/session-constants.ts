/**
 * Pure constants/types shared between lib/session.ts (Node.js runtime,
 * does real crypto) and middleware.ts (Edge runtime, just checks cookie
 * presence). This file must stay free of any Node-only imports (like
 * "node:crypto" or "jose") - if it pulls those in, Next.js's Edge bundler
 * fails with "UnhandledSchemeError: Reading from node:crypto" because the
 * Edge runtime doesn't support Node's crypto module.
 */

export const SESSION_COOKIE_NAME = "zwift_session";

export interface SessionPayload {
  accessToken: string;
  refreshToken?: string;
  athleteId?: string; // real Zwift player id (from profile.id), used for future per-rider calls
  expiresAt: number; // epoch ms when the Zwift access token itself expires
  // TrainingPeaks connection (optional — added when user connects TP)
  tpToken?: string;       // Production_tpAuth cookie value used as Bearer
  tpAthleteId?: string;   // TP athlete/user id
}
