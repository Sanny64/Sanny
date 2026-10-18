import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const actionPath = fileURLToPath(
  new URL(
    "../../auth0/post-user-registration/assignDefaultUserRole.js",
    import.meta.url,
  ),
);

type DefaultUserRoleAction = {
  onExecutePostUserRegistration: (event: object) => Promise<void>;
};

async function loadAction() {
  const source = await readFile(actionPath, "utf8");
  const module = { exports: {} as DefaultUserRoleAction };
  vm.runInNewContext(source, {
    exports: module.exports,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch!(...args),
  });
  return module.exports;
}

test("Post User Registration Action assigns the configured default role", async () => {
  const action = await loadAction();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push(init ? { url, init } : { url });
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response(null, { status: 204 });
  }) as NonNullable<typeof fetch>;

  try {
    await action.onExecutePostUserRegistration({
      user: { user_id: "auth0|new-user" },
      secrets: {
        AUTH0_DOMAIN: "tenant.example.test",
        AUTH0_M2M_CLIENT_ID: "client-id",
        AUTH0_M2M_CLIENT_SECRET: "client-secret",
        AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
        AUTH0_DEFAULT_ROLE_ID: "role-user-id",
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const assignment = requests[1];
  assert.equal(
    assignment?.url,
    "https://tenant.example.test/api/v2/users/auth0%7Cnew-user/roles",
  );
  assert.equal(assignment?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(assignment?.init?.body)), {
    roles: ["role-user-id"],
  });
});
