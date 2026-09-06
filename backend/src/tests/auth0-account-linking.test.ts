import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createAccountLinkProof } from "../utils/account-link-proof.js";

const actionPath = fileURLToPath(
  new URL("../../auth0/post-login/linkAccounts.js", import.meta.url),
);
const require = createRequire(import.meta.url);

type AccountLinkAction = {
  onExecutePostLogin: (event: object, api: object) => Promise<void>;
  onContinuePostLogin: (event: object, api: object) => Promise<void>;
};

async function loadAction() {
  const source = await readFile(actionPath, "utf8");
  const module = { exports: {} as AccountLinkAction };
  vm.runInNewContext(source, {
    exports: module.exports,
    require,
    Buffer,
    console,
    fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch!(...args),
  });
  return module.exports;
}

function actionEvent(users: Array<Record<string, unknown>>) {
  return {
    user: {
      user_id: "auth0|email-user",
      email: "user@example.com",
      email_verified: true,
    },
    secrets: {
      AUTH0_DOMAIN: "tenant.example.test",
      AUTH0_M2M_CLIENT_ID: "client",
      AUTH0_M2M_CLIENT_SECRET: "secret",
      AUTH0_MGMT_AUDIENCE: "https://tenant.example.test/api/v2/",
      ACCOUNT_LINK_ALLOWED_PROVIDERS: "auth0,google-oauth2",
      ACCOUNT_LINK_PROOF_SECRET: "proof-secret",
      NODE_ENV: "development",
      DEV_ACCOUNT_LINK_CONFIRMATION_URL: "https://localhost:8443/confirm",
    },
    users,
  };
}

async function withManagementApi(
  users: Array<Record<string, unknown>>,
  run: (redirects: Array<Record<string, unknown>>) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const redirects: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    if (url.includes("/users-by-email")) return Response.json(users);
    return new Response(null, { status: init?.method === "POST" ? 201 : 200 });
  }) as NonNullable<typeof fetch>;
  try {
    await run(redirects);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Auth0 Action leaves single email and Google identities unchanged", async () => {
  const action = await loadAction();
  for (const onlyUser of [
    { user_id: "auth0|email-user", email_verified: true },
    { user_id: "google-oauth2|google-user", email_verified: true },
  ]) {
    await withManagementApi([onlyUser], async (redirects) => {
      await action.onExecutePostLogin(actionEvent([onlyUser]), {
        redirect: {
          sendUserTo: (url: string, options: Record<string, unknown>) =>
            redirects.push({ url, options }),
        },
      });
      assert.equal(redirects.length, 0);
    });
  }
});

test("Auth0 Action always selects Google as the dual-account primary", async () => {
  const users = [
    { user_id: "auth0|email-user", email_verified: true },
    { user_id: "google-oauth2|google-user", email_verified: true },
  ];
  const action = await loadAction();
  await withManagementApi(users, async (redirects) => {
    await action.onExecutePostLogin(actionEvent(users), {
      redirect: {
        sendUserTo: (url: string, options: { query: Record<string, string> }) =>
          redirects.push({ url, ...options }),
      },
    });
    const query = redirects[0]?.query as Record<string, string>;
    assert.equal(query.primaryUserId, "google-oauth2|google-user");
    assert.equal(query.secondaryUserId, "auth0|email-user");
  });
});

test("Auth0 Action does not redirect the secondary proof login", async () => {
  const users = [
    { user_id: "auth0|email-user", email_verified: true },
    { user_id: "google-oauth2|google-user", email_verified: true },
  ];
  const action = await loadAction();
  await withManagementApi(users, async (redirects) => {
    await action.onExecutePostLogin(
      {
        ...actionEvent(users),
        request: { query: { link_proof: "true" } },
      },
      {
        redirect: {
          sendUserTo: (url: string, options: Record<string, unknown>) =>
            redirects.push({ url, options }),
        },
      },
    );
    assert.equal(redirects.length, 0);
  });
});

test("a confirmed proof links the email identity into the Google primary", async () => {
  const action = await loadAction();
  const primaryUserId = "google-oauth2|google-user";
  const secondaryUserId = "auth0|email-user";
  const proof = createAccountLinkProof(
    primaryUserId,
    secondaryUserId,
    "proof-secret",
  );
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push(init ? { url, init } : { url });
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response(null, { status: 201 });
  }) as NonNullable<typeof fetch>;
  try {
    let primarySetTo: string | undefined;
    await action.onContinuePostLogin(
      {
        ...actionEvent([]),
        request: {
          query: {
            decision: "confirm",
            primaryUserId,
            secondaryUserId,
            proof,
          },
        },
      },
      {
        authentication: { setPrimaryUser: (id: string) => (primarySetTo = id) },
      },
    );
    assert.equal(primarySetTo, primaryUserId);
    assert.equal(
      requests.some((request) =>
        request.url.includes(
          `/users/${encodeURIComponent(primaryUserId)}/identities`,
        ),
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a cancelled first-login identity is deleted and access is denied", async () => {
  const action = await loadAction();
  const temporaryUserId = "google-oauth2|temporary-google-user";
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
    let denial: string | undefined;
    await action.onContinuePostLogin(
      {
        ...actionEvent([]),
        user: {
          user_id: temporaryUserId,
          email: "user@example.com",
          email_verified: true,
        },
        request: {
          query: {
            decision: "cancel",
            primaryUserId: temporaryUserId,
            secondaryUserId: "auth0|email-user",
            temporaryUserId,
          },
        },
      },
      { access: { deny: (reason: string) => (denial = reason) } },
    );
    assert.equal(denial, "account_linking_cancelled");
    assert.equal(
      requests.some(
        (request) =>
          request.url.endsWith(
            `/users/${encodeURIComponent(temporaryUserId)}`,
          ) && request.init?.method === "DELETE",
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed confirmed link denies the login instead of continuing unlinked", async () => {
  const action = await loadAction();
  const primaryUserId = "google-oauth2|google-user";
  const secondaryUserId = "auth0|email-user";
  const proof = createAccountLinkProof(
    primaryUserId,
    secondaryUserId,
    "proof-secret",
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "management-token" });
    }
    return new Response("upstream error", { status: 500 });
  }) as NonNullable<typeof fetch>;
  try {
    let denial: { reason: string; description: string } | undefined;
    await action.onContinuePostLogin(
      {
        ...actionEvent([]),
        request: {
          query: {
            decision: "confirm",
            primaryUserId,
            secondaryUserId,
            proof,
          },
        },
      },
      {
        access: {
          deny: (reason: string, description: string) =>
            (denial = { reason, description }),
        },
      },
    );
    assert.deepEqual(denial, {
      reason: "account_linking_failed",
      description:
        "The accounts could not be linked securely. Please try again.",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
