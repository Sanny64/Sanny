import test from "node:test";
import assert from "node:assert/strict";

import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { applyRateLimit } from "../utils/rate-limit.js";
import { getHtmlErrorRedirectUrl } from "../utils/error-response.js";
import internalRoutes from "../routes/internal.route.js";
import { createSafeErrorResponse } from "../utils/safe-error.js";

test("route rate limiter blocks requests after the configured threshold", async () => {
  const request = {
    method: "POST",
    url: "/api/v001/auth",
    ip: "203.0.113.9",
    headers: {
      "x-forwarded-for": "203.0.113.9",
    },
  } as const;

  const first = await applyRateLimit(
    request as any,
    {
      header: () => undefined,
      code: () => ({
        send: (payload: unknown) => payload,
      }),
    } as any,
  );

  assert.equal(first.allowed, true);

  const blocked = await applyRateLimit(
    request as any,
    {
      header: (name: string, value: string) => ({ name, value }),
      code: (status: number) => ({
        send: (payload: unknown) => ({ status, payload }),
      }),
    } as any,
  );

  assert.equal(blocked.allowed, true);

  for (let index = 2; index < 20; index += 1) {
    await applyRateLimit(
      request as any,
      {
        header: () => undefined,
        code: () => ({
          send: (payload: unknown) => payload,
        }),
      } as any,
    );
  }

  const exceeded = await applyRateLimit(
    request as any,
    {
      header: (name: string, value: string) => ({ name, value }),
      code: (status: number) => ({
        send: (payload: unknown) => ({ status, payload }),
      }),
    } as any,
  );

  assert.equal(exceeded.allowed, false);
  assert.equal(exceeded.retryAfterMs > 0, true);
});

test("OAuth query variations share one rate-limit bucket", async () => {
  const reply = { header: () => undefined } as any;
  for (let index = 0; index < 10; index += 1) {
    const decision = await applyRateLimit(
      {
        method: "GET",
        url: `/api/v001/auth?state=${index}`,
        ip: "198.51.100.231",
        cookies: {},
      } as any,
      reply,
    );
    assert.equal(decision.allowed, true);
  }

  const exceeded = await applyRateLimit(
    {
      method: "GET",
      url: "/api/v001/auth?state=different-value",
      ip: "198.51.100.231",
      cookies: {},
    } as any,
    reply,
  );
  assert.equal(exceeded.allowed, false);
});

test("IPv6 clients receive independent rate-limit buckets", async () => {
  const reply = { header: () => undefined } as any;
  const firstClient = "2001:db8::231";
  const secondClient = "2001:db8::232";
  let firstClientDecision = { allowed: true };

  for (let index = 0; index < 11; index += 1) {
    firstClientDecision = await applyRateLimit(
      {
        method: "GET",
        url: "/api/v001/auth",
        ip: firstClient,
        cookies: {},
      } as any,
      reply,
    );
  }
  const secondClientDecision = await applyRateLimit(
    {
      method: "GET",
      url: "/api/v001/auth",
      ip: secondClient,
      cookies: {},
    } as any,
    reply,
  );

  assert.equal(firstClientDecision.allowed, false);
  assert.equal(secondClientDecision.allowed, true);
});

