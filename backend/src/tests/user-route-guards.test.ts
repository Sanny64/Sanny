import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import nodemailer from "nodemailer";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { mock, test } from "node:test";
import userRoutes from "../routes/user.route.js";
import type { AccessTokenIdentity } from "../utils/access-token.js";
import { requirePermissions, requireRoles } from "../utils/auth0-guards.js";
import {
  requireEmailMfaAuthentication,
  requireMfaAuthentication,
} from "../utils/mfa-reauth.js";
import { requireRecentAuthentication } from "../utils/session.js";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { mergeUserAccounts } from "../services/user.service.js";

test("user API routes reject unauthenticated requests before handlers run", async () => {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(cookie);
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  const requests = [
    { method: "GET", url: "/api/v001/users/me" },
    { method: "POST", url: "/api/v001/users/me", payload: {} },
    {
      method: "PATCH",
      url: "/api/v001/users/me",
      payload: { username: "Updated User" },
    },
    { method: "DELETE", url: "/api/v001/users/me" },
    { method: "POST", url: "/api/v001/users/me/password-reset" },
    {
      method: "POST",
      url: "/api/v001/users/link-account",
      payload: {
        primaryAuth0Sub: "google-oauth2|primary",
        secondaryAuth0Sub: "auth0|secondary",
      },
    },
    { method: "GET", url: "/api/v001/users/lookup?email=user%40example.test" },
    { method: "GET", url: "/api/v001/users/42/roles" },
    { method: "GET", url: "/api/v001/users/42" },
    { method: "GET", url: "/api/v001/users/list" },
    {
      method: "PATCH",
      url: "/api/v001/users/42",
      payload: { username: "Updated User" },
    },
    {
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["user"] },
    },
    { method: "POST", url: "/api/v001/users/42/password-reset" },
    { method: "DELETE", url: "/api/v001/users/42" },
    { method: "GET", url: "/api/v001/users/roles/available" },
  ] as const;

  try {
    for (const request of requests) {
      const response = await server.inject(request);
      assert.equal(
        response.statusCode,
        401,
        `${request.method} ${request.url}`,
      );
      assert.deepEqual(response.json(), { error: "Unauthorized" });
    }
  } finally {
    await server.close();
  }
});

test("user API schemas reject invalid pagination, ids, and lookup emails", async () => {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(cookie);
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    for (const url of [
      "/api/v001/users/list?page=0",
      "/api/v001/users/list?limit=100",
      "/api/v001/users/not-a-number",
      "/api/v001/users/lookup?email=not-an-email",
    ]) {
      const response = await server.inject({ method: "GET", url });
      assert.equal(response.statusCode, 400, url);
    }
  } finally {
    await server.close();
  }
});

