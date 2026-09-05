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

async function loadAction() {
  const source = await readFile(actionPath, "utf8");
  const module = { exports: {} as RoleClaimsAction };
  vm.runInNewContext(source, {
    exports: module.exports,
    console,
  });
  return module.exports;
}

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
        email: "test.user00@gmail.com",
        name: "Test User",
        nickname: "test.user00",
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

  assert.equal(claims["https://sanny64.app/name"], "Test User");
});

test("social primary users prefer the managed username after account linking", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        email: "user@example.com",
        name: "Google Profile Name",
        user_metadata: { username: "managed-username" },
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

  assert.equal(claims["https://sanny64.app/name"], "managed-username");
});

test("social-connection users fall back to nickname only when no display name is available", async () => {
  const action = await loadAction();
  const { api, claims } = createApi();

  await action.onExecutePostLogin(
    {
      connection: { strategy: "google-oauth2" },
      user: {
        email: "test.user00@gmail.com",
        nickname: "test.user00",
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

  assert.equal(claims["https://sanny64.app/name"], "test.user00");
});
