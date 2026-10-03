import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePendingActionValue } from "../utils/mfa-reauth.js";

test("pending action sanitization drops prototype-sensitive keys recursively", () => {
  const input = JSON.parse(
    '{"safe":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true}}}',
  ) as Record<string, unknown>;

  const sanitized = sanitizePendingActionValue(input) as Record<
    string,
    Record<string, unknown>
  >;
  assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), { safe: {} });
  assert.equal(Object.getPrototypeOf(sanitized), null);
  assert.equal(Object.getPrototypeOf(sanitized.safe), null);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});