test("permission, role, recent-authentication, and MFA guards enforce their boundaries", async () => {
  const server = Fastify();
  server.addHook("onRequest", async (request) => {
    const now = Date.now();
    const identity: AccessTokenIdentity = {
      sub: "auth0|test-user",
      email: "test@example.test",
      emailVerified: true,
      name: "Test User",
      roles: request.url === "/missing-role" ? ["user"] : ["admin"],
      permissions: request.url === "/missing-permission" ? [] : ["read:users"],
      audiences: ["https://api.example.test"],
    };
    const authenticatedAt = request.url === "/stale-auth" ? now - 120_000 : now;
    request.sannySession = identity;
    request.sannySessionRecord = {
      sessionId: "test-session",
      identity,
      csrfToken: "test-csrf",
      createdAt: now,
      lastTouchedAt: now,
      authenticatedAt,
      ...(request.url === "/missing-mfa" ? {} : { mfaAuthenticatedAt: now }),
      ...(request.url === "/missing-email-mfa"
        ? {}
        : { emailMfaAuthenticatedAt: now }),
    };
  });
  server.get(
    "/missing-permission",
    { preHandler: [requirePermissions(["write:users"])] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.get(
    "/missing-role",
    { preHandler: [requireRoles(["admin"])] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.get(
    "/stale-auth",
    { preHandler: [requireRecentAuthentication(60_000)] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.get(
    "/missing-mfa",
    { preHandler: [requireMfaAuthentication()] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.get(
    "/missing-email-mfa",
    { preHandler: [requireEmailMfaAuthentication()] },
    async (_request, reply) => reply.code(204).send(),
  );
  server.get(
    "/fully-authenticated",
    {
      preHandler: [
        requirePermissions(["read:users"]),
        requireRoles(["admin"]),
        requireRecentAuthentication(60_000),
        requireMfaAuthentication(),
        requireEmailMfaAuthentication(),
      ],
    },
    async (_request, reply) => reply.code(204).send(),
  );

  try {
    const cases = [
      [
        "/missing-permission",
        403,
        {
          error: "Forbidden",
          message: "Missing required permissions: write:users",
        },
      ],
      [
        "/missing-role",
        403,
        {
          error: "Forbidden",
          message: "Missing required roles: admin. User has: user",
        },
      ],
      [
        "/stale-auth",
        401,
        { error: "Unauthorized", message: "Reauthentication required" },
      ],
      [
        "/missing-mfa",
        401,
        {
          error: "Unauthorized",
          message: "MFA authentication required",
          mfaRequired: true,
        },
      ],
      [
        "/missing-email-mfa",
        401,
        {
          error: "Unauthorized",
          message: "Email OTP authentication required",
          emailOtpRequired: true,
        },
      ],
    ] as const;
    for (const [url, status, expected] of cases) {
      const response = await server.inject({ method: "GET", url });
      assert.equal(response.statusCode, status, url);
      assert.deepEqual(response.json(), expected, url);
    }

    const allowed = await server.inject({
      method: "GET",
      url: "/fully-authenticated",
    });
    assert.equal(allowed.statusCode, 204);
  } finally {
    await server.close();
  }
});

test("sensitive user routes register their required pre-handler guards", async () => {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  const routeGuards = new Map<string, string[]>();
  server.addHook("onRoute", (route) => {
    const handlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    routeGuards.set(
      `${methods.join(",")} ${route.url}`,
      handlers.map((handler) => handler.name),
    );
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });
  await server.ready();

  const expected = [
    ["GET /api/v001/users/me", ["requireSession"]],
    ["PATCH /api/v001/users/me", ["requireSession", "permissionGuard"]],
    [
      "DELETE /api/v001/users/me",
      ["requireSession", "permissionGuard", "factorAuthenticationGuard"],
    ],
    [
      "POST /api/v001/users/me/password-reset",
      ["requireSession", "factorAuthenticationGuard"],
    ],
    [
      "POST /api/v001/users/link-account",
      ["requireSession", "recentAuthenticationGuard"],
    ],
    [
      "GET /api/v001/users/lookup",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "GET /api/v001/users/:userId/roles",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "GET /api/v001/users/:userId",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "GET /api/v001/users/list",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "PATCH /api/v001/users/:userId/roles",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "POST /api/v001/users/:userId/password-reset",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
    [
      "DELETE /api/v001/users/:userId",
      [
        "requireSession",
        "permissionGuard",
        "roleGuard",
        "factorAuthenticationGuard",
      ],
    ],
  ] as const;

  try {
    for (const [route, expectedGuards] of expected) {
      assert.deepEqual(routeGuards.get(route), expectedGuards, route);
    }
  } finally {
    await server.close();
  }
});

test("self and admin user reads pass guards, return public fields, and sanitize database errors", async () => {
  const profile = {
    id: 42,
    email: "test@example.test",
    username: "Test User",
  };
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-user",
    email: profile.email,
    emailVerified: true,
    name: profile.username,
    roles: ["admin"],
    permissions: ["read:users", "write:users"],
    audiences: ["https://api.example.test"],
  };
  const originalFindUnique = prisma.user.findUnique;
  let failLookup = false;
  let missingAdminUser = false;
  let lookupArguments: unknown;
  prisma.user.findUnique = mock.fn(async (args: unknown) => {
    lookupArguments = args;
    if (failLookup) throw new Error("database connection detail");
    if (
      missingAdminUser &&
      (args as { where?: { id?: number } }).where?.id === 42
    ) {
      return null;
    }
    return profile;
  }) as unknown as typeof prisma.user.findUnique;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isSelfRead =
      methods.includes("GET") &&
      (route.url === "/me" || route.url.endsWith("/users/me"));
    const isAdminRead =
      methods.includes("GET") &&
      (route.url === "/:userId" || route.url.endsWith("/users/:userId"));
    const isEmailLookup =
      methods.includes("GET") && route.url.endsWith("/users/lookup");
    if (!isSelfRead && !isAdminRead && !isEmailLookup) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const now = Date.now();
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: "test-admin-session",
          identity,
          csrfToken: "test-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
          mfaAuthenticatedAt: now,
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (route.url.endsWith("/users/me") && methods.includes("GET")) {
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
        },
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/v001/users/me",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), profile);
    assert.deepEqual(
      (lookupArguments as { select?: Record<string, boolean> }).select,
      { id: true, email: true, username: true },
    );

    const adminResponse = await server.inject({
      method: "GET",
      url: "/api/v001/users/42",
    });
    assert.equal(adminResponse.statusCode, 200);
    assert.deepEqual(adminResponse.json(), profile);

    const lookupResponse = await server.inject({
      method: "GET",
      url: "/api/v001/users/lookup?email=test%40example.test",
    });
    assert.equal(lookupResponse.statusCode, 200);
    assert.deepEqual(lookupResponse.json(), profile);

    missingAdminUser = true;
    const missingResponse = await server.inject({
      method: "GET",
      url: "/api/v001/users/42",
    });
    assert.equal(missingResponse.statusCode, 404);
    assert.deepEqual(missingResponse.json(), {
      error: "Not found",
      message: "The requested resource was not found.",
    });

    missingAdminUser = false;
    failLookup = true;
    const failedResponse = await server.inject({
      method: "GET",
      url: "/api/v001/users/me",
    });
    assert.equal(failedResponse.statusCode, 500);
    assert.deepEqual(failedResponse.json(), {
      error: "Internal server error",
      message: "An internal error occurred.",
    });
  } finally {
    await server.close();
    prisma.user.findUnique = originalFindUnique;
  }
});

test("GET /users/list applies pagination and sanitizes database failures", async () => {
  const users = [
    { id: 51, email: "first@example.test", username: "First" },
    { id: 52, email: "second@example.test", username: "Second" },
  ];
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["read:users", "write:users"],
    audiences: ["https://api.example.test"],
  };
  const originalFindMany = prisma.user.findMany;
  let failLookup = false;
  let lookupArguments: unknown;
  prisma.user.findMany = mock.fn(async (args: unknown) => {
    lookupArguments = args;
    if (failLookup) throw new Error("database connection detail");
    return users;
  }) as unknown as typeof prisma.user.findMany;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("GET") &&
      (route.url === "/list" || route.url.endsWith("/users/list"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "test-admin-session",
            identity,
            csrfToken: "test-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
            mfaAuthenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/v001/users/list?page=2&limit=2",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), users);
    assert.deepEqual(
      lookupArguments as {
        skip: number;
        take: number;
        select: Record<string, boolean>;
      },
      {
        orderBy: { id: "asc" },
        skip: 2,
        take: 2,
        select: { id: true, email: true, username: true },
      },
    );

    failLookup = true;
    const failedResponse = await server.inject({
      method: "GET",
      url: "/api/v001/users/list",
    });
    assert.equal(failedResponse.statusCode, 500);
    assert.deepEqual(failedResponse.json(), {
      error: "Internal server error",
      message: "An internal error occurred.",
    });
  } finally {
    await server.close();
    prisma.user.findMany = originalFindMany;
  }
});

test("admin role-read endpoints handle disabled sync and Auth0 denial", async () => {
  const user = {
    id: 42,
    email: "managed@example.test",
    username: "Managed User",
    auth0Sub: "auth0|managed-user",
  };
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["read:users", "write:users"],
    audiences: ["https://api.example.test"],
  };
  const auth0Environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
  };
  const originalFindUnique = prisma.user.findUnique;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const capturedErrors: string[] = [];
  const previousRoleSync = process.env.AUTH0_ROLE_SYNC_ENABLED;
  const previousAuth0Environment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  let auth0Denied = true;
  process.env.AUTH0_ROLE_SYNC_ENABLED = "false";
  prisma.user.findUnique = mock.fn(
    async () => user,
  ) as unknown as typeof prisma.user.findUnique;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isAvailableRoles =
      methods.includes("GET") && route.url.endsWith("/users/roles/available");
    const isUserRoles =
      (methods.includes("GET") || methods.includes("PATCH")) &&
      route.url.endsWith("/users/:userId/roles");
    if (!isAvailableRoles && !isUserRoles) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const now = Date.now();
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: "test-admin-session",
          identity,
          csrfToken: "test-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
          mfaAuthenticatedAt: now,
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const availableRoles = await server.inject({
      method: "GET",
      url: "/api/v001/users/roles/available",
    });
    assert.equal(availableRoles.statusCode, 200);
    assert.deepEqual(availableRoles.json(), { roles: [] });

    const userRoles = await server.inject({
      method: "GET",
      url: "/api/v001/users/42/roles",
    });
    assert.equal(userRoles.statusCode, 200);
    assert.deepEqual(userRoles.json(), { roles: [] });

    const roleUpdate = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    });
    assert.equal(roleUpdate.statusCode, 503);
    assert.deepEqual(roleUpdate.json(), {
      error: "Role synchronization is disabled",
      message: "Role synchronization is not enabled for this environment.",
    });

    process.env.AUTH0_ROLE_SYNC_ENABLED = "true";
    Object.assign(process.env, auth0Environment);
    globalThis.fetch = (async (url: string | URL | Request) =>
      String(url).endsWith("/oauth/token")
        ? Response.json({ access_token: "management-token" })
        : auth0Denied
          ? Response.json(
              { message: "sensitive upstream detail" },
              { status: 403 },
            )
          : Response.json([
              { id: "role-admin", name: "admin" },
            ])) as typeof fetch;
    console.error = (...arguments_: unknown[]) => {
      capturedErrors.push(arguments_.map(String).join(" "));
    };
    const deniedRoles = await server.inject({
      method: "GET",
      url: "/api/v001/users/42/roles",
    });
    assert.equal(deniedRoles.statusCode, 403);
    assert.deepEqual(deniedRoles.json(), {
      error: "Forbidden",
      message: "Access denied.",
    });
    assert.equal(
      JSON.stringify(deniedRoles.json()).includes("sensitive upstream detail"),
      false,
    );
    assert.equal(
      capturedErrors.join(" ").includes("sensitive upstream detail"),
      false,
    );

    auth0Denied = false;
    const fetchedUserRoles = await server.inject({
      method: "GET",
      url: "/api/v001/users/42/roles",
    });
    assert.equal(fetchedUserRoles.statusCode, 200);
    assert.deepEqual(fetchedUserRoles.json(), { roles: ["admin"] });

    const fetchedAvailableRoles = await server.inject({
      method: "GET",
      url: "/api/v001/users/roles/available",
    });
    assert.equal(fetchedAvailableRoles.statusCode, 200);
    assert.deepEqual(fetchedAvailableRoles.json(), { roles: ["admin"] });
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    prisma.user.findUnique = originalFindUnique;
    if (previousRoleSync === undefined) {
      delete process.env.AUTH0_ROLE_SYNC_ENABLED;
    } else {
      process.env.AUTH0_ROLE_SYNC_ENABLED = previousRoleSync;
    }
    for (const [key, value] of Object.entries(previousAuth0Environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("POST /users/me creates verified self accounts and rejects unverified or conflicting subjects", async () => {
  let identity: AccessTokenIdentity = {
    sub: "google-oauth2|new-user",
    email: "Person@Example.Test",
    emailVerified: true,
    name: null,
    roles: ["user"],
    permissions: [],
    audiences: ["https://api.example.test"],
  };
  const originalFindUnique = prisma.user.findUnique;
  const originalCreate = prisma.user.create;
  const originalUpdate = prisma.user.update;
  let existingByEmail: unknown = null;
  let createdRecord: unknown;
  let updateArguments: unknown;
  let duplicateRecoveryMode = false;
  let duplicateRecoveryUser: unknown;
  let createError: Error | undefined;
  let lookupCount = 0;
  prisma.user.findUnique = mock.fn(async (arguments_: unknown) => {
    if (duplicateRecoveryMode) {
      const where = (arguments_ as { where: Record<string, unknown> }).where;
      if ("auth0Sub" in where) {
        lookupCount++;
        return lookupCount === 1 ? null : duplicateRecoveryUser;
      }
      return null;
    }
    lookupCount++;
    return lookupCount === 1 ? null : existingByEmail;
  }) as unknown as typeof prisma.user.findUnique;
  prisma.user.create = mock.fn(async (args: unknown) => {
    if (createError) {
      throw createError;
    }
    createdRecord = args;
    return {
      id: 81,
      email: "person@example.test",
      username: "Person",
    };
  }) as unknown as typeof prisma.user.create;
  prisma.user.update = mock.fn(async (args: unknown) => {
    updateArguments = args;
    return {
      id: 82,
      email: "person@example.test",
      username: "Legacy Person",
    };
  }) as unknown as typeof prisma.user.update;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("POST") &&
      (route.url === "/me" || route.url.endsWith("/users/me"))
    ) {
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
        },
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const created = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(created.statusCode, 201);
    assert.deepEqual(created.json(), {
      id: 81,
      email: "person@example.test",
      username: "Person",
    });
    assert.deepEqual(
      (createdRecord as { data: Record<string, unknown> }).data,
      {
        email: "person@example.test",
        auth0Sub: "google-oauth2|new-user",
        username: "Person",
        password: null,
      },
    );

    lookupCount = 0;
    existingByEmail = {
      id: 82,
      email: "person@example.test",
      username: "Legacy Person",
      auth0Sub: null,
    };
    const adoptedLegacyRow = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(adoptedLegacyRow.statusCode, 200);
    assert.deepEqual(adoptedLegacyRow.json(), {
      id: 82,
      email: "person@example.test",
      username: "Legacy Person",
    });
    assert.deepEqual(updateArguments, {
      where: { id: 82 },
      data: { auth0Sub: identity.sub, username: "Legacy Person" },
      select: { id: true, email: true, username: true },
    });

    lookupCount = 0;
    updateArguments = undefined;
    existingByEmail = {
      id: 82,
      email: "person@example.test",
      username: "Existing",
      auth0Sub: "auth0|existing-user",
    };
    const conflict = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(conflict.statusCode, 409);
    assert.deepEqual(conflict.json(), {
      error: "Bad request",
      message: "The request could not be processed.",
    });
    assert.equal(updateArguments, undefined);

    identity = { ...identity, emailVerified: false };
    const unverified = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(unverified.statusCode, 400);
    assert.deepEqual(unverified.json(), {
      error: "A verified email claim is required for local-account creation.",
    });

    identity = { ...identity, emailVerified: true };
    duplicateRecoveryMode = true;
    duplicateRecoveryUser = {
      id: 83,
      email: "person@example.test",
      username: "Concurrent Winner",
    };
    createError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test" },
    );
    lookupCount = 0;
    const concurrentCreate = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(concurrentCreate.statusCode, 200);
    assert.deepEqual(concurrentCreate.json(), duplicateRecoveryUser);
    assert.equal(lookupCount, 2);
  } finally {
    await server.close();
    prisma.user.findUnique = originalFindUnique;
    prisma.user.create = originalCreate;
    prisma.user.update = originalUpdate;
  }
});

test("POST /users/me updates a known subject's email without replacing its username", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|changing-user",
    email: " New.Email@Example.Test ",
    emailVerified: true,
    name: "Name From Auth0",
    roles: ["user"],
    permissions: [],
    audiences: ["https://api.example.test"],
  };
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalCreate = prisma.user.create;
  let lookupArguments: unknown;
  let updateArguments: unknown;
  prisma.user.findUnique = mock.fn(async (args: unknown) => {
    lookupArguments = args;
    return {
      id: 94,
      email: "old.email@example.test",
      username: "Existing Username",
    };
  }) as unknown as typeof prisma.user.findUnique;
  prisma.user.update = mock.fn(async (args: unknown) => {
    updateArguments = args;
    return {
      id: 94,
      email: "new.email@example.test",
      username: "Existing Username",
    };
  }) as unknown as typeof prisma.user.update;
  prisma.user.create = mock.fn(async () => {
    assert.fail("Existing Auth0 subjects must not create a duplicate row");
  }) as unknown as typeof prisma.user.create;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("POST") &&
      (route.url === "/me" || route.url.endsWith("/users/me"))
    ) {
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
        },
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "POST",
      url: "/api/v001/users/me",
      payload: {},
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      id: 94,
      email: "new.email@example.test",
      username: "Existing Username",
    });
    assert.deepEqual(
      (lookupArguments as { where: { auth0Sub: string } }).where,
      { auth0Sub: identity.sub },
    );
    assert.deepEqual(updateArguments, {
      where: { id: 94 },
      data: {
        email: "new.email@example.test",
        username: "Existing Username",
      },
      select: { id: true, email: true, username: true },
    });
  } finally {
    await server.close();
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    prisma.user.create = originalCreate;
  }
});

