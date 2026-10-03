import test from "node:test";
import assert from "node:assert/strict";

import {
  applySecurityHeaders,
  getHstsPolicy,
} from "../utils/security-headers.js";

test("HSTS is enabled only for production with subdomains covered", () => {
  assert.deepEqual(getHstsPolicy("production"), {
    maxAge: 31536000,
    includeSubDomains: true,
  });
  assert.equal(getHstsPolicy("development"), false);
});

test("custom security headers include permissions policy and API no-store cache", () => {
  const headers = new Map<string, string>();
  const reply = {
    header: (name: string, value: string) => {
      headers.set(name, value);
      return reply;
    },
  } as any;

  applySecurityHeaders(
    { url: "/api/v001/auth/callback", method: "GET" },
    reply,
  );

  assert.equal(
    headers.get("Permissions-Policy"),
    "camera=(), microphone=(), geolocation=()",
  );
  assert.equal(headers.get("Cache-Control"), "no-store");
});
