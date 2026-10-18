import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const actionPath = fileURLToPath(
  new URL("../../auth0/post-login/roleClaims.js", import.meta.url),
);

type RoleClaimsAction = {
  onExecutePostLogin: (event: object, api: object) => Promise<void>;
};

async function loadAction(
  fetchImpl: typeof fetch = async (input) => {
    if (String(input).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response(null, { status: 204 });
  },
) {
  const source = await readFile(actionPath, "utf8");
  const module = { exports: {} as RoleClaimsAction };
  vm.runInNewContext(source, {
    exports: module.exports,
    console,
    fetch: (...args: Parameters<typeof fetch>) => fetchImpl(...args),
  });
  return module.exports;
}

const socialActionSecrets = {
  AUTH0_CLAIM_NAMESPACE: "https://sanny64.app",
  AUTH0_EMAIL_VERIFIED_CLAIM: "https://sanny64.app/email_verified",
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_M2M_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_SECRET: "client-secret",
  AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
  AUTH0_DEFAULT_ROLE_ID: "role-user-id",
};

function createApi() {
  const claims: Record<string, unknown> = {};
  return {
    api: {
      accessToken: {
        setCustomClaim: (key: string, value: unknown) => {
          claims[key] = value;
        },
      },
    },
    claims,
  };
}

test("database-connection users keep their chosen username as the name claim", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "auth0" },
      user: {
        email: "user@example.com",
        username: "chosen-username",
        name: "Ignored Auth0 Name",
        nickname: "ignored-nickname",
        email_verified: true,
      },
      authorization: { roles: [] },
      secrets: {
        AUTH0_CLAIM_NAMESPACE: "https://sanny64.app",
        AUTH0_EMAIL_VERIFIED_CLAIM: "https://sanny64.app/email_verified",
      },
    },
    api,
  );

  assert.equal(claims["https://sanny64.app/name"], "chosen-username");
});

test("social-connection users get their resolved display name, not the email-derived nickname", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        user_id: "google-oauth2|social-user",
        email: "test.user00@gmail.com",
        name: "Test User",
        nickname: "test.user00",
        email_verified: true,
      },
      authorization: { roles: [] },
      secrets: socialActionSecrets,
    },
    api,
  );

  assert.equal(claims["https://sanny64.app/name"], "Test User");
});

test("social primary users prefer the managed username after account linking", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        user_id: "google-oauth2|linked-user",
        email: "user@example.com",
        name: "Google Profile Name",
        user_metadata: { username: "managed-username" },
        email_verified: true,
      },
      authorization: { roles: [] },
      secrets: socialActionSecrets,
    },
    api,
  );

  assert.equal(claims["https://sanny64.app/name"], "managed-username");
});

test("social-connection users fall back to nickname only when no display name is available", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        user_id: "google-oauth2|nickname-user",
        email: "test.user00@gmail.com",
        nickname: "test.user00",
        email_verified: true,
      },
      authorization: { roles: [] },
      secrets: socialActionSecrets,
    },
    api,
  );

  assert.equal(claims["https://sanny64.app/name"], "test.user00");
});

test("social users receive the default Auth0 role and role claim when missing", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const action = await loadAction(async (input, init) => {
    requests.push({ url: String(input), ...(init ? { init } : {}) });
    if (String(input).endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response(null, { status: 204 });
  });
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        user_id: "google-oauth2|new-user",
        email: "new-user@example.com",
        email_verified: true,
      },
      authorization: { roles: [] },
      secrets: socialActionSecrets,
    },
    api,
  );

  assert.equal(requests[0]?.url, "https://tenant.example.test/oauth/token");
  assert.equal(
    requests[1]?.url,
    "https://tenant.example.test/api/v2/users/google-oauth2%7Cnew-user/roles",
  );
  assert.equal(requests[1]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    roles: ["role-user-id"],
  });
  assert.equal(
    JSON.stringify(claims["https://sanny64.app/roles"]),
    JSON.stringify(["user"]),
  );
});
