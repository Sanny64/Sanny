import test from "node:test";
import assert from "node:assert/strict";

import { applyRateLimit } from "../utils/rate-limit.js";

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