test("POST /users/link-account requires ownership and merges only public response fields", async () => {
  let identity: AccessTokenIdentity = {
    sub: "google-oauth2|google-primary",
    email: "user@example.test",
    emailVerified: true,
    name: "User",
    roles: ["user"],
    permissions: [],
    audiences: ["https://api.example.test"],
  };
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalDelete = prisma.user.delete;
  let updateArguments: unknown;
  let deleteArguments: unknown;
  let failMergeUpdate = false;
  let findUniqueCalls = 0;
  prisma.user.findUnique = mock.fn(async (args: unknown) => {
    findUniqueCalls++;
    const auth0Sub = (args as { where: { auth0Sub: string } }).where.auth0Sub;
    if (findUniqueCalls === 3) {
      return {
        id: 1,
        email: "user@example.test",
        username: "User",
      };
    }
    return auth0Sub === "google-oauth2|google-primary"
      ? {
          id: 1,
          email: "user@example.test",
          username: "User",
          auth0Sub,
          password: null,
          emailVerified: false,
        }
      : {
          id: 2,
          email: "user@example.test",
          username: "User Secondary",
          auth0Sub,
          password: "auth0-managed-hash",
          emailVerified: true,
        };
  }) as unknown as typeof prisma.user.findUnique;
  prisma.user.update = mock.fn(async (args: unknown) => {
    updateArguments = args;
    if (failMergeUpdate) {
      throw new Error("database unavailable");
    }
    return {};
  }) as unknown as typeof prisma.user.update;
  prisma.user.delete = mock.fn(async (args: unknown) => {
    deleteArguments = args;
    return {};
  }) as unknown as typeof prisma.user.delete;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.includes("POST") && route.url.endsWith("/users/link-account")) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "linking-session",
            identity,
            csrfToken: "linking-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const body = {
      primaryAuth0Sub: "google-oauth2|google-primary",
      secondaryAuth0Sub: "auth0|password-secondary",
    };
    const sameAccountRequest = await server.inject({
      method: "POST",
      url: "/api/v001/users/link-account",
      payload: {
        primaryAuth0Sub: "google-oauth2|google-primary",
        secondaryAuth0Sub: "google-oauth2|google-primary",
      },
    });
    assert.equal(sameAccountRequest.statusCode, 400);
    assert.equal(findUniqueCalls, 0);
    await assert.rejects(
      mergeUserAccounts(
        "google-oauth2|google-primary",
        "google-oauth2|google-primary",
      ),
      /must be different/,
    );
    assert.equal(findUniqueCalls, 0);

    const ownerRequest = await server.inject({
      method: "POST",
      url: "/api/v001/users/link-account",
      payload: body,
    });
    assert.equal(ownerRequest.statusCode, 200);
    assert.deepEqual(ownerRequest.json(), {
      id: 1,
      email: "user@example.test",
      username: "User",
    });
    assert.deepEqual(updateArguments, {
      where: { id: 1 },
      data: { password: "auth0-managed-hash", emailVerified: true },
    });
    assert.deepEqual(deleteArguments, { where: { id: 2 } });
    assert.equal(
      JSON.stringify(ownerRequest.json()).includes("password"),
      false,
    );

    identity = { ...identity, sub: "auth0|unrelated-user" };
    const unauthorizedOwner = await server.inject({
      method: "POST",
      url: "/api/v001/users/link-account",
      payload: body,
    });
    assert.equal(unauthorizedOwner.statusCode, 403);
    assert.equal(findUniqueCalls, 3);

    identity = { ...identity, sub: "google-oauth2|google-primary" };
    failMergeUpdate = true;
    const failedMerge = await server.inject({
      method: "POST",
      url: "/api/v001/users/link-account",
      payload: body,
    });
    assert.equal(failedMerge.statusCode, 500);
    assert.deepEqual(failedMerge.json(), {
      error: "Internal server error",
      message: "An internal error occurred.",
    });
    assert.deepEqual(deleteArguments, { where: { id: 2 } });
  } finally {
    await server.close();
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    prisma.user.delete = originalDelete;
  }
});

