import test from "node:test";
import assert from "node:assert/strict";

import { logSecurityEvent } from "../utils/security-audit.js";

test("logSecurityEvent strips sensitive authentication data from logs", () => {
  const recorded = logSecurityEvent("csrf_rejected", {
    method: "POST",
    path: "/api/v001/users/me",
    reason: "Invalid CSRF token",
    csrfToken: "super-secret-token",
    cookie: "__Host-sanny_session=abc; __Host-sanny_csrf=xyz",
  });

  assert.equal(recorded.event, "csrf_rejected");
  assert.equal(recorded.method, "POST");
  assert.equal(recorded.path, "/api/v001/users/me");
  assert.equal(recorded.reason, "Invalid CSRF token");
  assert.equal(recorded.csrfToken, undefined);
  assert.equal(recorded.cookie, undefined);
  assert.ok(!JSON.stringify(recorded).includes("super-secret-token"));
  assert.ok(!JSON.stringify(recorded).includes("__Host-sanny_session"));
  assert.ok(!JSON.stringify(recorded).includes("__Host-sanny_csrf"));
});

test("logSecurityEvent removes identifiers and query strings", () => {
  const recorded = logSecurityEvent("admin_user_update_failed", {
    userId: 42,
    auth0Sub: "auth0|private-user",
    email: "private@example.test",
    ip: "203.0.113.1",
    path: "/api/v001/users/42?code=private-code",
  });

  assert.equal(recorded.userId, undefined);
  assert.equal(recorded.auth0Sub, undefined);
  assert.equal(recorded.email, undefined);
  assert.equal(recorded.ip, undefined);
  assert.equal(recorded.path, "/api/v001/users/:id");
  assert.doesNotMatch(
    JSON.stringify(recorded),
    /private-user|private@example|203\.0\.113\.1|private-code/,
  );
});
