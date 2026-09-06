import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createClient, type RedisClientType } from "redis";
import type { AccessTokenIdentity } from "./access-token.js";
import { verifyAccessTokenIdentity } from "./access-token.js";
import {
  getCorsOrigins,
  isProduction,
  requiredEnv,
  requiredEnvironmentSpecificEnv,
  requiredProductionUrl,
} from "./config.js";
import { buildRefreshTokenRequest } from "./refresh-token.js";
import { logSecurityEvent } from "../utils/security-audit.js";
import {
  deriveRefreshTokenRotation,
  rotateSessionRecord,
  shouldRequireReauthentication,
  shouldRotateSession,
} from "./session-rotation.js";
import { readFileSync } from "node:fs";

export const SESSION_COOKIE = "__Host-sanny_session";
export const STATE_COOKIE = "__Host-sanny_auth_state";
export const CSRF_COOKIE = "__Host-sanny_csrf";
const sessionTtlMs = 8 * 60 * 60 * 1000;
const sessionIdleTtlMs = 30 * 60 * 1000;
const stateTtlSeconds = 10 * 60;
const maxOutstandingLoginStates = 4;
const refreshLockTtlMs = 10_000;
export const pendingAccountLinkTtlMs = 10 * 60 * 1000;

type Session = {
  identity: AccessTokenIdentity;
  csrfToken: string;
  createdAt: number;
  lastTouchedAt: number;
  authenticatedAt: number;
  mfaAuthenticatedAt?: number | undefined;
  refreshToken?: string | undefined;
  previousRefreshTokens?: string[] | undefined;
  expiresAt?: number | undefined;
};
export type LoginState = { codeVerifier: string; returnTo?: string };
export type AccountLinkProofState = {
  codeVerifier: string;
  continuationState: string;
  primaryUserId: string;
  secondaryUserId: string;
  temporaryUserId?: string;
};
let redis: RedisClientType | null = null;

function getRedis() {
  if (!redis) throw new Error("Session store has not been initialized");
  return redis;
}

export function getSessionStoreClient() {
  return getRedis();
}

