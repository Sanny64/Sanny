import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllowedRoleNames,
  isRoleSyncEnabled,
} from "../utils/auth0-management.js";

test("role sync stays disabled by default and only allows configured roles", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previous = process.env.AUTH0_ROLE_SYNC_ENABLED;
  const previousAllowed = process.env.AUTH0_ASSIGNABLE_ROLES;

  try {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH0_ROLE_SYNC_ENABLED;
    delete process.env.AUTH0_ASSIGNABLE_ROLES;
    assert.equal(isRoleSyncEnabled(), false);
    assert.deepEqual(getAllowedRoleNames(), []);

    process.env.AUTH0_ROLE_SYNC_ENABLED = "true";
    process.env.AUTH0_ASSIGNABLE_ROLES = "admin,editor, viewer";
    assert.equal(isRoleSyncEnabled(), true);
    assert.deepEqual(getAllowedRoleNames(), ["admin", "editor", "viewer"]);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;

    if (previous === undefined) delete process.env.AUTH0_ROLE_SYNC_ENABLED;
    else process.env.AUTH0_ROLE_SYNC_ENABLED = previous;

    if (previousAllowed === undefined)
      delete process.env.AUTH0_ASSIGNABLE_ROLES;
    else process.env.AUTH0_ASSIGNABLE_ROLES = previousAllowed;
  }
});
