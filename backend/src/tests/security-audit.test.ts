import test from "node:test";
import assert from "node:assert/strict";

import { logSecurityEvent } from "../utils/security-audit.js";

test("logSecurityEvent strips sensitive authentication data from logs", () => {
  const recorded = logSecurityEvent("csrf_rejected", {
    method: "POST",
    path: "/api/v001/users/me",
    reason: "Invalid CSRF token",
    csrfToken: "super-secret-token",
    cookie: "__Secure-sanny_session=abc; __Secure-sanny_csrf=xyz",
  });

  assert.equal(recorded.event, "csrf_rejected");
  assert.equal(recorded.method, "POST");
  assert.equal(recorded.path, "/api/v001/users/me");
  assert.equal(recorded.reason, "Invalid CSRF token");
  assert.equal(recorded.csrfToken, undefined);
  assert.equal(recorded.cookie, undefined);
  assert.ok(!JSON.stringify(recorded).includes("super-secret-token"));
  assert.ok(!JSON.stringify(recorded).includes("__Secure-sanny_session"));
  assert.ok(!JSON.stringify(recorded).includes("__Secure-sanny_csrf"));
});