test("PATCH /users/me updates Auth0 and Prisma with the trimmed username", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|profile-user",
    email: "profile@example.test",
    emailVerified: true,
    name: "Profile User",
    roles: ["user"],
    permissions: ["update:me"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
    AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalUpdate = prisma.user.update;
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  let updateArguments: unknown;
  let auth0Status = 200;
  let updateCalls = 0;
  let failDatabaseUpdate = false;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    requests.push({
      url: requestUrl,
      ...(init?.method ? { method: init.method } : {}),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response(null, { status: auth0Status });
  }) as typeof fetch;
  prisma.user.update = mock.fn(async (args: unknown) => {
    updateCalls++;
    if (failDatabaseUpdate) {
      throw new Error("database unavailable");
    }
    updateArguments = args;
    return {
      id: 91,
      email: identity.email,
      username: "Updated Name",
    };
  }) as unknown as typeof prisma.user.update;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("PATCH") &&
      (route.url === "/me" || route.url.endsWith("/users/me"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/me",
      payload: { username: "  Updated Name  " },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      id: 91,
      email: "profile@example.test",
      username: "Updated Name",
    });
    assert.equal(
      requests[0]?.url,
      "https://tenant.example.test/api/v2/users/auth0%7Cprofile-user",
    );
    assert.equal(requests[0]?.method, "PATCH");
    assert.deepEqual(JSON.parse(requests[0]?.body ?? "{}"), {
      name: "Updated Name",
      user_metadata: { username: "Updated Name" },
    });
    assert.deepEqual(updateArguments, {
      where: { auth0Sub: "auth0|profile-user" },
      data: { username: "Updated Name" },
      select: { id: true, email: true, username: true },
    });

    auth0Status = 403;
    const auth0Denied = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/me",
      payload: { username: "Rejected Name" },
    });
    assert.equal(auth0Denied.statusCode, 403);
    assert.equal(updateCalls, 1);
    assert.equal(requests.length, 2);

    auth0Status = 200;
    failDatabaseUpdate = true;
    const databaseFailure = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/me",
      payload: { username: "Database Failure" },
    });
    assert.equal(databaseFailure.statusCode, 500);
    assert.deepEqual(databaseFailure.json(), {
      error: "Internal server error",
      message: "An internal error occurred.",
    });
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.update = originalUpdate;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("PATCH /users/:userId updates admin target in Auth0 and Prisma", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["write:users"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
    AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const requests: Array<{ url: string; body?: string }> = [];
  let updateArguments: unknown;
  let auth0Status = 200;
  let updateCalls = 0;
  let failDatabaseUpdate = false;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    requests.push({
      url: requestUrl,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response(null, { status: auth0Status });
  }) as typeof fetch;
  prisma.user.findUnique = mock.fn(async () => ({
    id: 42,
    auth0Sub: "auth0|managed-user",
  })) as unknown as typeof prisma.user.findUnique;
  prisma.user.update = mock.fn(async (args: unknown) => {
    updateCalls++;
    if (failDatabaseUpdate) {
      throw new Error("database unavailable");
    }
    updateArguments = args;
    return {
      id: 42,
      email: "managed@example.test",
      username: "Managed Updated",
    };
  }) as unknown as typeof prisma.user.update;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("PATCH") &&
      (route.url === "/:userId" || route.url.endsWith("/users/:userId"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42",
      payload: { username: "  Managed Updated  " },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      id: 42,
      email: "managed@example.test",
      username: "Managed Updated",
    });
    assert.equal(
      requests[0]?.url,
      "https://tenant.example.test/api/v2/users/auth0%7Cmanaged-user",
    );
    assert.deepEqual(JSON.parse(requests[0]?.body ?? "{}"), {
      name: "Managed Updated",
      user_metadata: { username: "Managed Updated" },
    });
    assert.deepEqual(updateArguments, {
      where: { id: 42 },
      data: { username: "Managed Updated" },
      select: { id: true, email: true, username: true },
    });

    auth0Status = 403;
    const auth0Denied = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42",
      payload: { username: "Rejected Name" },
    });
    assert.equal(auth0Denied.statusCode, 403);
    assert.equal(updateCalls, 1);

    auth0Status = 200;
    failDatabaseUpdate = true;
    const databaseFailure = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42",
      payload: { username: "Database Failure" },
    });
    assert.equal(databaseFailure.statusCode, 500);
    assert.deepEqual(databaseFailure.json(), {
      error: "Internal server error",
      message: "An internal error occurred.",
    });
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("PATCH /users/:userId/roles validates and synchronizes Auth0 roles", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["write:users"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
    AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
    AUTH0_ROLE_SYNC_ENABLED: "true",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalFindUnique = prisma.user.findUnique;
  const roleMutations: Array<{ method?: string; body?: string }> = [];
  let roleMutationFailure: "none" | "http" | "network" = "none";
  let tokenRequestFailure = false;
  globalThis.fetch = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/oauth/token")) {
      if (tokenRequestFailure) {
        throw new Error("sensitive token endpoint detail");
      }
      return Response.json({ access_token: "management-token" });
    }
    if (requestUrl.endsWith("/roles?per_page=100&page=0")) {
      return Response.json([
        { id: "role-user", name: "user" },
        { id: "role-moderator", name: "moderator" },
      ]);
    }
    if (
      requestUrl.endsWith("/users/auth0%7Cmanaged-user/roles") &&
      !init?.method
    ) {
      return Response.json([{ id: "role-user", name: "user" }]);
    }
    if (requestUrl.endsWith("/users/auth0%7Cmanaged-user/roles")) {
      roleMutations.push({
        ...(init?.method ? { method: init.method } : {}),
        ...(typeof init?.body === "string" ? { body: init.body } : {}),
      });
      if (roleMutationFailure === "network") {
        throw new Error("sensitive transport detail");
      }
      if (roleMutationFailure === "http") {
        return new Response("sensitive role mutation detail", { status: 503 });
      }
      return new Response(null, { status: 204 });
    }
    throw new Error("Unexpected Management API request");
  }) as typeof fetch;
  prisma.user.findUnique = mock.fn(async () => ({
    id: 42,
    auth0Sub: "auth0|managed-user",
  })) as unknown as typeof prisma.user.findUnique;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("PATCH") &&
      route.url.endsWith("/users/:userId/roles")
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "test-admin-session",
            identity,
            csrfToken: "test-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
            mfaAuthenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { roles: ["moderator"] });
    assert.deepEqual(
      roleMutations.map((mutation) => ({
        method: mutation.method,
        roles: JSON.parse(mutation.body ?? "{}").roles,
      })),
      [
        { method: "POST", roles: ["role-moderator"] },
        { method: "DELETE", roles: ["role-user"] },
      ],
    );

    roleMutationFailure = "http";
    const upstreamFailure = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    });
    assert.equal(upstreamFailure.statusCode, 503);
    assert.equal(
      JSON.stringify(upstreamFailure.json()).includes(
        "sensitive role mutation detail",
      ),
      false,
    );

    roleMutationFailure = "network";
    const transportFailure = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    });
    assert.equal(transportFailure.statusCode, 500);
    assert.equal(
      JSON.stringify(transportFailure.json()).includes(
        "sensitive transport detail",
      ),
      false,
    );

    tokenRequestFailure = true;
    const tokenFailure = await server.inject({
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    });
    assert.equal(tokenFailure.statusCode, 500);
    assert.equal(
      JSON.stringify(tokenFailure.json()).includes(
        "sensitive token endpoint detail",
      ),
      false,
    );
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.findUnique = originalFindUnique;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("DELETE /users/:userId preserves the local user when Auth0 denies deletion", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["delete:users"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalFindUnique = prisma.user.findUnique;
  const originalDeleteMany = prisma.user.deleteMany;
  let localDeleteCalls = 0;
  prisma.user.findUnique = mock.fn(async () => ({
    id: 42,
    auth0Sub: "auth0|managed-user",
  })) as unknown as typeof prisma.user.findUnique;
  prisma.user.deleteMany = mock.fn(async () => {
    localDeleteCalls++;
    return { count: 1 };
  }) as unknown as typeof prisma.user.deleteMany;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response("upstream denied request", { status: 403 });
  }) as typeof fetch;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("DELETE") &&
      (route.url === "/:userId" || route.url.endsWith("/users/:userId"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "test-admin-session",
            identity,
            csrfToken: "test-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
            mfaAuthenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/v001/users/42",
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), {
      error: "Forbidden",
      message: "Access denied.",
    });
    assert.equal(
      JSON.stringify(response.json()).includes("upstream denied"),
      false,
    );
    assert.equal(localDeleteCalls, 0);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.findUnique = originalFindUnique;
    prisma.user.deleteMany = originalDeleteMany;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("DELETE /users/me preserves the self account when Auth0 denies deletion", async () => {
  const identity: AccessTokenIdentity = {
    sub: "google-oauth2|self-user",
    email: "self@example.test",
    emailVerified: true,
    name: "Self User",
    roles: ["user"],
    permissions: ["delete:me"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalDeleteMany = prisma.user.deleteMany;
  let localDeleteCalls = 0;
  prisma.user.deleteMany = mock.fn(async () => {
    localDeleteCalls++;
    return { count: 1 };
  }) as unknown as typeof prisma.user.deleteMany;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response("upstream denied request", { status: 403 });
  }) as typeof fetch;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("DELETE") &&
      (route.url === "/me" || route.url.endsWith("/users/me"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "self-delete-session",
            identity,
            csrfToken: "self-delete-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
            mfaAuthenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/v001/users/me",
    });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json(), {
      error: "Forbidden",
      message: "Access denied.",
    });
    assert.equal(localDeleteCalls, 0);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.deleteMany = originalDeleteMany;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("DELETE /users/:userId removes a local-only legacy user", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["delete:users"],
    audiences: ["https://api.example.test"],
  };
  const originalFindUnique = prisma.user.findUnique;
  const originalDeleteMany = prisma.user.deleteMany;
  let deleteArguments: unknown;
  prisma.user.findUnique = mock.fn(async () => ({
    id: 42,
    auth0Sub: null,
  })) as unknown as typeof prisma.user.findUnique;
  prisma.user.deleteMany = mock.fn(async (args: unknown) => {
    deleteArguments = args;
    return { count: 1 };
  }) as unknown as typeof prisma.user.deleteMany;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("DELETE") &&
      (route.url === "/:userId" || route.url.endsWith("/users/:userId"))
    ) {
      const existingHandlers = Array.isArray(route.preHandler)
        ? route.preHandler
        : route.preHandler
          ? [route.preHandler]
          : [];
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "test-admin-session",
            identity,
            csrfToken: "test-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
            mfaAuthenticatedAt: now,
          };
        },
        ...existingHandlers.slice(1),
      ];
    }
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/v001/users/42",
    });
    assert.equal(response.statusCode, 204);
    assert.deepEqual(deleteArguments, { where: { id: 42 } });
  } finally {
    await server.close();
    prisma.user.findUnique = originalFindUnique;
    prisma.user.deleteMany = originalDeleteMany;
  }
});

