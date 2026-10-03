import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { env, execPath } from "node:process";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as sessionRotation from "../utils/session-rotation.js";

import {
  deriveRefreshTokenRotation,
  rotateSessionRecord,
  shouldRotateSession,
} from "../utils/session-rotation.js";
import {
  closeSessionStore,
  claimExpiredPendingAccountLinks,
  cancelPendingAccountLink,
  consumeLoginState,
  createLoginState,
  createSession,
  destroySessionsForSubject,
  getSessionStoreClient,
  initializeSessionStore,
  requireSession,
  schedulePendingAccountLink,
  SESSION_TTL_MS,
} from "../utils/session.js";
import { getTrustProxy } from "../utils/config.js";
import { applyRateLimit } from "../utils/rate-limit.js";
import userRoutes from "../routes/user.route.js";
import prisma from "../utils/prisma.js";

const require = createRequire(import.meta.url);

type SessionModule = {
  initializeSessionStore: () => Promise<void>;
  closeSessionStore: () => Promise<void>;
  createLoginState: (
    codeVerifier: string,
    returnTo?: string,
    emailMfa?: boolean,
    accountLinkRetry?: boolean,
  ) => Promise<string>;
  consumeLoginState: (state: string) => Promise<{
    codeVerifier: string;
    returnTo?: string;
  } | null>;
  getLoginStates: (request: FastifyRequest) => string[];
  setLoginStates: (reply: FastifyReply, states: string[]) => void;
  refreshSessionIdentity: (
    sessionId: string,
    refreshToken: string,
  ) => Promise<unknown>;
  createSession: (...args: unknown[]) => Promise<{
    sessionId: string;
    csrfToken: string;
  }>;
  requireSession: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>;
  requireCsrf: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<unknown>;
};

