import assert from "node:assert/strict";
import test from "node:test";
import {
  Auth0ManagementError,
  deleteAuth0UserBySub,
} from "../utils/auth0-management.js";

const auth0Environment = {
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_M2M_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_SECRET: "client-secret",
};

test("deletes Google, password, and linked-primary users by Auth0 subject", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);
  const deleteRequests: Array<{ url: string; method?: string }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    deleteRequests.push({
      url: String(url),
      ...(init?.method ? { method: init.method } : {}),
    });
    return new Response(null, { status: 204 });
  }) as NonNullable<typeof fetch>;

  try {
    for (const auth0Sub of [
      "google-oauth2|google-user",
      "auth0|password-user",
      "google-oauth2|linked-primary",
    ]) {
      await deleteAuth0UserBySub(auth0Sub);
    }

    assert.deepEqual(deleteRequests, [
      {
        url: "https://tenant.example.test/api/v2/users/google-oauth2%7Cgoogle-user",
        method: "DELETE",
      },
      {
        url: "https://tenant.example.test/api/v2/users/auth0%7Cpassword-user",
        method: "DELETE",
      },
      {
        url: "https://tenant.example.test/api/v2/users/google-oauth2%7Clinked-primary",
        method: "DELETE",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("retries transient Auth0 deletion failures and stops on permanent denial", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);

  try {
    let attempts = 0;
    const statuses = [503, 429, 204];
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/oauth/token")) {
        return Response.json({ access_token: "management-token" });
      }
      const status = statuses[attempts++] ?? 500;
      return new Response(null, {
        status,
        headers: { "retry-after": "0" },
      });
    }) as typeof fetch;

    await deleteAuth0UserBySub("auth0|retry-user");
    assert.equal(attempts, 3);

    attempts = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/oauth/token")) {
        return Response.json({ access_token: "management-token" });
      }
      attempts++;
      return new Response("denied", { status: 403 });
    }) as typeof fetch;
    await assert.rejects(
      deleteAuth0UserBySub("auth0|forbidden-user"),
      (error: unknown) => {
        assert.ok(error instanceof Auth0ManagementError);
        assert.equal(error.statusCode, 403);
        return true;
      },
    );
    assert.equal(attempts, 1);

    attempts = 0;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/oauth/token")) {
        return Response.json({ access_token: "management-token" });
      }
      attempts++;
      return new Response("temporary failure", {
        status: 503,
        headers: { "retry-after": "0" },
      });
    }) as typeof fetch;
    await assert.rejects(
      deleteAuth0UserBySub("auth0|exhausted-user"),
      (error: unknown) => {
        assert.ok(error instanceof Auth0ManagementError);
        assert.equal(error.statusCode, 503);
        return true;
      },
    );
    assert.equal(attempts, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
