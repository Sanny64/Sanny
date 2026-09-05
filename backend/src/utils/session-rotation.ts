import { randomUUID } from "node:crypto";

export type SessionLifetimeInfo = {
  createdAt: number;
  lastTouchedAt: number;
};

export type SessionRecord = SessionLifetimeInfo & {
  sessionId: string;
  identity: {
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    roles: string[];
    permissions: string[];
    audiences: string[];
  };
  csrfToken: string;
  authenticatedAt?: number;
  refreshToken?: string;
  previousRefreshTokens?: string[];
  expiresAt?: number;
};

export type RefreshTokenRotationDecision = {
  allowed: boolean;
  reason?: "refresh-token-replay" | "refresh-token-accepted";
  previousRefreshTokens: string[];
};

const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_ROTATION_WINDOW_MS = SESSION_IDLE_TTL_MS / 2;
const SESSION_REAUTH_TTL_MS = 15 * 60 * 1000;
const MAX_PREVIOUS_REFRESH_TOKENS = 4;

export function shouldRotateSession(session: SessionLifetimeInfo): boolean {
  const ageSinceLastTouch = Date.now() - session.lastTouchedAt;
  return ageSinceLastTouch >= SESSION_ROTATION_WINDOW_MS;
}

export function shouldRequireReauthentication(
  authenticatedAt: number,
  now = Date.now(),
  ttlMs = SESSION_REAUTH_TTL_MS,
): boolean {
  return now - authenticatedAt >= ttlMs;
}

export function deriveRefreshTokenRotation({
  activeRefreshToken,
  previousRefreshTokens,
  nextRefreshToken,
}: {
  activeRefreshToken: string;
  previousRefreshTokens: string[];
  nextRefreshToken: string;
}): RefreshTokenRotationDecision {
  const seenTokens = new Set(
    previousRefreshTokens.map((token) => token.trim()).filter(Boolean),
  );

  if (
    nextRefreshToken === activeRefreshToken ||
    seenTokens.has(nextRefreshToken)
  ) {
    return {
      allowed: false,
      reason: "refresh-token-replay",
      previousRefreshTokens,
    };
  }

  return {
    allowed: true,
    reason: "refresh-token-accepted",
    previousRefreshTokens: [...previousRefreshTokens, activeRefreshToken]
      .filter(
        (token, index, tokens) => token && tokens.indexOf(token) === index,
      )
      .slice(-MAX_PREVIOUS_REFRESH_TOKENS),
  };
}

export function rotateSessionRecord(
  session: SessionRecord,
  now = Date.now(),
): SessionRecord {
  return {
    ...session,
    sessionId: randomUUID(),
    createdAt: now,
    lastTouchedAt: now,
    authenticatedAt: session.authenticatedAt ?? now,
  };
}

export {
  SESSION_IDLE_TTL_MS,
  SESSION_ROTATION_WINDOW_MS,
  SESSION_REAUTH_TTL_MS,
};
