import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { getAccessTokenIdentity } from "../utils/access-token.js";

test("reads the required API access-token claims", () => {
  const previousAudience = process.env.AUTH0_AUDIENCE;
  process.env.AUTH0_AUDIENCE = "https://api.sanny64.de";

  try {
    const request = {
      user: {
        aud: "https://api.sanny64.de",
        sub: "auth0|user-123",
        "https://sanny64.app/roles": ["user"],
        permissions: ["read:me"],
        "https://sanny64.app/email": "user@example.com",
        "https://sanny64.app/name": "Test User",
      },
    } as unknown as FastifyRequest;

    assert.deepEqual(getAccessTokenIdentity(request), {
      audiences: ["https://api.sanny64.de"],
      email: "user@example.com",
      emailVerified: false,
      name: "Test User",
      permissions: ["read:me"],
      roles: ["user"],
      sub: "auth0|user-123",
    });
  } finally {
    if (previousAudience === undefined) {
      delete process.env.AUTH0_AUDIENCE;
    } else {
      process.env.AUTH0_AUDIENCE = previousAudience;
    }
  }
});
