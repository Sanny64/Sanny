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
    assert.equal(query.proofUserId, "google-oauth2|google-user");
  });
});

test("Google login requests password ownership proof while keeping Google primary", async () => {
  const users = [
    { user_id: "auth0|email-user", email_verified: true },
    { user_id: "google-oauth2|google-user", email_verified: true },
  ];
  const action = await loadAction();
  await withManagementApi(users, async (redirects) => {
    const event = actionEvent(users);
    await action.onExecutePostLogin(
      {
        ...event,
        user: { ...event.user, user_id: "google-oauth2|google-user" },
      },
      {
        redirect: {
          sendUserTo: (
            url: string,
            options: { query: Record<string, string> },
          ) => redirects.push({ url, ...options }),
        },
      },
    );
    const query = redirects[0]?.query as Record<string, string>;
    assert.equal(query.primaryUserId, "google-oauth2|google-user");
    assert.equal(query.secondaryUserId, "auth0|email-user");
    assert.equal(query.proofUserId, "auth0|email-user");
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

test("an already linked database login selects the Google primary before honoring a confirmed decision", async () => {
  const primary = {
    user_id: "google-oauth2|google-user",
    email_verified: true,
    identities: [
      { provider: "google-oauth2", user_id: "google-user" },
      { provider: "auth0", user_id: "email-user" },
    ],
  };
  const action = await loadAction();
  for (const users of [
    [primary],
    [primary, { user_id: "auth0|email-user", email_verified: true }],
  ]) {
    await withManagementApi(users, async (redirects) => {
      let selectedPrimary: string | undefined;
      const event = actionEvent(users);
      await action.onExecutePostLogin(
        {
          ...event,
          user: {
            ...event.user,
            app_metadata: {
              pending_account_link: { decision: "confirmed" },
            },
          },
        },
        {
          authentication: {
            setPrimaryUser: (id: string) => (selectedPrimary = id),
          },
          redirect: {
            sendUserTo: (url: string) => redirects.push({ url }),
          },
        },
      );
      assert.equal(selectedPrimary, primary.user_id);
      assert.equal(redirects.length, 0);
    });
  }
});

test("matching email or confirmed metadata without a linked identity never switches the primary", async () => {
  const action = await loadAction();
  for (const identities of [
    [],
    [{ provider: "auth0", user_id: "another-user" }],
  ]) {
    const users = [
      { user_id: "auth0|email-user", email_verified: true },
      {
        user_id: "google-oauth2|google-user",
        email_verified: true,
        identities,
      },
    ];
    await withManagementApi(users, async () => {
      const event = actionEvent(users);
      await action.onExecutePostLogin(
        {
          ...event,
          user: {
            ...event.user,
            app_metadata: {
              pending_account_link: { decision: "confirmed" },
            },
          },
        },
        {
          authentication: {
            setPrimaryUser: () =>
              assert.fail("Unlinked identity must not be promoted"),
          },
        },
      );
    });
  }
});

test("secondary ownership proof keeps its database subject even when already linked", async () => {
  const users = [
    {
      user_id: "google-oauth2|google-user",
      email_verified: true,
      identities: [{ provider: "auth0", user_id: "email-user" }],
    },
  ];
  const action = await loadAction();
  await withManagementApi(users, async () => {
    await action.onExecutePostLogin(
      { ...actionEvent(users), request: { query: { link_proof: "true" } } },
      {
        authentication: {
          setPrimaryUser: () =>
            assert.fail("Proof must retain the secondary subject"),
        },
      },
    );
  });
});

test("failure to select a proven linked primary denies login", async () => {
  const users = [
    {
      user_id: "google-oauth2|google-user",
      email_verified: true,
      identities: [{ provider: "auth0", user_id: "email-user" }],
    },
  ];
  const action = await loadAction();
  await withManagementApi(users, async () => {
    let denied: string | undefined;
    await action.onExecutePostLogin(actionEvent(users), {
      authentication: {
        setPrimaryUser: () => {
          throw new Error("Primary switch failed");
        },
      },
      access: { deny: (reason: string) => (denied = reason) },
    });
    assert.equal(denied, "account_linking_failed");
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
    Date.now(),
    primaryUserId,
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
    Date.now(),
    primaryUserId,
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

test("proof of the already authenticated account cannot authorize linking", async () => {
  const action = await loadAction();
  const primaryUserId = "google-oauth2|google-user";
  const secondaryUserId = "auth0|email-user";
  for (const currentUserId of [primaryUserId, secondaryUserId]) {
    const proof = createAccountLinkProof(
      primaryUserId,
      secondaryUserId,
      "proof-secret",
      Date.now(),
      currentUserId,
    );
    await withManagementApi([], async () => {
      let denial: string | undefined;
      const event = actionEvent([]);
      await action.onContinuePostLogin(
        {
          ...event,
          user: { ...event.user, user_id: currentUserId },
          request: {
            query: {
              decision: "confirm",
              primaryUserId,
              secondaryUserId,
              proof,
            },
          },
        },
        { access: { deny: (reason: string) => (denial = reason) } },
      );
      assert.equal(denial, "account_linking_failed");
    });
  }
});

test("Google login can link using proof of database account ownership", async () => {
  const action = await loadAction();
  const primaryUserId = "google-oauth2|google-user";
  const secondaryUserId = "auth0|email-user";
  const proof = createAccountLinkProof(
    primaryUserId,
    secondaryUserId,
    "proof-secret",
    Date.now(),
    secondaryUserId,
  );
  await withManagementApi([], async () => {
    let denied = false;
    const event = actionEvent([]);
    await action.onContinuePostLogin(
      {
        ...event,
        user: { ...event.user, user_id: primaryUserId },
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
          deny: () => {
            denied = true;
          },
        },
      },
    );
    assert.equal(denied, false);
  });
});
