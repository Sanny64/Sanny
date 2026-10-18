import test from "node:test";
import assert from "node:assert/strict";

import { getAuth0PurgeUserSearchQuery } from "../utils/auth0-management.js";

test("Auth0 purge search defaults to Auth0 database provider users", () => {
  const previousConnection = process.env.AUTH0_PURGE_CONNECTION;

  try {
    delete process.env.AUTH0_PURGE_CONNECTION;
    assert.equal(getAuth0PurgeUserSearchQuery(), 'identities.provider:"auth0"');

    process.env.AUTH0_PURGE_CONNECTION = "Username-Password-Authentication";
    assert.equal(
      getAuth0PurgeUserSearchQuery(),
      'identities.connection:"Username-Password-Authentication"',
    );
  } finally {
    if (previousConnection === undefined)
      delete process.env.AUTH0_PURGE_CONNECTION;
    else process.env.AUTH0_PURGE_CONNECTION = previousConnection;
  }
});
