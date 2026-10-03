import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getSession, getSessionStoreClient } from "./session.js";
import { logSecurityEvent } from "./security-audit.js";

/**
 * Pending actions let the client resume a user operation after step-up
 * authentication redirects through Auth0.
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
  authFactor: "mfa" | "email";
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
  "emailotp",
  "emailcode",
  "mfacode",
  "authenticatorcode",
  "verificationcode",
]);

const unsafeObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export function sanitizePendingActionValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;

  if (Array.isArray(value)) {
    return value
      .slice(0, 200)
      .map((entry) => sanitizePendingActionValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalizedKey = key.toLowerCase();
      if (
        sensitiveKeys.has(normalizedKey) ||
        unsafeObjectKeys.has(normalizedKey)
      ) {
        continue;
      }
      Object.defineProperty(result, key, {
        value: sanitizePendingActionValue(entry, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
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
 * Captures the rejected request so the client can replay it after step-up auth.
 * Returns the token, or null when the payload is too large to be worth storing
 * (the request is still rejected either way).
 */
export async function createPendingAction(
  request: FastifyRequest,
  auth0Sub: string,
  authFactor: PendingAction["authFactor"],
): Promise<string | null> {
  const action: PendingAction = {
    auth0Sub,
    authFactor,
    method: request.method,
    path: request.url,
    routePath: request.routeOptions?.url ?? undefined,
    params: (sanitizePendingActionValue(request.params ?? {}) ?? {}) as Record<
      string,
      unknown
    >,
    body: sanitizePendingActionValue(request.body ?? null),
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

  if (
    !action ||
    typeof action !== "object" ||
    typeof action.auth0Sub !== "string" ||
    (action.authFactor !== "mfa" && action.authFactor !== "email") ||
    typeof action.method !== "string" ||
    !["GET", "PATCH", "POST", "DELETE"].includes(action.method) ||
    typeof action.path !== "string" ||
    !action.path.startsWith("/api/v001/users/") ||
    typeof action.createdAt !== "number" ||
    !Number.isFinite(action.createdAt) ||
    action.createdAt > Date.now()
  ) {
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

function requireFactorAuthentication(
  factor: "mfa" | "email",
  maxAgeMs: number,
) {
  return async function factorAuthenticationGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const session = request.sannySessionRecord ?? (await getSession(request));
    const authenticatedAt =
      factor === "email"
        ? session?.emailMfaAuthenticatedAt
        : session?.mfaAuthenticatedAt;

    const authenticationAge = authenticatedAt
      ? Date.now() - authenticatedAt
      : Number.POSITIVE_INFINITY;
    if (session && authenticationAge >= 0 && authenticationAge < maxAgeMs) {
      return;
    }

    let resumeToken: string | null = null;
    const auth0Sub = session?.identity?.sub;
    if (auth0Sub) {
      try {
        resumeToken = await createPendingAction(request, auth0Sub, factor);
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
      factor,
      authenticatedAt: authenticatedAt ?? null,
      resumable: Boolean(resumeToken),
    });

    return reply.code(401).send({
      error: "Unauthorized",
      message:
        factor === "email"
          ? "Email OTP authentication required"
          : "MFA authentication required",
      ...(factor === "email"
        ? { emailOtpRequired: true }
        : { mfaRequired: true }),
      ...(resumeToken ? { resumeToken } : {}),
    });
  };
}

export function requireMfaAuthentication(maxAgeMs = pendingActionTtlMs) {
  return requireFactorAuthentication("mfa", maxAgeMs);
}

export function requireEmailMfaAuthentication(maxAgeMs = pendingActionTtlMs) {
  return requireFactorAuthentication("email", maxAgeMs);
}
