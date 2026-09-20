import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllRoles,
  isRoleSyncEnabled,
} from "../utils/auth0-management.js";

test("role sync stays disabled by default and only allows configured roles", async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previous = process.env.AUTH0_ROLE_SYNC_ENABLED;
  const originalFetch = globalThis.fetch;
  const auth0Keys = ["AUTH0_DOMAIN", "AUTH0_M2M_CLIENT_ID", "AUTH0_M2M_CLIENT_SECRET", "AUTH0_MGMT_AUDIENCE"];
  const originalEnvValues = Object.fromEntries(auth0Keys.map(key => [key, process.env[key]]));

  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    if (url.includes("/roles?")) {
      return Response.json([
        { id: "1", name: "admin" },
        { id: "2", name: "user" }
      ]);
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  try {
    process.env.NODE_ENV = "development";
    process.env.AUTH0_ROLE_SYNC_ENABLED = "false"; 
    
    assert.equal(isRoleSyncEnabled(), false, "Sync should be disabled");
    assert.deepEqual(await getAllRoles(), [], "Should return an empty array when disabled");

    Object.assign(process.env, {
      AUTH0_ROLE_SYNC_ENABLED: "true",
      AUTH0_DOMAIN: "tenant.location.example.test",
      AUTH0_M2M_CLIENT_ID: "client-id",
      AUTH0_M2M_CLIENT_SECRET: "client-secret",
      AUTH0_MGMT_AUDIENCE: "https://example.test",
    });

    assert.equal(isRoleSyncEnabled(), true, "Sync should be enabled");
    assert.deepEqual(await getAllRoles(), [
      { id: "1", name: "admin" },
      { id: "2", name: "user" }
    ], "Should return roles array when enabled");

  } finally {

    globalThis.fetch = originalFetch;
    
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;

    if (previous === undefined) delete process.env.AUTH0_ROLE_SYNC_ENABLED;
    else process.env.AUTH0_ROLE_SYNC_ENABLED = previous;

    for (const [key, value] of Object.entries(originalEnvValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
