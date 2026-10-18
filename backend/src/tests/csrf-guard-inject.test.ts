import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import test from "node:test";
import { requireCsrf } from "../utils/session.js";

test("CSRF guard rejects cross-site and untrusted request metadata", async () => {
  const environment = {
    NODE_ENV: "development",
    DEV_CORS_ORIGINS: "https://app.example.test",
  };
  const previousEnvironment = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);

  const server = Fastify();
  await server.register(cookie);
  server.addHook("onRequest", requireCsrf);
  server.post("/api/v001/users/me", async (_request, reply) =>
    reply.code(204).send(),
  );
  server.post("/api/v001/auth/logout", async (_request, reply) =>
    reply.code(204).send(),
  );

  const sessionCookie = "__Host-sanny_session=test-session";
  const cases = [
    {
      url: "/api/v001/users/me",
      headers: { cookie: sessionCookie, "sec-fetch-site": "cross-site" },
      body: { error: "Forbidden", message: "Cross-site request blocked" },
    },
    {
      url: "/api/v001/users/me",
      headers: { cookie: sessionCookie, origin: "https://attacker.example" },
      body: { error: "Forbidden", message: "Request origin is not trusted" },
    },
    {
      url: "/api/v001/users/me",
      headers: { cookie: sessionCookie, referer: "not a URL" },
      body: { error: "Forbidden", message: "Request referer is invalid" },
    },
    {
      url: "/api/v001/users/me",
      headers: {
        cookie: sessionCookie,
        referer: "https://attacker.example/action",
      },
      body: { error: "Forbidden", message: "Request referer is not trusted" },
    },
    {
      url: "/api/v001/auth/logout",
      headers: {
        cookie: sessionCookie,
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: { error: "Forbidden", message: "Request origin is not trusted" },
    },
  ] as const;

  try {
    for (const request of cases) {
      const response = await server.inject({
        method: "POST",
        url: request.url,
        headers: request.headers,
      });
      assert.equal(response.statusCode, 403, request.url);
      assert.deepEqual(response.json(), request.body, request.url);
    }
  } finally {
    await server.close();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
