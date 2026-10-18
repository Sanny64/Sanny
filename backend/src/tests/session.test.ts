import test from "node:test";
import assert from "node:assert/strict";
import { clearSessionCookies, setSessionCookies } from "../utils/session.js";

test("setSessionCookies uses host-only cookies without a parent-domain override", () => {
  process.env.SESSION_COOKIE_DOMAIN = "example.com";

  const calls: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  const reply = {
    setCookie(name: string, value: string, options: Record<string, unknown>) {
      calls.push({ name, value, options });
    },
  };

  setSessionCookies(reply as never, "session-id", "csrf-token");

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.name),
    ["__Host-sanny_session", "__Host-sanny_csrf"],
  );
  assert.equal(calls[0]!.options.domain, undefined);
  assert.equal(calls[0]!.options.path, "/");
  assert.equal(calls[0]!.options.secure, true);
  assert.equal(calls[0]!.options.httpOnly, true);
  assert.equal(calls[1]!.options.domain, undefined);
  assert.equal(calls[1]!.options.path, "/");
  assert.equal(calls[1]!.options.secure, true);
  assert.equal(calls[1]!.options.httpOnly, false);

  delete process.env.SESSION_COOKIE_DOMAIN;
});

test("clearSessionCookies removes host-only cookies without a parent-domain override", () => {
  process.env.SESSION_COOKIE_DOMAIN = "example.com";

  const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
  const reply = {
    clearCookie(name: string, options: Record<string, unknown>) {
      calls.push({ name, options });
    },
  };

  clearSessionCookies(reply as never);

  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => call.name),
    ["__Host-sanny_session", "__Host-sanny_csrf"],
  );
  assert.equal(calls[0]!.options.domain, undefined);
  assert.equal(calls[0]!.options.path, "/");
  assert.equal(calls[1]!.options.domain, undefined);
  assert.equal(calls[1]!.options.path, "/");

  delete process.env.SESSION_COOKIE_DOMAIN;
});
