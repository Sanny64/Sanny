import test from "node:test";
import assert from "node:assert/strict";

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from "../utils/session.js";

test("session and CSRF cookies use host-only settings without a parent-domain override", () => {
  const calls: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  const reply = {
    setCookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => {
      calls.push({ name, value, options });
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      calls.push({ name, value: "", options });
    },
  } as const;

  setSessionCookies(reply as any, "session-123", "csrf-456");
  clearSessionCookies(reply as any);

  assert.equal(calls[0]?.name, "__Host-sanny_session");
  assert.equal(calls[1]?.name, "__Host-sanny_csrf");
  assert.equal(calls[0]?.options.domain, undefined);
  assert.equal(calls[1]?.options.domain, undefined);
  assert.equal(calls[0]?.options.secure, true);
  assert.equal(calls[1]?.options.secure, true);

  assert.equal(calls[2]?.name, "__Host-sanny_session");
  assert.equal(calls[2]?.options.domain, undefined);
  assert.equal(calls[3]?.name, "__Host-sanny_csrf");
  assert.equal(calls[3]?.options.domain, undefined);
  assert.equal(calls[2]?.options.secure, true);
  assert.equal(calls[3]?.options.secure, true);
  assert.equal(SESSION_COOKIE, "__Host-sanny_session");
  assert.equal(CSRF_COOKIE, "__Host-sanny_csrf");
});
