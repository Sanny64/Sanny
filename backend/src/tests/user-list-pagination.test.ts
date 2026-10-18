import test from "node:test";
import assert from "node:assert/strict";

import { normalizeUserListQuery } from "../services/user.service.js";

test("admin user list pagination clamps invalid values and preserves ordering", () => {
  assert.deepEqual(normalizeUserListQuery({ page: "0", limit: "999" }), {
    page: 1,
    limit: 50,
  });

  assert.deepEqual(normalizeUserListQuery({ page: "2", limit: "10" }), {
    page: 2,
    limit: 10,
  });

  assert.deepEqual(normalizeUserListQuery({}), {
    page: 1,
    limit: 25,
  });
});