test("non-admins cannot access admin-only user routes even with permissions", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|regular-user",
    email: "user@example.test",
    emailVerified: true,
    name: "Regular User",
    roles: ["user"],
    permissions: ["read:users", "write:users", "delete:users"],
    audiences: ["https://api.example.test"],
  };
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isAdminRoute =
      route.url.endsWith("/users/list") ||
      route.url.endsWith("/users/roles/available") ||
      route.url.endsWith("/users/:userId/roles") ||
      route.url.endsWith("/users/:userId");
    if (!isAdminRoute) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const now = Date.now();
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: "regular-session",
          identity,
          csrfToken: "regular-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
          mfaAuthenticatedAt: now,
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  const requests = [
    { method: "GET", url: "/api/v001/users/list" },
    { method: "GET", url: "/api/v001/users/roles/available" },
    {
      method: "PATCH",
      url: "/api/v001/users/42/roles",
      payload: { roles: ["moderator"] },
    },
    { method: "DELETE", url: "/api/v001/users/42" },
  ] as const;

  try {
    for (const request of requests) {
      const response = await server.inject(request);
      assert.equal(response.statusCode, 403, request.url);
      assert.deepEqual(response.json(), {
        error: "Forbidden",
        message: "Missing required roles: admin. User has: user",
      });
    }
  } finally {
    await server.close();
  }
});