export async function getSessionSubject(sessionId: string) {
  const raw = await getRedis().get(sessionKey(sessionId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    return session.identity?.sub ?? null;
  } catch {
    return null;
  }
}

export async function initializeSessionStore() {
  if (redis) return;
    const redisUrl = `rediss://:${requiredEnv("REDIS_PASSWORD")}@redis:6379`
    const client = createClient({
    url: redisUrl,
    socket: {
      tls: true,
      ca: readFileSync("/app/redis-ca.crt")
    },
  });
  client.on("error", (error: Error) =>
    console.error("Redis session store error", error),
  );
  await client.connect();
  redis = client;
}

export async function closeSessionStore() {
  if (redis) await redis.quit();
  redis = null;
}

function sessionKey(sessionId: string) {
  return `sanny:session:${sessionId}`;
}

function stateKey(state: string) {
  return `sanny:oauth-state:${state}`;
}

function accountLinkProofStateKey(state: string) {
  return `sanny:account-link-proof:${state}`;
}

const pendingAccountLinkKey = "sanny:pending-account-links";

function pendingAccountLinkRecordKey(
  primaryUserId: string,
  secondaryUserId: string,
) {
  return `sanny:pending-account-link:${primaryUserId}:${secondaryUserId}`;
}

export type PendingAccountLink = {
  primaryUserId: string;
  secondaryUserId: string;
  temporaryUserId: string;
};

export async function schedulePendingAccountLink(
  link: PendingAccountLink,
  ttlMs = pendingAccountLinkTtlMs,
) {
  const key = pendingAccountLinkRecordKey(
    link.primaryUserId,
    link.secondaryUserId,
  );
  const expiresAt = Date.now() + ttlMs;
  await getRedis()
    .multi()
    .set(key, JSON.stringify(link), { PX: ttlMs * 2 })
    .zAdd(pendingAccountLinkKey, { score: expiresAt, value: key })
    .exec();
}

export async function cancelPendingAccountLink(
  primaryUserId: string,
  secondaryUserId: string,
) {
  const key = pendingAccountLinkRecordKey(primaryUserId, secondaryUserId);
  await getRedis().multi().del(key).zRem(pendingAccountLinkKey, key).exec();
}

export async function claimExpiredPendingAccountLinks(now = Date.now()) {
  const keys = await getRedis().zRangeByScore(pendingAccountLinkKey, 0, now);
  const links: PendingAccountLink[] = [];
  for (const key of keys) {
    const transaction = await getRedis()
      .multi()
      .zRem(pendingAccountLinkKey, key)
      .get(key)
      .del(key)
      .execTyped();
    if (transaction?.[0] !== 1 || typeof transaction[1] !== "string") continue;
    try {
      links.push(JSON.parse(transaction[1]) as PendingAccountLink);
    } catch {
      // The record was invalid and has been removed from the cleanup queue.
    }
  }
  return links;
}

export async function createSession(
  identity: AccessTokenIdentity,
  refreshToken?: string,
  mfaAuthenticated = false,
) {
  const sessionId = randomUUID();
  const csrfToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session: Session = {
    identity,
    csrfToken,
    createdAt: now,
    lastTouchedAt: now,
    authenticatedAt: now,
    mfaAuthenticatedAt: mfaAuthenticated ? now : undefined,
    refreshToken: refreshToken ?? undefined,
    previousRefreshTokens: [],
    expiresAt: refreshToken ? now + 60 * 60 * 1000 : undefined,
  };
  await getRedis().set(sessionKey(sessionId), JSON.stringify(session), {
    PX: sessionTtlMs,
  });
  return { sessionId, csrfToken };
}

export async function getSession(
  request: FastifyRequest,
  reply?: FastifyReply,
) {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (!sessionId) return null;
  const raw = await getRedis().get(sessionKey(sessionId));
  if (!raw) return null;

  let session: Session;
  try {
    session = JSON.parse(raw) as Session;
  } catch {
    await getRedis().del(sessionKey(sessionId));
    return null;
  }
  const now = Date.now();
  const remainingAbsoluteTtl = session.createdAt + sessionTtlMs - now;
  const nextTtl = Math.min(sessionIdleTtlMs, remainingAbsoluteTtl);

  if (nextTtl <= 0) {
    await getRedis().del(sessionKey(sessionId));
    return null;
  }

  const sessionRecord = { ...session, lastTouchedAt: now };
  const shouldRotate = shouldRotateSession({
    createdAt: session.createdAt,
    lastTouchedAt: session.lastTouchedAt ?? session.createdAt,
  });

  if (shouldRotate) {
    const rotated = rotateSessionRecord(
      {
        sessionId,
        identity: session.identity,
        csrfToken: session.csrfToken,
        createdAt: session.createdAt,
        lastTouchedAt: session.lastTouchedAt ?? session.createdAt,
      },
      now,
    );

    const rotatedSession: Session = {
      ...session,
      ...rotated,
      lastTouchedAt: now,
      authenticatedAt: session.authenticatedAt ?? rotated.createdAt,
      mfaAuthenticatedAt: session.mfaAuthenticatedAt,
    };

    await getRedis()
      .multi()
      .set(sessionKey(rotated.sessionId), JSON.stringify(rotatedSession), {
        PX: sessionTtlMs,
      })
      .del(sessionKey(sessionId))
      .exec();
    if (reply) setSessionCookies(reply, rotated.sessionId, rotated.csrfToken);

    return { sessionId: rotated.sessionId, ...rotatedSession };
  }

  await getRedis().set(sessionKey(sessionId), JSON.stringify(sessionRecord), {
    PX: sessionTtlMs,
  });
  return { sessionId, ...sessionRecord };
}

export async function destroySession(request: FastifyRequest) {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (sessionId) await getRedis().del(sessionKey(sessionId));
}

export function setSessionCookies(
  reply: FastifyReply,
  sessionId: string,
  csrfToken: string,
) {
  const options = {
    secure: true,
    sameSite: "none" as const,
    path: "/",
  };
  reply.setCookie(SESSION_COOKIE, sessionId, { ...options, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, csrfToken, { ...options, httpOnly: false });
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    secure: true,
    sameSite: "none",
  });
  reply.clearCookie(CSRF_COOKIE, { path: "/", secure: true, sameSite: "none" });
}

export function getLoginStates(request: FastifyRequest) {
  const value = request.cookies[STATE_COOKIE];
  if (!value) return [];
  return value.split(".").filter(Boolean).slice(-maxOutstandingLoginStates);
}

