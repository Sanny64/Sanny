import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import test from "node:test";
import authRoutes from "../routes/auth.route.js";

test("auth routes enforce session and reject malformed account-link requests", async () => {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(cookie);
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  const requests = [
    {
      method: "GET",
      url: "/api/v001/auth/me",
      status: 401,
      body: { error: "Unauthorized" },
    },
    {
      method: "POST",
      url: "/api/v001/auth/resume-action",
      payload: { resumeToken: "a".repeat(32), factor: "mfa" },
      status: 401,
      body: { error: "Unauthorized" },
    },
    {
      method: "GET",
      url: "/api/v001/auth/confirm-account-linking",
      status: 400,
      body: {
        error: "Invalid request",
        message:
          "Missing or invalid account-linking parameters. Restart login with the updated Auth0 Action.",
      },
    },
    {
      method: "GET",
      url: "/api/v001/auth/account-link/continue",
      status: 400,
      body: {
        error: "Invalid request",
        message: "Invalid account-link continuation parameters.",
      },
    },
    {
      method: "GET",
      url: "/api/v001/auth/account-link-proof/start",
      status: 400,
      body: { error: "Invalid request" },
    },
    {
      method: "GET",
      url: "/api/v001/auth/account-link-proof/callback",
      status: 400,
      body: { error: "Invalid request" },
    },
  ] as const;

  try {
    for (const request of requests) {
      const response = await server.inject(request);
      assert.equal(response.statusCode, request.status, request.url);
      assert.deepEqual(response.json(), request.body, request.url);
    }
  } finally {
    await server.close();
  }
});

