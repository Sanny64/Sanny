import assert from "node:assert/strict";
import test from "node:test";
import { updateAuth0UsernameBySub } from "../utils/auth0-management.js";

const auth0Environment = {
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_M2M_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_SECRET: "client-secret",
  AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
};

async function captureProfileUpdate(auth0Sub: string) {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);
  let updateRequest: RequestInit | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    updateRequest = init;
    return new Response(null, { status: 200 });
  }) as NonNullable<typeof fetch>;

  try {
    await updateAuth0UsernameBySub(auth0Sub, "new-name");
    return JSON.parse(String(updateRequest?.body));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("database users update Auth0 display name and user metadata", async () => {
  assert.deepEqual(await captureProfileUpdate("auth0|database-user"), {
    name: "new-name",
    user_metadata: { username: "new-name" },
  });
});

test("social users update Auth0 metadata without modifying synced profile fields", async () => {
  assert.deepEqual(await captureProfileUpdate("google-oauth2|social-user"), {
    user_metadata: { username: "new-name" },
  });
});