function runRedisWorker(
  workerScript: string,
  variables: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      execPath,
      ["--import=tsx", "--input-type=module", "-e", workerScript],
      {
        env: { ...env, ...variables },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Redis state consumer exited with code ${code}`));
    });
  });
}

function consumeStateInChildProcess(state: string): Promise<string> {
  const childScript = [
    'import { env } from "node:process";',
    'import { closeSessionStore, consumeLoginState, initializeSessionStore } from "./src/utils/session.ts";',
    "await initializeSessionStore();",
    'const consumed = await consumeLoginState(env.REDIS_TEST_STATE ?? "");',
    'console.log(consumed ? "consumed" : "missing");',
    "await closeSessionStore();",
  ].join("\n");

  return runRedisWorker(childScript, { REDIS_TEST_STATE: state });
}

function rateLimitInChildProcess(
  ip: string,
  requestCount: number,
): Promise<string> {
  const childScript = [
    'import { env } from "node:process";',
    'import { closeSessionStore, initializeSessionStore } from "./src/utils/session.ts";',
    'import { applyRateLimit } from "./src/utils/rate-limit.ts";',
    "await initializeSessionStore();",
    "let allowed = 0;",
    "let blocked = 0;",
    "for (let index = 0; index < Number(env.REDIS_RATE_LIMIT_COUNT); index += 1) {",
    '  const decision = await applyRateLimit({ method: "GET", url: "/api/v001/auth", ip: env.REDIS_RATE_LIMIT_IP ?? "", cookies: {} }, { header: () => undefined });',
    "  if (decision.allowed) allowed += 1; else blocked += 1;",
    "}",
    "console.log(JSON.stringify({ allowed, blocked }));",
    "await closeSessionStore();",
  ].join("\n");

  return runRedisWorker(childScript, {
    REDIS_RATE_LIMIT_IP: ip,
    REDIS_RATE_LIMIT_COUNT: String(requestCount),
  });
}

function refreshSessionInChildProcess(
  sessionId: string,
  refreshToken: string,
  control: { startedKey: string; releaseKey: string; hold: boolean },
): Promise<string> {
  const childScript = [
    'import { env } from "node:process";',
    'import { closeSessionStore, getSessionStoreClient, initializeSessionStore, refreshSessionIdentity } from "./src/utils/session.ts";',
    "await initializeSessionStore();",
    "const redis = getSessionStoreClient();",
    'globalThis.fetch = async () => { if (env.REDIS_REFRESH_HOLD === "true") { await redis.set(env.REDIS_REFRESH_STARTED_KEY ?? "", "ready", { PX: 30000 }); while (!(await redis.get(env.REDIS_REFRESH_RELEASE_KEY ?? ""))) await new Promise(resolve => setTimeout(resolve, 10)); } return new Response("test upstream failure", { status: 401 }); };',
    'try { await refreshSessionIdentity(env.REDIS_REFRESH_SESSION_ID ?? "", env.REDIS_REFRESH_TOKEN ?? ""); console.log("unexpected-success"); } catch (error) { console.log(error instanceof Error ? error.message : "unknown-error"); }',
    "await closeSessionStore();",
  ].join("\n");

  return runRedisWorker(childScript, {
    REDIS_REFRESH_SESSION_ID: sessionId,
    REDIS_REFRESH_TOKEN: refreshToken,
    REDIS_REFRESH_STARTED_KEY: control.startedKey,
    REDIS_REFRESH_RELEASE_KEY: control.releaseKey,
    REDIS_REFRESH_HOLD: String(control.hold),
    NODE_ENV: "development",
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_CLIENT_ID: "integration-client",
    AUTH0_CLIENT_SECRET: "integration-secret",
    AUTH0_AUDIENCE: "https://api.example.test",
    DEV_AUTH0_CALLBACK_URL: "https://api.example.test/api/v001/auth/callback",
  });
}

async function waitForRedisValue(
  redis: ReturnType<typeof getSessionStoreClient>,
  key: string,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await redis.get(key)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "Timed out waiting for the first refresh process to acquire its lock",
  );
}

test("sessions are rotated once they are half-way through the idle window", () => {
  const now = Date.now();

  assert.equal(
    shouldRotateSession({
      createdAt: now - 60_000,
      lastTouchedAt: now - 20 * 60_000,
    }),
    true,
  );

  assert.equal(
    shouldRotateSession({
      createdAt: now - 60_000,
      lastTouchedAt: now - 5 * 60_000,
    }),
    false,
  );
});

test(
  "real Redis atomically rotates sessions and consumes state across processes",
  { skip: env.RUN_REAL_REDIS_TESTS !== "true" },
  async () => {
    await initializeSessionStore();
    const redis = getSessionStoreClient();
    let oldSessionId: string | undefined;
    let rotatedSessionId: string | undefined;
    const cleanupSessionIds: string[] = [];
    const rateLimitIp = "203.0.113.248";
    const rateLimitKey = `sanny:rate-limit:${rateLimitIp}:anonymous:oauth-initiation`;

    try {
      const identity = {
        sub: "auth0|redis-integration-user",
        email: "redis-test@example.test",
        emailVerified: true,
        name: "Redis Integration",
        roles: ["user"],
        permissions: ["read:users"],
        audiences: ["https://api.example.test"],
      };
      const issued = await createSession(identity, undefined, true, true);
      oldSessionId = issued.sessionId;
      const oldKey = `sanny:session:${oldSessionId}`;
      const stored = await redis.get(oldKey);
      assert.ok(stored);
      const session = JSON.parse(stored) as Record<string, unknown>;
      const now = Date.now();
      session.createdAt = now - 25 * 60_000;
      session.lastTouchedAt = now - 20 * 60_000;
      await redis.set(oldKey, JSON.stringify(session), { PX: SESSION_TTL_MS });

      const server = Fastify();
      server.setValidatorCompiler(validatorCompiler);
      server.setSerializerCompiler(serializerCompiler);
      await server.register(cookie);
      server.get(
        "/private",
        { preHandler: [requireSession] },
        async (request) => ({
          sessionId: request.sannySessionRecord?.sessionId,
          csrfToken: request.sannySessionRecord?.csrfToken,
          refreshToken: request.sannySessionRecord?.refreshToken,
          mfaAuthenticatedAt: request.sannySessionRecord?.mfaAuthenticatedAt,
          emailMfaAuthenticatedAt:
            request.sannySessionRecord?.emailMfaAuthenticatedAt,
        }),
      );
      await server.register(userRoutes, { prefix: "/api/v001/users" });

      try {
        const response = await server.inject({
          method: "GET",
          url: "/private",
          headers: { cookie: `__Host-sanny_session=${oldSessionId}` },
        });
        assert.equal(response.statusCode, 200);
        const body = response.json<{
          sessionId: string;
          csrfToken: string;
          mfaAuthenticatedAt: number;
          emailMfaAuthenticatedAt: number;
        }>();
        rotatedSessionId = body.sessionId;
        assert.notEqual(rotatedSessionId, oldSessionId);
        assert.equal(body.csrfToken, issued.csrfToken);
        assert.ok(body.mfaAuthenticatedAt);
        assert.ok(body.emailMfaAuthenticatedAt);
        assert.equal(await redis.get(oldKey), null);
        assert.ok(await redis.get(`sanny:session:${rotatedSessionId}`));
        const stateResults = await Promise.all(
          Array.from({ length: 100 }, async (_, index) => {
            const state = await createLoginState(`redis-verifier-${index}`);
            return consumeLoginState(state);
          }),
        );
        assert.equal(stateResults.length, 100);
        assert.ok(stateResults.every((result) => result !== null));

        const sharedState = await createLoginState("cross-process-verifier");
        const consumers = await Promise.all([
          consumeStateInChildProcess(sharedState),
          consumeStateInChildProcess(sharedState),
        ]);
        assert.deepEqual(consumers.sort(), ["consumed", "missing"]);

        const abandonedLink = {
          primaryUserId: "google-oauth2|primary",
          secondaryUserId: "auth0|secondary",
          temporaryUserId: "google-oauth2|temporary-abandoned",
        };
        await schedulePendingAccountLink(abandonedLink, 1500);
        assert.deepEqual(await claimExpiredPendingAccountLinks(Date.now()), []);
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + 2000),
          [abandonedLink],
        );
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + 3000),
          [],
        );

        const confirmedLink = {
          primaryUserId: "auth0|confirmed-primary",
          secondaryUserId: "google-oauth2|confirmed-secondary",
          temporaryUserId: "google-oauth2|temporary-confirmed",
        };
        await schedulePendingAccountLink(confirmedLink, 1500);
        await cancelPendingAccountLink(
          confirmedLink.primaryUserId,
          confirmedLink.secondaryUserId,
        );
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + 2000),
          [],
        );

        const rateLimitWorkers = await Promise.all([
          rateLimitInChildProcess(rateLimitIp, 6),
          rateLimitInChildProcess(rateLimitIp, 6),
        ]);
        const workerCounts = rateLimitWorkers.map(
          (output) =>
            JSON.parse(output) as { allowed: number; blocked: number },
        );
        assert.equal(
          workerCounts.reduce((total, result) => total + result.allowed, 0),
          10,
        );
        assert.equal(
          workerCounts.reduce((total, result) => total + result.blocked, 0),
          2,
        );

        const refreshLockSession = await createSession(
          identity,
          "refresh-lock-token",
          true,
          true,
        );
        cleanupSessionIds.push(refreshLockSession.sessionId);
        const refreshLockKey = `sanny:session:${refreshLockSession.sessionId}`;
        const refreshLockRecord = JSON.parse(
          (await redis.get(refreshLockKey)) ?? "{}",
        ) as Record<string, unknown>;
        refreshLockRecord.expiresAt = Date.now() - 1;
        await redis.set(refreshLockKey, JSON.stringify(refreshLockRecord), {
          PX: SESSION_TTL_MS,
        });

        const refreshStartedKey = "sanny:test:refresh-lock-started";
        const refreshReleaseKey = "sanny:test:refresh-lock-release";
        const heldRefresh = refreshSessionInChildProcess(
          refreshLockSession.sessionId,
          "refresh-lock-token",
          {
            startedKey: refreshStartedKey,
            releaseKey: refreshReleaseKey,
            hold: true,
          },
        );
        let lockWaitError: unknown;
        let competingRefreshResult = "";
        try {
          await waitForRedisValue(redis, refreshStartedKey);
          competingRefreshResult = await refreshSessionInChildProcess(
            refreshLockSession.sessionId,
            "refresh-lock-token",
            {
              startedKey: refreshStartedKey,
              releaseKey: refreshReleaseKey,
              hold: false,
            },
          );
        } catch (error) {
          lockWaitError = error;
        } finally {
          await redis.set(refreshReleaseKey, "release", { PX: 30_000 });
        }
        const heldRefreshResult = await heldRefresh;
        if (lockWaitError) throw lockWaitError;
        assert.equal(
          competingRefreshResult,
          "Session refresh is already in progress",
        );
        assert.equal(heldRefreshResult, "Auth0 refresh failed (401)");
        assert.equal(await redis.get(`${refreshLockKey}:refresh-lock`), null);
        assert.ok(await redis.get(refreshLockKey));
        await redis.del(refreshStartedKey);
        await redis.del(refreshReleaseKey);

        const redisAbandonedLink = {
          primaryUserId: "google-oauth2|redis-primary",
          secondaryUserId: "auth0|redis-secondary",
          temporaryUserId: "google-oauth2|redis-temporary",
        };
        const linkTtlMs = 60_000;
        await schedulePendingAccountLink(redisAbandonedLink, linkTtlMs);
        assert.deepEqual(await claimExpiredPendingAccountLinks(Date.now()), []);
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + linkTtlMs + 1),
          [redisAbandonedLink],
        );
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + linkTtlMs + 2),
          [],
        );

        const redisConfirmedLink = {
          primaryUserId: "auth0|confirmed-primary",
          secondaryUserId: "google-oauth2|confirmed-secondary",
          temporaryUserId: "google-oauth2|confirmed-temporary",
        };
        await schedulePendingAccountLink(redisConfirmedLink, linkTtlMs);
        await cancelPendingAccountLink(
          redisConfirmedLink.primaryUserId,
          redisConfirmedLink.secondaryUserId,
        );
        assert.deepEqual(
          await claimExpiredPendingAccountLinks(Date.now() + linkTtlMs + 1),
          [],
        );

        const matchingSession = await createSession(identity);
        const otherUserSession = await createSession({
          ...identity,
          sub: "auth0|unrelated-session-user",
        });
        cleanupSessionIds.push(
          matchingSession.sessionId,
          otherUserSession.sessionId,
        );
        await destroySessionsForSubject(identity.sub);
        assert.equal(await redis.get(`sanny:session:${body.sessionId}`), null);
        assert.equal(
          await redis.get(`sanny:session:${matchingSession.sessionId}`),
          null,
        );
        assert.ok(
          await redis.get(`sanny:session:${otherUserSession.sessionId}`),
        );

        const adminIdentity = {
          ...identity,
          sub: "auth0|redis-admin",
          roles: ["admin"],
          permissions: ["delete:users"],
        };
        const deletionTargetIdentity = {
          ...identity,
          sub: "auth0|redis-deletion-target",
        };
        const selfDeleteIdentity = {
          ...identity,
          sub: "auth0|redis-self-deletion-target",
          roles: ["user"],
          permissions: ["delete:me"],
        };
        const adminSession = await createSession(
          adminIdentity,
          undefined,
          true,
          true,
        );
        const deletionTargetSession = await createSession(
          deletionTargetIdentity,
        );
        const selfDeleteSession = await createSession(
          selfDeleteIdentity,
          undefined,
          true,
          true,
        );
        cleanupSessionIds.push(
          adminSession.sessionId,
          deletionTargetSession.sessionId,
          selfDeleteSession.sessionId,
        );
        const originalFetch = globalThis.fetch;
        const originalFindUnique = prisma.user.findUnique;
        const originalDeleteMany = prisma.user.deleteMany;
        const previousEnvironment = {
          AUTH0_DOMAIN: env.AUTH0_DOMAIN,
          AUTH0_M2M_CLIENT_ID: env.AUTH0_M2M_CLIENT_ID,
          AUTH0_M2M_CLIENT_SECRET: env.AUTH0_M2M_CLIENT_SECRET,
        };
        Object.assign(process.env, {
          AUTH0_DOMAIN: "tenant.example.test",
          AUTH0_M2M_CLIENT_ID: "integration-client",
          AUTH0_M2M_CLIENT_SECRET: "integration-secret",
        });
        const localDeleteArguments: unknown[] = [];
        let auth0DeleteRequests = 0;
        let failNextLocalDelete = false;
        globalThis.fetch = (async (url: string | URL | Request) => {
          if (String(url).endsWith("/oauth/token")) {
            return Response.json({ access_token: "management-token" });
          }
          auth0DeleteRequests++;
          const status = [204, 204, 404][auth0DeleteRequests - 1] ?? 204;
          return new Response(null, { status });
        }) as typeof fetch;
        prisma.user.findUnique = (async () => ({
          id: 99001,
          auth0Sub: deletionTargetIdentity.sub,
        })) as unknown as typeof prisma.user.findUnique;
        prisma.user.deleteMany = (async (arguments_: unknown) => {
          localDeleteArguments.push(arguments_);
          if (failNextLocalDelete) {
            failNextLocalDelete = false;
            throw new Error("temporary local database failure");
          }
          return { count: 1 };
        }) as unknown as typeof prisma.user.deleteMany;

        try {
          const deleted = await server.inject({
            method: "DELETE",
            url: "/api/v001/users/99001",
            headers: {
              cookie: `__Host-sanny_session=${adminSession.sessionId}`,
            },
          });
          assert.equal(deleted.statusCode, 204);
          assert.deepEqual(localDeleteArguments[0], { where: { id: 99001 } });
          assert.equal(auth0DeleteRequests, 1);
          assert.equal(
            await redis.get(`sanny:session:${deletionTargetSession.sessionId}`),
            null,
          );
          assert.ok(await redis.get(`sanny:session:${adminSession.sessionId}`));

          failNextLocalDelete = true;
          const failedSelfDelete = await server.inject({
            method: "DELETE",
            url: "/api/v001/users/me",
            headers: {
              cookie: `__Host-sanny_session=${selfDeleteSession.sessionId}`,
            },
          });
          assert.equal(failedSelfDelete.statusCode, 500);
          assert.ok(
            await redis.get(`sanny:session:${selfDeleteSession.sessionId}`),
          );

          const selfDeleted = await server.inject({
            method: "DELETE",
            url: "/api/v001/users/me",
            headers: {
              cookie: `__Host-sanny_session=${selfDeleteSession.sessionId}`,
            },
          });
          assert.equal(selfDeleted.statusCode, 204);
          assert.deepEqual(localDeleteArguments[2], {
            where: { auth0Sub: selfDeleteIdentity.sub },
          });
          assert.equal(auth0DeleteRequests, 3);
          assert.equal(
            await redis.get(`sanny:session:${selfDeleteSession.sessionId}`),
            null,
          );
        } finally {
          globalThis.fetch = originalFetch;
          prisma.user.findUnique = originalFindUnique;
          prisma.user.deleteMany = originalDeleteMany;
          for (const [key, value] of Object.entries(previousEnvironment)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }
      } finally {
        await server.close();
      }
    } finally {
      if (oldSessionId) {
        await redis.del(`sanny:session:${oldSessionId}`);
      }
      if (rotatedSessionId) {
        await redis.del(`sanny:session:${rotatedSessionId}`);
      }
      for (const sessionId of cleanupSessionIds) {
        await redis.del(`sanny:session:${sessionId}`);
      }
      await redis.del(rateLimitKey);
      await closeSessionStore();
    }
  },
);

test("rotation keeps the same identity and CSRF token while issuing a new session id", () => {
  const now = Date.now();
  const rotated = rotateSessionRecord(
    {
      sessionId: "old-session-id",
      identity: {
        sub: "user-42",
        email: "user@example.com",
        emailVerified: true,
        name: "User",
        roles: ["user"],
        permissions: ["read:me"],
        audiences: ["https://api.example.com"],
      },
      csrfToken: "csrf-token",
      createdAt: now - 2 * 60_000,
      lastTouchedAt: now - 18 * 60_000,
      refreshToken: "token-current",
      previousRefreshTokens: ["token-previous"],
      expiresAt: now + 60 * 60_000,
    },
    now,
  );

  assert.notEqual(rotated.sessionId, "old-session-id");
  assert.equal(rotated.identity.sub, "user-42");
  assert.equal(rotated.identity.emailVerified, true);
  assert.equal(rotated.csrfToken, "csrf-token");
  assert.equal(rotated.createdAt, now);
  assert.equal(rotated.lastTouchedAt, now);
  assert.equal(rotated.refreshToken, "token-current");
  assert.deepEqual(rotated.previousRefreshTokens, ["token-previous"]);
  assert.equal(rotated.expiresAt, now + 60 * 60_000);
});

test("refresh-token replay is rejected and the newest token is retained", () => {
  const decision = deriveRefreshTokenRotation({
    activeRefreshToken: "token-current",
    previousRefreshTokens: ["token-previous"],
    nextRefreshToken: "token-previous",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "refresh-token-replay");

  const accepted = deriveRefreshTokenRotation({
    activeRefreshToken: "token-current",
    previousRefreshTokens: ["token-previous"],
    nextRefreshToken: "token-next",
  });

  assert.equal(accepted.allowed, true);
  assert.deepEqual(accepted.previousRefreshTokens, [
    "token-previous",
    "token-current",
  ]);

  const bounded = deriveRefreshTokenRotation({
    activeRefreshToken: "token-new",
    previousRefreshTokens: ["token-1", "token-2", "token-3", "token-4"],
    nextRefreshToken: "token-5",
  });
  assert.deepEqual(bounded.previousRefreshTokens, [
    "token-2",
    "token-3",
    "token-4",
    "token-new",
  ]);
});

test("Fastify requireSession replaces the rotated cookie and preserves session credentials", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProdTrustProxy = process.env.PROD_TRUST_PROXY;
  process.env.NODE_ENV = "production";
  process.env.PROD_TRUST_PROXY = "172.28.0.2";
  const source = await readFile(
    new URL("../utils/session.ts", import.meta.url),
    "utf8",
  );
  const records = new Map<string, string>();
  let holdRefreshResponse = false;
  let nextRefreshToken = "refresh-next";
  let signalRefreshStarted: (() => void) | undefined;
  let releaseRefreshResponse: (() => void) | undefined;
  const refreshResponseStarted = new Promise<void>((resolve) => {
    signalRefreshStarted = resolve;
  });
  const refreshResponseGate = new Promise<void>((resolve) => {
    releaseRefreshResponse = resolve;
  });
  const redis = {
    on: () => undefined,
    connect: async () => undefined,
    quit: async () => undefined,
    get: async (key: string) => records.get(key) ?? null,
    getDel: async (key: string) => {
      const value = records.get(key) ?? null;
      records.delete(key);
      return value;
    },
    set: async (key: string, value: string, options?: { NX?: boolean }) => {
      if (options?.NX && records.has(key)) return null;
      records.set(key, value);
      return "OK";
    },
    del: async (key: string) => Number(records.delete(key)),
    eval: async (_script: string, input: { keys: string[] }) =>
      Number(records.delete(input.keys[0] ?? "")),
    multi: () => {
      const actions: Array<() => void> = [];
      const transaction = {
        set: (key: string, value: string) => {
          actions.push(() => records.set(key, value));
          return transaction;
        },
        del: (key: string) => {
          actions.push(() => records.delete(key));
          return transaction;
        },
        exec: async () => {
          for (const action of actions) action();
          return [];
        },
      };
      return transaction;
    },
  };
  const module = { exports: {} as Record<string, unknown> };
  const modules: Record<string, object> = {
    redis: { createClient: () => redis },
    "./config.js": {
      getCorsOrigins: () => ["https://example.de"],
      isProduction: () => false,
      requiredEnv: (name: string) =>
        name === "REDIS_PASSWORD" ? "test-password" : "test-value",
      requiredEnvironmentSpecificEnv: () => "https://app.example.test",
      requiredProductionUrl: () => "https://app.example.test",
    },
    "./access-token.js": {
      verifyAccessTokenIdentity: async () => ({
        sub: "auth0|rotating-user",
        email: "user@example.test",
        emailVerified: true,
        name: "User",
        roles: ["user"],
        permissions: ["read:users"],
        audiences: ["https://api.example.test"],
      }),
    },
    "./refresh-token.js": { buildRefreshTokenRequest: () => ({}) },
    "../utils/security-audit.js": { logSecurityEvent: () => undefined },
    "./session-rotation.js": sessionRotation,
    "node:fs": { readFileSync: () => Buffer.from("test-ca") },
  };

  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: module.exports,
      require: (name: string) => {
        if (modules[name]) return modules[name];
        return require(name);
      },
      Buffer,
      URL,
      URLSearchParams,
      Date,
      Error,
      JSON,
      Math,
      setTimeout,
      clearTimeout,
      fetch: async () => {
        if (holdRefreshResponse) {
          signalRefreshStarted?.();
          await refreshResponseGate;
        }
        return Response.json({
          access_token: "access-next",
          refresh_token: nextRefreshToken,
          expires_in: 3600,
        });
      },
    },
  );

  const sessionModule = module.exports as unknown as SessionModule;
  await sessionModule.initializeSessionStore();

  const identity = {
    sub: "auth0|rotating-user",
    email: "user@example.test",
    emailVerified: true,
    name: "User",
    roles: ["user"],
    permissions: ["read:users"],
    audiences: ["https://api.example.test"],
  };
  const issued = await sessionModule.createSession(
    identity,
    "refresh-current",
    true,
    true,
  );
  const now = Date.now();
  const oldKey = `sanny:session:${issued.sessionId}`;
  const sessionRecord = JSON.parse(records.get(oldKey) ?? "{}") as Record<
    string,
    unknown
  >;
  sessionRecord.createdAt = now - 25 * 60_000;
  sessionRecord.lastTouchedAt = now - 20 * 60_000;
  sessionRecord.previousRefreshTokens = ["refresh-previous"];
  sessionRecord.expiresAt = now + 30 * 60_000;
  records.set(oldKey, JSON.stringify(sessionRecord));

  const server = Fastify({ trustProxy: getTrustProxy() });
  await server.register(cookie);
  server.get(
    "/private",
    { preHandler: [sessionModule.requireSession] },
    async (request) => ({
      sessionId: request.sannySessionRecord?.sessionId,
      sub: request.sannySession?.sub,
      csrfToken: request.sannySessionRecord?.csrfToken,
      refreshToken: request.sannySessionRecord?.refreshToken,
      previousRefreshTokens: request.sannySessionRecord?.previousRefreshTokens,
      mfaAuthenticatedAt: request.sannySessionRecord?.mfaAuthenticatedAt,
      emailMfaAuthenticatedAt:
        request.sannySessionRecord?.emailMfaAuthenticatedAt,
    }),
  );
  server.post(
    "/api/v001/users/me",
    { preHandler: [sessionModule.requireCsrf] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.post(
    "/api/v001/auth/logout",
    { preHandler: [sessionModule.requireCsrf] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.post(
    "/proxy-check",
    { preHandler: [sessionModule.requireCsrf] },
    async (request, reply) =>
      reply.code(200).send({ ip: request.ip, protocol: request.protocol }),
  );

  try {
    const response = await server.inject({
      method: "GET",
      url: "/private",
      headers: { cookie: `__Host-sanny_session=${issued.sessionId}` },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json<{
      sessionId: string;
      sub: string;
      csrfToken: string;
      refreshToken: string;
      previousRefreshTokens: string[];
      mfaAuthenticatedAt: number;
      emailMfaAuthenticatedAt: number;
    }>();
    assert.notEqual(body.sessionId, issued.sessionId);
    assert.equal(body.sub, identity.sub);
    assert.equal(body.csrfToken, issued.csrfToken);
    assert.equal(body.refreshToken, "refresh-current");
    assert.deepEqual(body.previousRefreshTokens, ["refresh-previous"]);
    assert.equal(body.mfaAuthenticatedAt, sessionRecord.mfaAuthenticatedAt);
    assert.equal(
      body.emailMfaAuthenticatedAt,
      sessionRecord.emailMfaAuthenticatedAt,
    );
    assert.equal(records.has(oldKey), false);
    assert.equal(records.has(`sanny:session:${body.sessionId}`), true);

    const setCookies = response.headers["set-cookie"];
    const cookieHeaders = Array.isArray(setCookies) ? setCookies : [setCookies];
    assert.ok(
      cookieHeaders.some((value) =>
        value?.startsWith(`__Host-sanny_session=${body.sessionId};`),
      ),
    );
    assert.ok(
      cookieHeaders.some((value) =>
        value?.startsWith(`__Host-sanny_csrf=${issued.csrfToken};`),
      ),
    );

    const oauthState = await sessionModule.createLoginState(
      "one-time-verifier",
      "/settings",
    );
    const concurrentConsumptions = await Promise.all([
      sessionModule.consumeLoginState(oauthState),
      sessionModule.consumeLoginState(oauthState),
    ]);
    const consumedStates = concurrentConsumptions.filter(
      (state): state is NonNullable<typeof state> => state !== null,
    );
    assert.equal(consumedStates.length, 1);
    assert.equal(consumedStates[0]?.codeVerifier, "one-time-verifier");
    assert.equal(consumedStates[0]?.returnTo, "/settings");

    const highVolumeStates = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        sessionModule.createLoginState(`verifier-${index}`, `/return-${index}`),
      ),
    );
    let stateCookieValue = "";
    sessionModule.setLoginStates(
      {
        setCookie: (name: string, value: string) => {
          assert.equal(name, "__Host-sanny_auth_state");
          stateCookieValue = value;
        },
      } as unknown as FastifyReply,
      highVolumeStates,
    );
    assert.deepEqual(
      [
        ...sessionModule.getLoginStates({
          cookies: { "__Host-sanny_auth_state": stateCookieValue },
        } as unknown as FastifyRequest),
      ],
      highVolumeStates.slice(-4),
    );

    const sessionCookie = `__Host-sanny_session=${body.sessionId}`;
    const csrfHeaders = {
      cookie: sessionCookie,
      "x-csrf-token": issued.csrfToken,
    };
    const missingBrowserMetadata = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      headers: csrfHeaders,
    });
    assert.equal(missingBrowserMetadata.statusCode, 204);

    const trustedProxyRequest = await server.inject({
      method: "POST",
      url: "/proxy-check",
      remoteAddress: "172.28.0.2",
      headers: {
        ...csrfHeaders,
        origin: "https://example.de",
        "x-forwarded-for": "198.51.100.44",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(trustedProxyRequest.statusCode, 200);
    assert.deepEqual(trustedProxyRequest.json(), {
      ip: "198.51.100.44",
      protocol: "https",
    });

    const untrustedPeerRequest = await server.inject({
      method: "POST",
      url: "/proxy-check",
      remoteAddress: "192.0.2.99",
      headers: {
        ...csrfHeaders,
        origin: "https://example.de",
        "x-forwarded-for": "198.51.100.45",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(untrustedPeerRequest.statusCode, 200);
    assert.deepEqual(untrustedPeerRequest.json(), {
      ip: "192.0.2.99",
      protocol: "http",
    });

    const missingCsrfToken = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      headers: { cookie: sessionCookie },
    });
    assert.equal(missingCsrfToken.statusCode, 403);
    assert.deepEqual(missingCsrfToken.json(), {
      error: "Forbidden",
      message: "Invalid CSRF token",
    });

    const crossSiteLogout = await server.inject({
      method: "POST",
      url: "/api/v001/auth/logout",
      headers: {
        ...csrfHeaders,
        origin: "https://example.de",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.equal(crossSiteLogout.statusCode, 204);

    const storedRotatedSession = JSON.parse(
      records.get(`sanny:session:${body.sessionId}`) ?? "{}",
    ) as Record<string, unknown>;
    storedRotatedSession.expiresAt = Date.now() - 1;
    records.set(
      `sanny:session:${body.sessionId}`,
      JSON.stringify(storedRotatedSession),
    );

    const refreshed = await server.inject({
      method: "GET",
      url: "/private",
      headers: { cookie: sessionCookie },
    });
    assert.equal(refreshed.statusCode, 200);
    const refreshedBody = refreshed.json<{
      sessionId: string;
      sub: string;
      csrfToken: string;
      refreshToken: string;
      previousRefreshTokens: string[];
      mfaAuthenticatedAt: number;
      emailMfaAuthenticatedAt: number;
    }>();
    assert.equal(refreshedBody.sessionId, body.sessionId);
    assert.equal(refreshedBody.sub, identity.sub);
    assert.equal(refreshedBody.csrfToken, issued.csrfToken);
    assert.equal(refreshedBody.refreshToken, "refresh-next");
    assert.deepEqual(refreshedBody.previousRefreshTokens, [
      "refresh-previous",
      "refresh-current",
    ]);
    assert.equal(refreshedBody.mfaAuthenticatedAt, body.mfaAuthenticatedAt);
    assert.equal(
      refreshedBody.emailMfaAuthenticatedAt,
      body.emailMfaAuthenticatedAt,
    );

    nextRefreshToken = "refresh-final";
    holdRefreshResponse = true;
    const inFlightRefresh = sessionModule.refreshSessionIdentity(
      body.sessionId,
      "refresh-next",
    );
    await refreshResponseStarted;
    await assert.rejects(
      sessionModule.refreshSessionIdentity(body.sessionId, "refresh-next"),
      /Session refresh is already in progress/,
    );
    holdRefreshResponse = false;
    releaseRefreshResponse?.();
    const finalRefresh = (await inFlightRefresh) as {
      session: { refreshToken: string };
    };
    assert.equal(finalRefresh.session.refreshToken, "refresh-final");

    await assert.rejects(
      sessionModule.refreshSessionIdentity(body.sessionId, "refresh-current"),
      /Refresh token replay detected/,
    );
    assert.equal(records.has(`sanny:session:${body.sessionId}`), false);
  } finally {
    await server.close();
    await sessionModule.closeSessionStore();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProdTrustProxy === undefined)
      delete process.env.PROD_TRUST_PROXY;
    else process.env.PROD_TRUST_PROXY = previousProdTrustProxy;
  }
});

test("requireSession deletes malformed and absolutely expired Redis records", async () => {
  const source = await readFile(
    new URL("../utils/session.ts", import.meta.url),
    "utf8",
  );
  const now = Date.now();
  const records = new Map<string, string>([
    ["sanny:session:malformed", "not-json"],
    [
      "sanny:session:expired",
      JSON.stringify({
        createdAt: now - 8 * 60 * 60 * 1000 - 1,
        lastTouchedAt: now - 8 * 60 * 60 * 1000,
        identity: { sub: "auth0|expired-user" },
      }),
    ],
  ]);
  const redis = {
    on: () => undefined,
    connect: async () => undefined,
    quit: async () => undefined,
    get: async (key: string) => records.get(key) ?? null,
    set: async (key: string, value: string) => {
      records.set(key, value);
      return "OK";
    },
    del: async (key: string) => Number(records.delete(key)),
    multi: () => {
      const actions: Array<() => void> = [];
      const transaction = {
        set: (key: string, value: string) => {
          actions.push(() => records.set(key, value));
          return transaction;
        },
        del: (key: string) => {
          actions.push(() => records.delete(key));
          return transaction;
        },
        exec: async () => {
          for (const action of actions) action();
          return [];
        },
      };
      return transaction;
    },
  };
  const module = { exports: {} as Record<string, unknown> };
  const modules: Record<string, object> = {
    redis: { createClient: () => redis },
    "./config.js": {
      getCorsOrigins: () => ["https://app.example.test"],
      isProduction: () => false,
      requiredEnv: () => "test-value",
      requiredEnvironmentSpecificEnv: () => "https://app.example.test",
      requiredProductionUrl: () => "https://app.example.test",
    },
    "./access-token.js": { verifyAccessTokenIdentity: async () => null },
    "./refresh-token.js": { buildRefreshTokenRequest: () => ({}) },
    "../utils/security-audit.js": { logSecurityEvent: () => undefined },
    "./session-rotation.js": sessionRotation,
    "node:fs": { readFileSync: () => Buffer.from("test-ca") },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: module.exports,
      require: (name: string) => modules[name] ?? require(name),
      Buffer,
      URL,
      URLSearchParams,
      Date,
      Error,
      JSON,
      Math,
      setTimeout,
      clearTimeout,
    },
  );

  const sessionModule = module.exports as unknown as SessionModule;
  await sessionModule.initializeSessionStore();
  const server = Fastify();
  await server.register(cookie);
  server.get(
    "/protected",
    { preHandler: [sessionModule.requireSession] },
    async (_request, reply) => reply.code(200).send({ ok: true }),
  );

  try {
    for (const sessionId of ["malformed", "expired"]) {
      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: { cookie: `__Host-sanny_session=${sessionId}` },
      });
      assert.equal(response.statusCode, 401, sessionId);
      assert.deepEqual(response.json(), { error: "Unauthorized" });
      assert.equal(records.has(`sanny:session:${sessionId}`), false);
    }
  } finally {
    await server.close();
    await sessionModule.closeSessionStore();
  }
});