test("OAuth callback rejects invalid state and logout returns the configured URL", async () => {
  const environment = {
    NODE_ENV: "development",
    AUTH0_DOMAIN: "tenant.example.test",
    AUTH0_CLIENT_ID: "client-id",
    DEV_AUTH0_SUCCESS_REDIRECT: "https://app.example.test/",
    DEV_AUTH0_LOGOUT_REDIRECT: "https://app.example.test/",
    DEV_ACCOUNT_LINK_FRONTEND_URL: "https://login.example.test/confirm-linking",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(cookie);
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  try {
    const invalidState = await server.inject({
      method: "GET",
      url: "/api/v001/auth/callback?code=test-code&state=invalid-state",
    });
    assert.equal(invalidState.statusCode, 302);
    const errorUrl = new URL(invalidState.headers.location!);
    assert.equal(errorUrl.origin, "https://app.example.test");
    assert.equal(errorUrl.pathname, "/error");
    assert.equal(errorUrl.searchParams.get("status"), "401");
    assert.equal(
      errorUrl.searchParams.get("authError"),
      "invalid_authentication_state",
    );

    const providerError = await server.inject({
      method: "GET",
      url: "/api/v001/auth/callback?error=access_denied&error_description=cancelled",
    });
    assert.equal(providerError.statusCode, 302);
    const providerErrorUrl = new URL(providerError.headers.location!);
    assert.equal(providerErrorUrl.pathname, "/error");
    assert.equal(
      providerErrorUrl.searchParams.get("authError"),
      "access_denied",
    );

    const proofError = await server.inject({
      method: "GET",
      url: "/api/v001/auth/account-link-proof/callback?error=access_denied",
    });
    assert.equal(proofError.statusCode, 302);
    const proofErrorUrl = new URL(proofError.headers.location!);
    assert.equal(proofErrorUrl.origin, "https://login.example.test");
    assert.equal(proofErrorUrl.pathname, "/account-link-proof-complete");
    assert.equal(
      new URLSearchParams(proofErrorUrl.hash.slice(1)).get("error"),
      "Account ownership verification could not be completed. Please try again.",
    );

    const logout = await server.inject({
      method: "POST",
      url: "/api/v001/auth/logout",
    });
    assert.equal(logout.statusCode, 200);
    const logoutUrl = new URL(logout.json<{ logoutUrl: string }>().logoutUrl);
    assert.equal(logoutUrl.origin, "https://tenant.example.test");
    assert.equal(logoutUrl.pathname, "/oidc/logout");
    assert.equal(logoutUrl.searchParams.get("client_id"), "client-id");
    assert.equal(
      logoutUrl.searchParams.get("post_logout_redirect_uri"),
      "https://app.example.test/",
    );
  } finally {
    await server.close();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("auth route inventory requires a session only on protected endpoints", async () => {
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  const routeGuards = new Map<string, string[]>();
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    const handlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler
        ? [route.preHandler]
        : [];
    const path = route.url.replace(/\/$/, "");
    for (const method of methods) {
      routeGuards.set(
        `${method} ${path}`,
        handlers.map((handler) => handler.name),
      );
    }
  });
  await server.register(authRoutes, { prefix: "/api/v001/auth" });
  await server.ready();

  const expected = [
    ["GET /api/v001/auth", []],
    ["POST /api/v001/auth/resume-action", ["requireSession"]],
    ["GET /api/v001/auth/callback", []],
    ["GET /api/v001/auth/confirm-account-linking", []],
    ["GET /api/v001/auth/account-link/continue", []],
    ["GET /api/v001/auth/account-link-proof/start", []],
    ["GET /api/v001/auth/account-link-proof/callback", []],
    ["POST /api/v001/auth/logout", []],
    ["GET /api/v001/auth/me", ["requireSession"]],
  ] as const;

  try {
    for (const [route, expectedGuards] of expected) {
      assert.deepEqual(routeGuards.get(route), expectedGuards, route);
    }
  } finally {
    await server.close();
  }
});

test("GET /auth/me returns the session identity and expiry header", async () => {
  const identity = {
    sub: "google-oauth2|profile-user",
    email: "profile@example.test",
    emailVerified: true,
    name: "Profile User",
    roles: ["user"],
    permissions: ["update:me"],
    audiences: ["https://api.example.test"],
  };
  const createdAt = Date.now() - 60_000;
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.includes("GET") &&
      (route.url === "/me" || route.url.endsWith("/auth/me"))
    ) {
      route.preHandler = [
        async (request) => {
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "auth-me-session",
            identity,
            csrfToken: "auth-me-csrf",
            createdAt,
            lastTouchedAt: Date.now(),
            authenticatedAt: createdAt,
          };
        },
      ];
    }
  });
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  try {
    const response = await server.inject({
      method: "GET",
      url: "/api/v001/auth/me",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      sub: identity.sub,
      email: identity.email,
      email_verified: true,
      name: identity.name,
      roles: identity.roles,
      permissions: identity.permissions,
    });
    assert.equal(
      response.headers["x-session-expires-at"],
      String(createdAt + 8 * 60 * 60 * 1000),
    );
  } finally {
    await server.close();
  }
});

test("POST /auth/resume-action requires the pending action's recent factor", async () => {
  const identity = {
    sub: "auth0|step-up-user",
    email: "step-up@example.test",
    emailVerified: true,
    name: "Step Up User",
    roles: ["user"],
    permissions: ["delete:me"],
    audiences: ["https://api.example.test"],
  };
  const server = Fastify();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  server.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.includes("POST") && route.url.endsWith("/auth/resume-action")) {
      route.preHandler = [
        async (request) => {
          const now = Date.now();
          request.sannySession = identity;
          request.sannySessionRecord = {
            sessionId: "step-up-session",
            identity,
            csrfToken: "step-up-csrf",
            createdAt: now,
            lastTouchedAt: now,
            authenticatedAt: now,
          };
        },
      ];
    }
  });
  await server.register(authRoutes, { prefix: "/api/v001/auth" });

  try {
    for (const [factor, expected] of [
      ["mfa", { mfaRequired: true, message: "MFA authentication required" }],
      [
        "email",
        {
          emailOtpRequired: true,
          message: "Email OTP authentication required",
        },
      ],
    ] as const) {
      const response = await server.inject({
        method: "POST",
        url: "/api/v001/auth/resume-action",
        payload: { resumeToken: "a".repeat(32), factor },
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), {
        error: "Unauthorized",
        ...expected,
      });
    }
  } finally {
    await server.close();
  }
});