export function setLoginStates(reply: FastifyReply, states: string[]) {
  const value = states.slice(-maxOutstandingLoginStates).join(".");
  if (!value) {
    reply.clearCookie(STATE_COOKIE, { path: "/", secure: true });
    return;
  }
  reply.setCookie(STATE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export async function refreshSessionIdentity(
  sessionId: string,
  refreshToken: string,
) {
  const domain = requiredEnv("AUTH0_DOMAIN");
  const lockToken = randomUUID();
  const lockKey = `${sessionKey(sessionId)}:refresh-lock`;
  const lockAcquired = await getRedis().set(lockKey, lockToken, {
    NX: true,
    PX: refreshLockTtlMs,
  });
  if (!lockAcquired) {
    throw new Error("Session refresh is already in progress");
  }

  try {
    const stored = await getRedis().get(sessionKey(sessionId));
    if (!stored) return null;

    let session: Session;
    try {
      session = JSON.parse(stored) as Session;
    } catch {
      await getRedis().del(sessionKey(sessionId));
      return null;
    }
    const activeRefreshToken = session.refreshToken ?? refreshToken;
    const previousRefreshTokens = session.previousRefreshTokens ?? [];
    const rotationDecision = deriveRefreshTokenRotation({
      activeRefreshToken,
      previousRefreshTokens,
      nextRefreshToken: refreshToken,
    });

    if (!rotationDecision.allowed) {
      await getRedis().del(sessionKey(sessionId));
      logSecurityEvent("refresh_token_replay_detected", {
        sessionId,
        reason: rotationDecision.reason,
        refreshTokenPresent: Boolean(refreshToken),
      });
      throw new Error("Refresh token replay detected");
    }

    const getCallbackURL = () => {
      return isProduction()
        ? requiredProductionUrl("AUTH0_CALLBACK_URL")
        : requiredEnvironmentSpecificEnv("AUTH0_CALLBACK_URL");
    };

    const response = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildRefreshTokenRequest({
          clientId: requiredEnv("AUTH0_CLIENT_ID"),
          clientSecret: requiredEnv("AUTH0_CLIENT_SECRET"),
          refreshToken,
          audience: requiredEnv("AUTH0_AUDIENCE"),
          callbackUrl: getCallbackURL(),
        }),
      ),
    });

    if (!response.ok) {
      throw new Error(`Auth0 refresh failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token) {
      throw new Error("Auth0 did not return a refreshed access token");
    }

    const identity = await verifyAccessTokenIdentity(payload.access_token);
    const nextRefreshToken =
      payload.refresh_token ?? session.refreshToken ?? refreshToken;
    const nextSession: Session = {
      ...session,
      identity,
      refreshToken: nextRefreshToken,
      previousRefreshTokens: payload.refresh_token
        ? rotationDecision.previousRefreshTokens
        : previousRefreshTokens,
      expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
      lastTouchedAt: Date.now(),
      authenticatedAt: session.authenticatedAt ?? Date.now(),
      mfaAuthenticatedAt: session.mfaAuthenticatedAt,
    };

    await getRedis().set(sessionKey(sessionId), JSON.stringify(nextSession), {
      PX: sessionTtlMs,
    });
    return { identity, session: nextSession };
  } finally {
    const releaseScript =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await getRedis().eval(releaseScript, {
      keys: [lockKey],
      arguments: [lockToken],
    });
  }
}

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const session = await getSession(request, reply);
  if (!session) {
    logSecurityEvent("session_unauthorized", {
      reason: "No valid session cookie",
      method: request.method,
      path: request.url,
    });
    return reply.code(401).send({ error: "Unauthorized" });
  }

  if (
    session.expiresAt &&
    Date.now() >= session.expiresAt &&
    session.refreshToken
  ) {
    try {
      const refreshed = await refreshSessionIdentity(
        session.sessionId,
        session.refreshToken,
      );
      if (refreshed) {
        request.sannySession = refreshed.identity;
        request.sannySessionRecord = {
          sessionId: session.sessionId,
          ...refreshed.session,
        };
        return;
      }
    } catch (error) {
      logSecurityEvent("session_refresh_failed", {
        reason: error instanceof Error ? error.message : "Refresh failed",
        sessionId: session.sessionId,
      });
    }
    return reply
      .code(401)
      .send({ error: "Unauthorized", message: "Session expired" });
  }

  request.sannySession = session.identity;
  request.sannySessionRecord = session;
  return;
}

export function requireRecentAuthentication(maxAgeMs = 15 * 60 * 1000) {
  return async function recentAuthenticationGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const session = request.sannySessionRecord ?? (await getSession(request));
    if (!session) {
      return reply
        .code(401)
        .send({ error: "Unauthorized", message: "Session required" });
    }

    if (
      shouldRequireReauthentication(
        session.authenticatedAt ?? session.createdAt,
        Date.now(),
        maxAgeMs,
      )
    ) {
      logSecurityEvent("reauthentication_required", {
        sessionId: session.sessionId,
        maxAgeMs,
        authenticatedAt: session.authenticatedAt ?? session.createdAt,
      });
      return reply
        .code(401)
        .send({ error: "Unauthorized", message: "Reauthentication required" });
    }

    return;
  };
}

export function requireMfaAuthentication(maxAgeMs = 15 * 60 * 1000) {
  return async function mfaAuthenticationGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const session = request.sannySessionRecord ?? (await getSession(request));
    const mfaAuthenticatedAt = session?.mfaAuthenticatedAt;
    if (
      !session ||
      !mfaAuthenticatedAt ||
      Date.now() - mfaAuthenticatedAt >= maxAgeMs
    ) {
      logSecurityEvent("mfa_authentication_required", {
        sessionId: session?.sessionId,
        maxAgeMs,
        mfaAuthenticatedAt: mfaAuthenticatedAt ?? null,
      });
      return reply.code(401).send({
        error: "Unauthorized",
        message: "MFA authentication required",
      });
    }
  };
}

export async function createLoginState(
  codeVerifier: string,
  returnTo?: string,
) {
  const state = randomBytes(32).toString("base64url");
  await getRedis().set(
    stateKey(state),
    JSON.stringify({
      codeVerifier,
      ...(returnTo ? { returnTo } : {}),
    } satisfies LoginState),
    { EX: stateTtlSeconds },
  );
  return state;
}

export async function consumeLoginState(state: string) {
  const key = stateKey(state);
  const raw = await getRedis().getDel(key);
  if (!raw) return null;
  return JSON.parse(raw) as LoginState;
}

export async function createAccountLinkProofState(
  input: AccountLinkProofState,
) {
  const state = randomBytes(32).toString("base64url");
  await getRedis().set(accountLinkProofStateKey(state), JSON.stringify(input), {
    EX: stateTtlSeconds,
  });
  return state;
}

export async function consumeAccountLinkProofState(state: string) {
  const raw = await getRedis().getDel(accountLinkProofStateKey(state));
  if (!raw) return null;
  return JSON.parse(raw) as AccountLinkProofState;
}

export async function requireCsrf(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.cookies[SESSION_COOKIE]) return;

  const method = request.method;
  const path = request.url;
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") {
    logSecurityEvent("csrf_rejected", {
      method,
      path,
      reason: "Cross-site request blocked",
      fetchSite,
    });
    return reply
      .code(403)
      .send({ error: "Forbidden", message: "Cross-site request blocked" });
  }

  const trustedOrigins = getCorsOrigins();
  const origin = request.headers.origin;
  if (origin && !trustedOrigins.includes(origin)) {
    logSecurityEvent("csrf_rejected", {
      method,
      path,
      reason: "Request origin is not trusted",
      origin,
    });
    return reply
      .code(403)
      .send({ error: "Forbidden", message: "Request origin is not trusted" });
  }

  if (!origin) {
    const referer = request.headers.referer;
    if (referer) {
      try {
        if (!trustedOrigins.includes(new URL(referer).origin)) {
          logSecurityEvent("csrf_rejected", {
            method,
            path,
            reason: "Request referer is not trusted",
            referer,
          });
          return reply.code(403).send({
            error: "Forbidden",
            message: "Request referer is not trusted",
          });
        }
      } catch {
        logSecurityEvent("csrf_rejected", {
          method,
          path,
          reason: "Request referer is invalid",
          referer,
        });
        return reply
          .code(403)
          .send({ error: "Forbidden", message: "Request referer is invalid" });
      }
    }
  }

  const session = await getSession(request);
  if (!session || request.headers["x-csrf-token"] !== session.csrfToken) {
    logSecurityEvent("csrf_rejected", {
      method,
      path,
      reason: "Invalid CSRF token",
    });
    return reply
      .code(403)
      .send({ error: "Forbidden", message: "Invalid CSRF token" });
  }
}

declare module "fastify" {
  interface FastifyRequest {
    sannySession?: AccessTokenIdentity;
    sannySessionRecord?: Session & { sessionId: string };
  }
}

export async function destroySessionsForSubject(auth0Sub: string) {
  const matchingKeys: string[] = [];
  for await (const key of getRedis().scanIterator({
    MATCH: "sanny:session:*",
    COUNT: 100,
  })) {
    const sessionKeyValue = Array.isArray(key) ? key[0] : key;
    if (!sessionKeyValue) continue;
    const raw = await getRedis().get(sessionKeyValue);
    if (!raw) continue;

    try {
      const session = JSON.parse(raw) as Session;
      if (session.identity?.sub === auth0Sub)
        matchingKeys.push(sessionKeyValue);
    } catch {
      matchingKeys.push(sessionKeyValue);
    }
  }

  if (matchingKeys.length > 0) {
    const transaction = getRedis().multi();
    for (const key of matchingKeys) transaction.del(key);
    await transaction.exec();
  }
}
