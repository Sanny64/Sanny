import assert from "node:assert/strict";
import test from "node:test";
import { sendAuth0PasswordResetEmail } from "../utils/auth0-management.js";

const auth0Environment = {
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_CLIENT_ID: "client-id",
  AUTH0_DATABASE_CONNECTION: "Username-Password-Authentication",
};

test("password reset requests Auth0's configured database connection", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    request = init ? { url, init } : { url };
    return new Response("email sent", { status: 200 });
  }) as NonNullable<typeof fetch>;

  try {
    await sendAuth0PasswordResetEmail("user@example.com");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(
    request?.url,
    "https://tenant.example.test/dbconnections/change_password",
  );
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    client_id: "client-id",
    connection: "Username-Password-Authentication",
    email: "user@example.com",
  });
});