test("rate-limit responses return JSON to APIs and redirect browser navigation", async () => {
  const server = Fastify({ trustProxy: true });
  server.addHook("onRequest", async (request, reply) => {
    const decision = await applyRateLimit(request, reply);
    if (!decision.allowed) {
      const safe = createSafeErrorResponse(
        new Error("Rate limit exceeded"),
        429,
      );
      return reply
        .code(safe.status)
        .send({ error: safe.error, message: safe.message });
    }
  });
  server.addHook("onSend", async (request, reply) => {
    const errorPageUrl =
      reply.statusCode >= 400
        ? getHtmlErrorRedirectUrl(
            request,
            reply.statusCode,
            "https://app.example.test/",
          )
        : null;
    if (errorPageUrl) {
      reply
        .code(303)
        .header("Location", errorPageUrl)
        .type("text/plain; charset=utf-8");
      return "";
    }
  });
  server.post("/api/v001/auth/logout", async () => ({ ok: true }));
  await server.register(internalRoutes);

  try {
    const headers = { "x-forwarded-for": "198.51.100.71" };
    for (let index = 0; index < 10; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/v001/auth/logout",
        headers: { ...headers, accept: "application/json" },
      });
      assert.equal(response.statusCode, 200);
    }

    const apiResponse = await server.inject({
      method: "POST",
      url: "/api/v001/auth/logout",
      headers: { ...headers, accept: "application/json" },
    });
    assert.equal(apiResponse.statusCode, 429, apiResponse.body);
    assert.deepEqual(apiResponse.json(), {
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please retry later.",
    });
    assert.ok(Number(apiResponse.headers["retry-after"]) > 0);

    const browserResponse = await server.inject({
      method: "POST",
      url: "/api/v001/auth/logout",
      headers: { ...headers, accept: "text/html" },
    });
    assert.equal(browserResponse.statusCode, 303);
    assert.equal(
      browserResponse.headers.location,
      "https://app.example.test/error?status=429",
    );

    const nginxApiResponse = await server.inject({
      method: "GET",
      url: "/__nginx_rate_limit",
      headers: { accept: "application/json" },
    });
    assert.equal(nginxApiResponse.statusCode, 429);
    assert.deepEqual(nginxApiResponse.json(), {
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please retry later.",
    });

    const nginxBrowserResponse = await server.inject({
      method: "GET",
      url: "/__nginx_rate_limit",
      headers: { accept: "text/html" },
    });
    assert.equal(nginxBrowserResponse.statusCode, 303);
    assert.equal(
      nginxBrowserResponse.headers.location,
      "https://app.example.test/error?status=429",
    );

    const nginxConfig = await readFile(
      new URL("../../nginx/nginx.conf", import.meta.url),
      "utf8",
    );
    assert.match(nginxConfig, /rewrite \^ \/__nginx_rate_limit break;/);
    assert.match(
      nginxConfig,
      /listen 8081;\s*server_name localhost;\s*location = \/nginx_status \{\s*stub_status;\s*allow 172\.28\.0\.0\/16;\s*deny all;/,
    );
    assert.doesNotMatch(
      nginxConfig,
      /location \/nginx_status \{[\s\S]*?allow all;/,
    );

    for (const composeFile of [
      "../../docker/docker-compose.yml",
      "../../docker/docker-compose.prod.yml",
    ]) {
      const composeConfig = await readFile(
        new URL(composeFile, import.meta.url),
        "utf8",
      );
      assert.match(
        composeConfig,
        /--nginx\.scrape-uri=http:\/\/nginx:8081\/nginx_status/,
      );
    }
  } finally {
    await server.close();
  }
});

test("Fastify only trusts forwarded client metadata from an explicit proxy", async () => {
  async function requestThroughProxy(trustProxy: boolean | string) {
    const server = Fastify({ trustProxy });
    server.get("/metadata", async (request) => ({
      ip: request.ip,
      protocol: request.protocol,
      hostname: request.hostname,
    }));
    try {
      const response = await server.inject({
        method: "GET",
        url: "/metadata",
        remoteAddress: "127.0.0.1",
        headers: {
          host: "localhost",
          "x-forwarded-for": "198.51.100.22",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "app.example.test",
        },
      });
      assert.equal(response.statusCode, 200);
      return response.json() as {
        ip: string;
        protocol: string;
        hostname: string;
      };
    } finally {
      await server.close();
    }
  }

  assert.deepEqual(await requestThroughProxy("127.0.0.1"), {
    ip: "198.51.100.22",
    protocol: "https",
    hostname: "app.example.test",
  });
  assert.deepEqual(await requestThroughProxy("192.0.2.10"), {
    ip: "127.0.0.1",
    protocol: "http",
    hostname: "localhost",
  });
  assert.deepEqual(await requestThroughProxy(false), {
    ip: "127.0.0.1",
    protocol: "http",
    hostname: "localhost",
  });
});
