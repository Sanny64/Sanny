import test from "node:test";
import assert from "node:assert/strict";

import { createSafeErrorResponse } from "../utils/safe-error.js";

test("safe errors hide provider details and keep a stable contract", () => {
  const providerError = createSafeErrorResponse(
    new Error("Auth0 returned access_token=secret and code=abc123"),
    503,
  );

  const databaseError = createSafeErrorResponse(
    new Error("Prisma connection failed while querying users"),
    500,
  );

  assert.deepEqual(providerError, {
    status: 503,
    error: "Service unavailable",
    message: "The service is temporarily unavailable.",
  });

  assert.deepEqual(databaseError, {
    status: 500,
    error: "Internal server error",
    message: "An internal error occurred.",
  });

  assert.ok(!JSON.stringify(providerError).includes("access_token"));
  assert.ok(!JSON.stringify(providerError).includes("abc123"));
  assert.ok(
    !JSON.stringify(databaseError).includes("Prisma connection failed"),
  );
});
