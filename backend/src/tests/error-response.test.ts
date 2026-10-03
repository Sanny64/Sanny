import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptsHtmlNavigation,
  getErrorPageRedirectUrl,
} from "../utils/error-response.js";

test("browser navigation requests are distinguished from API requests", () => {
  assert.equal(
    acceptsHtmlNavigation({
      headers: { accept: "text/html,application/xhtml+xml" },
    }),
    true,
  );
  assert.equal(acceptsHtmlNavigation({ headers: { accept: "*/*" } }), false);
  assert.equal(
    acceptsHtmlNavigation({ headers: { accept: "text/html;q=0" } }),
    false,
  );
});

test("error redirects target the configured frontend error page", () => {
  assert.equal(
    getErrorPageRedirectUrl("https://sanny64.de/app?old=value#section", 429),
    "https://sanny64.de/error?status=429",
  );
  assert.equal(
    getErrorPageRedirectUrl("https://localhost:5173/", 200),
    "https://localhost:5173/error?status=500",
  );
});
