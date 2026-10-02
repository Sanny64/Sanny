import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getSession, getSessionStoreClient } from "./session.js";
import { logSecurityEvent } from "./security-audit.js";

/**
 * Pending actions let the client restore an in-progress form after the user was
 * sent away to re-authenticate with their authenticator app.
 *
 * The record is keyed by an opaque token and bound to the Auth0 subject, not to
 * the session id: logging in again creates a *new* session, so a session-bound
 * token would be worthless exactly when it is needed.
 */

export const pendingActionTtlMs = 15 * 60 * 1000;
const maxSerializedActionBytes = 16 * 1024;
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export type PendingAction = {
  auth0Sub: string;
  method: string;
  path: string;
  routePath?: string | undefined;
  params: Record<string, unknown>;
  body: unknown;
  createdAt: number;
};

/**
 * Keys that must never be persisted, even briefly. The guard can be attached to
 * any route, so this list is about future routes as much as current ones.
 */
const sensitiveKeys = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "passwordconfirmation",
  "secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "code",
  "otp",
  "mfacode",
  "verificationcode",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;

  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => sanitize(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (sensitiveKeys.has(key.toLowerCase())) continue;
      result[key] = sanitize(entry, depth + 1); // AIKAIDO
    }
    return result;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

function pendingActionKey(token: string) {
  return `sanny:pending-action:${token}`;
}

/**
 * Captures the rejected request so the client can rebuild its form afterwards.
 * Returns the token, or null when the payload is too large to be worth storing
 * (the request is still rejected either way).
 */
export async function createPendingAction(
  request: FastifyRequest,
  auth0Sub: string,
): Promise<string | null> {
  const action: PendingAction = {
    auth0Sub,
    method: request.method,
    path: request.url,
    routePath: request.routeOptions?.url ?? undefined,
    params: (sanitize(request.params ?? {}) ?? {}) as Record<string, unknown>,
    body: sanitize(request.body ?? null),
    createdAt: Date.now(),
  };

  const serialized = JSON.stringify(action);
  if (Buffer.byteLength(serialized, "utf8") > maxSerializedActionBytes) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  await getSessionStoreClient().set(pendingActionKey(token), serialized, {
    PX: pendingActionTtlMs,
  });

  return token;
}

/**
 * Single-use read. The record is deleted whether or not the subject matches, so
 * a leaked token cannot be probed repeatedly.
 */
export async function consumePendingAction(
  token: string,
  auth0Sub: string,
): Promise<PendingAction | null> {
  if (!tokenPattern.test(token)) return null;

  const raw = await getSessionStoreClient().getDel(pendingActionKey(token));
  if (!raw) return null;

  let action: PendingAction;
  try {
    action = JSON.parse(raw) as PendingAction;
  } catch {
    return null;
  }

  if (action.auth0Sub !== auth0Sub) {
    logSecurityEvent("pending_action_subject_mismatch", {
      expected: action.auth0Sub,
      actual: auth0Sub,
    });
    return null;
  }

  if (Date.now() - action.createdAt >= pendingActionTtlMs) return null;

  return action;
}

export async function discardPendingAction(token: string) {
  if (!tokenPattern.test(token)) return;
  await getSessionStoreClient().del(pendingActionKey(token));
}

/**
 * Replaces the guard of the same name in session.ts. On rejection it stores the
 * request as a pending action and hands the token back, so the frontend can
 * carry it through the Auth0 round trip via `returnTo`.
 *
 * The 401 message is unchanged because clients match on it.
 */
export function requireMfaAuthentication(maxAgeMs = 15 * 60 * 1000) {
  return async function mfaAuthenticationGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const session = request.sannySessionRecord ?? (await getSession(request));
    const mfaAuthenticatedAt = session?.mfaAuthenticatedAt;

    if (
      session &&
      mfaAuthenticatedAt &&
      Date.now() - mfaAuthenticatedAt < maxAgeMs
    ) {
      return;
    }

    let resumeToken: string | null = null;
    const auth0Sub = session?.identity?.sub;
    if (auth0Sub) {
      try {
        resumeToken = await createPendingAction(request, auth0Sub);
      } catch (error) {
        // Losing the draft is annoying; failing the rejection would be worse.
        logSecurityEvent("pending_action_store_failed", {
          sessionId: session?.sessionId,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logSecurityEvent("mfa_authentication_required", {
      sessionId: session?.sessionId,
      maxAgeMs,
      mfaAuthenticatedAt: mfaAuthenticatedAt ?? null,
      resumable: Boolean(resumeToken),
    });

    return reply.code(401).send({
      error: "Unauthorized",
      message: "MFA authentication required",
      mfaRequired: true,
      ...(resumeToken ? { resumeToken } : {}),
    });
  };
}
