import test from "node:test";
import assert from "node:assert/strict";

import { isSwaggerEnabled } from "../utils/config.js";

test("swagger policy stays disabled in production unless explicitly enabled", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.ENABLE_SWAGGER;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_SWAGGER;
    assert.equal(isSwaggerEnabled(), false);

    process.env.ENABLE_SWAGGER = "true";
    assert.equal(isSwaggerEnabled(), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousEnabled === undefined) delete process.env.ENABLE_SWAGGER;
    else process.env.ENABLE_SWAGGER = previousEnabled;
  }
});
