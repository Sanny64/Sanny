import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveRefreshTokenRotation,
  rotateSessionRecord,
  shouldRotateSession,
} from "../utils/session-rotation.js";

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
