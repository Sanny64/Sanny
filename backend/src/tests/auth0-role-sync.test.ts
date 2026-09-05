import assert from "node:assert/strict";
import test from "node:test";
import { syncAuth0UserRolesByName } from "../utils/auth0-management.js";

const auth0Environment = {
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_M2M_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_SECRET: "client-secret",
  AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
};

test("role synchronization assigns requested roles and removes unrequested roles", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push(init ? { url, init } : { url });
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    if (url.includes("/roles?")) {
      return Response.json([
        { id: "role-user", name: "user" },
        { id: "role-admin", name: "admin" },
      ]);
    }
    if (url.endsWith("/users/auth0%7Cuser/roles") && !init?.method) {
      return Response.json([{ id: "role-user", name: "user" }]);
    }
    return new Response(null, { status: 204 });
  }) as NonNullable<typeof fetch>;

  try {
    assert.deepEqual(await syncAuth0UserRolesByName("auth0|user", ["admin"]), {
      roles: ["admin"],
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const roleRequests = requests.filter((request) =>
    request.url.endsWith("/users/auth0%7Cuser/roles"),
  );
  assert.deepEqual(JSON.parse(String(roleRequests[1]?.init?.body)), {
    roles: ["role-admin"],
  });
  assert.equal(roleRequests[2]?.init?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(roleRequests[2]?.init?.body)), {
    roles: ["role-user"],
  });
});