test("self/admin password-reset routes require their specific MFA factors", async () => {
  const identity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["write:users"],
    audiences: ["https://api.example.test"],
  };
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isSelfReset =
      methods.includes("POST") &&
      route.url.endsWith("/users/me/password-reset");
    const isAdminReset =
      methods.includes("POST") &&
      route.url.endsWith("/users/:userId/password-reset");
    if (!isSelfReset && !isAdminReset) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const now = Date.now();
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: "test-admin-session",
          identity,
          csrfToken: "test-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    const selfReset = await server.inject({
      method: "POST",
      url: "/api/v001/users/me/password-reset",
    });
    assert.equal(selfReset.statusCode, 401);
    assert.deepEqual(selfReset.json(), {
      error: "Unauthorized",
      message: "Email OTP authentication required",
      emailOtpRequired: true,
    });

    const adminReset = await server.inject({
      method: "POST",
      url: "/api/v001/users/42/password-reset",
    });
    assert.equal(adminReset.statusCode, 401);
    assert.deepEqual(adminReset.json(), {
      error: "Unauthorized",
      message: "MFA authentication required",
      mfaRequired: true,
    });
  } finally {
    await server.close();
  }
});

test("self/admin deletion reports database failure as a server error after Auth0 deletion", async () => {
  const adminIdentity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["delete:users"],
    audiences: ["https://api.example.test"],
  };
  const selfIdentity: AccessTokenIdentity = {
    sub: "google-oauth2|self-user",
    email: "self@example.test",
    emailVerified: true,
    name: "Self User",
    roles: ["user"],
    permissions: ["delete:me"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_M2M_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_SECRET: "test-secret",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const originalFetch = globalThis.fetch;
  const originalFindUnique = prisma.user.findUnique;
  const originalDeleteMany = prisma.user.deleteMany;
  let managementDeletes = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    managementDeletes++;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  prisma.user.findUnique = mock.fn(async () => ({
    id: 42,
    auth0Sub: "auth0|admin-target",
  })) as unknown as typeof prisma.user.findUnique;
  prisma.user.deleteMany = mock.fn(async () => {
    throw new Error("database connection detail");
  }) as unknown as typeof prisma.user.deleteMany;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isAdminDelete =
      methods.includes("DELETE") &&
      (route.url === "/:userId" || route.url.endsWith("/users/:userId"));
    const isSelfDelete =
      methods.includes("DELETE") &&
      (route.url === "/me" || route.url.endsWith("/users/me"));
    if (!isAdminDelete && !isSelfDelete) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const identity = isAdminDelete ? adminIdentity : selfIdentity;
        const now = Date.now();
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: `test-${isAdminDelete ? "admin" : "self"}-session`,
          identity,
          csrfToken: "test-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
          mfaAuthenticatedAt: now,
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    for (const request of [
      { method: "DELETE", url: "/api/v001/users/42" },
      { method: "DELETE", url: "/api/v001/users/me" },
    ] as const) {
      const response = await server.inject(request);
      assert.equal(response.statusCode, 500, request.url);
      assert.deepEqual(response.json(), {
        error: "Internal server error",
        message: "An internal error occurred.",
      });
    }
    assert.equal(managementDeletes, 2);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    prisma.user.findUnique = originalFindUnique;
    prisma.user.deleteMany = originalDeleteMany;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("self/admin password-reset handlers return not-found and sanitize Auth0 failures", async () => {
  const selfIdentity: AccessTokenIdentity = {
    sub: "auth0|self-user",
    email: "self@example.test",
    emailVerified: true,
    name: "Self User",
    roles: ["user"],
    permissions: [],
    audiences: ["https://api.example.test"],
  };
  const adminIdentity: AccessTokenIdentity = {
    sub: "auth0|test-admin",
    email: "admin@example.test",
    emailVerified: true,
    name: "Admin",
    roles: ["admin"],
    permissions: ["write:users"],
    audiences: ["https://api.example.test"],
  };
  const environment = {
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_CLIENT_ID: "test-client",
    AUTH0_M2M_CLIENT_ID: "test-m2m-client",
    AUTH0_M2M_CLIENT_SECRET: "test-m2m-secret",
    AUTH0_DATABASE_CONNECTION_ID: "test-database-connection",
    SMTP_HOST: "smtp.example.test:587",
    SMTP_USER: "mailer",
    SMTP_PASSWORD: "test-mail-password",
    SMTP_FROM_ADDRESS: "sanny@example.test",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalCreateTransport = nodemailer.createTransport;
  const capturedErrors: string[] = [];
  const originalFindUnique = prisma.user.findUnique;
  let foundSelfResetUser = false;
  let auth0Status = 403;
  let sentResetEmails = 0;
  prisma.user.findUnique = mock.fn(async (arguments_: unknown) => {
    if (!foundSelfResetUser) return null;
    const where = (arguments_ as { where: Record<string, unknown> }).where;
    return "id" in where
      ? {
          id: 42,
          email: "target@example.test",
          username: "Target User",
          auth0Sub: "auth0|target-user",
        }
      : {
          id: 31,
          email: "self@example.test",
          username: "Self User",
          auth0Sub: selfIdentity.sub,
        };
  }) as unknown as typeof prisma.user.findUnique;

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const isSelfReset =
      methods.includes("POST") &&
      (route.url === "/me/password-reset" ||
        route.url.endsWith("/users/me/password-reset"));
    const isAdminReset =
      methods.includes("POST") &&
      route.url.endsWith("/users/:userId/password-reset");
    if (!isSelfReset && !isAdminReset) return;

    const existingHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    route.preHandler = [
      async (request) => {
        const now = Date.now();
        const identity = isSelfReset ? selfIdentity : adminIdentity;
        request.sannySession = identity;
        request.sannySessionRecord = {
          sessionId: `test-${isSelfReset ? "self" : "admin"}-reset-session`,
          identity,
          csrfToken: "test-reset-csrf",
          createdAt: now,
          lastTouchedAt: now,
          authenticatedAt: now,
          ...(isSelfReset
            ? { emailMfaAuthenticatedAt: now }
            : { mfaAuthenticatedAt: now }),
        };
      },
      ...existingHandlers.slice(1),
    ];
  });
  await server.register(userRoutes, { prefix: "/api/v001/users" });

  try {
    for (const request of [
      { method: "POST", url: "/api/v001/users/me/password-reset" },
      { method: "POST", url: "/api/v001/users/42/password-reset" },
    ] as const) {
      const response = await server.inject(request);
      assert.equal(response.statusCode, 404, request.url);
      assert.deepEqual(response.json(), {
        error: "Not found",
        message: "The requested resource was not found.",
      });
    }

    Object.assign(process.env, environment);
    foundSelfResetUser = true;
    globalThis.fetch = (async (url: string | URL | Request) =>
      String(url).endsWith("/oauth/token")
        ? Response.json({ access_token: "management-token" })
        : auth0Status === 403
          ? Response.json(
              { message: "sensitive upstream detail" },
              { status: 403 },
            )
          : Response.json({
              ticket: "https://tenant.example.test/lo/reset?ticket=test-ticket",
            })) as typeof fetch;
    console.error = (...arguments_: unknown[]) => {
      capturedErrors.push(arguments_.map(String).join(" "));
    };
    const upstreamFailure = await server.inject({
      method: "POST",
      url: "/api/v001/users/me/password-reset",
    });
    assert.equal(upstreamFailure.statusCode, 502);
    assert.deepEqual(upstreamFailure.json(), {
      error: "Bad gateway",
      message:
        "Auth0 could not send the password reset email. Contact an administrator.",
    });
    assert.equal(
      JSON.stringify(upstreamFailure.json()).includes(
        "sensitive upstream detail",
      ),
      false,
    );
    assert.equal(
      capturedErrors.join(" ").includes("sensitive upstream detail"),
      false,
    );

    auth0Status = 200;
    nodemailer.createTransport = (() => ({
      sendMail: async () => {
        sentResetEmails++;
        return { accepted: ["recipient@example.test"], rejected: [] };
      },
      close: async () => undefined,
    })) as unknown as typeof nodemailer.createTransport;
    const selfReset = await server.inject({
      method: "POST",
      url: "/api/v001/users/me/password-reset",
    });
    assert.equal(selfReset.statusCode, 200);
    assert.deepEqual(selfReset.json(), {
      success: true,
      message: "Password reset email sent",
    });

    const adminReset = await server.inject({
      method: "POST",
      url: "/api/v001/users/42/password-reset",
    });
    assert.equal(adminReset.statusCode, 200);
    assert.deepEqual(adminReset.json(), {
      success: true,
      message: "Password reset email sent",
    });
    assert.equal(sentResetEmails, 2);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    nodemailer.createTransport = originalCreateTransport;
    prisma.user.findUnique = originalFindUnique;
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
