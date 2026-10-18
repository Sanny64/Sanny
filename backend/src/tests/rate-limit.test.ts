import test from "node:test";
import assert from "node:assert/strict";

import { getRateLimitConfig, isRateLimitRoute } from "../utils/rate-limit.js";

test("auth routes are rate limited with a strict limit", () => {
  const authConfig = getRateLimitConfig("/api/v001/auth", "GET");
  const postAuthConfig = getRateLimitConfig("/api/v001/auth", "POST");
  const logoutConfig = getRateLimitConfig("/api/v001/auth/logout", "POST");

  assert.equal(authConfig.max, 10);
  assert.equal(postAuthConfig.max, 10);
  assert.equal(logoutConfig.group, "logout");
  assert.equal(authConfig.windowMs, 60_000);
  assert.equal(
    isRateLimitRoute("/api/v001/auth?next=random-value", "GET"),
    true,
  );
  assert.equal(isRateLimitRoute("/api/v001/auth", "POST"), true);
  assert.equal(isRateLimitRoute("/api/v001/auth/logout", "POST"), true);
  assert.equal(
    isRateLimitRoute("/api/v001/auth/callback?code=random-value", "GET"),
    true,
  );
  assert.equal(isRateLimitRoute("/api/v001/users/me"), true);
});

test("sensitive user mutation routes are rate limited", () => {
  const mutationConfig = getRateLimitConfig("/api/v001/users/me", "PATCH");
  assert.equal(mutationConfig.max, 12);
  assert.equal(mutationConfig.windowMs, 60_000);
  assert.equal(
    getRateLimitConfig("/api/v001/users/123/roles", "PATCH").group,
    "admin-expensive",
  );
});
