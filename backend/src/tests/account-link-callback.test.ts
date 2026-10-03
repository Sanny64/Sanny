import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

type StoredState = {
  codeVerifier: string;
  returnTo?: string;
  emailMfa?: boolean;
  accountLinkRetry?: boolean;
};

type CallbackRequest = {
  query: { code: string; state: string };
};
type CallbackReply = {
  redirect: (url: string) => string;
};
type CallbackHandler = (
  request: CallbackRequest,
  reply: CallbackReply,
) => Promise<string>;
type AuthorizationHandler = (
  request: { query: Record<string, string | undefined> },
  reply: CallbackReply,
) => Promise<string>;

class SubjectConflict extends Error {}

async function callbackHarness(options: {
  sub?: string;
  email?: string;
  name?: string;
  createUser?: boolean;
  existingSub?: string;
  linked?: boolean;
  state?: StoredState;
}) {
  const source = await readFile(
    new URL("../routes/auth.route.ts", import.meta.url),
    "utf8",
  );
  const states = new Map<string, StoredState>([
    ["original-state", options.state ?? { codeVerifier: "original-verifier" }],
  ]);
  let cookies = ["other-tab-state", "original-state"];
  let sessions = 0;
  let sessionCookies = 0;
  let reconciliations = 0;
  const createdUsers: Array<{
    auth0Sub: string;
    email: string;
    username: string;
  }> = [];
  const verifiedSubjects: string[] = [];
  let callback: CallbackHandler | undefined;
  let authorization: AuthorizationHandler | undefined;
  const events: string[] = [];
  const modules: Record<string, object> = {
    "../utils/config.js": {
      getCallbackUrl: () => "https://api.example.test/api/v001/auth/callback",
      getSuccessRedirectUrl: () => "https://app.example.test",
      requiredEnv: (name: string) => {
        const values: Record<string, string> = {
          AUTH0_DOMAIN: "tenant.example.test",
          AUTH0_CLIENT_ID: "client",
          AUTH0_CLIENT_SECRET: "secret",
          AUTH0_AUDIENCE: "https://api.example.test",
        };
        assert.ok(values[name], `Unexpected environment key: ${name}`);
        return values[name];
      },
    },
    "../utils/refresh-token.js": {
      buildAuthorizationScope: () => "openid profile email offline_access",
    },
    "../utils/access-token.js": {
      verifyAccessTokenIdentity: async () => ({
        sub: options.sub ?? "auth0|password-user",
        email: options.email ?? "user@example.test",
        emailVerified: true,
        name: options.name ?? "User",
      }),
      verifyIdTokenMfa: async () => true,
    },
    "../utils/session.js": {
      getLoginStates: () => cookies,
      setLoginStates: (_reply: unknown, values: string[]) => (cookies = values),
      consumeLoginState: async (state: string) => {
        const stored = states.get(state);
        states.delete(state);
        return stored;
      },
      createLoginState: async (
        codeVerifier: string,
        returnTo: string | undefined,
        emailMfa: boolean,
        accountLinkRetry: boolean,
      ) => {
        states.set("retry-state", {
          codeVerifier,
          ...(returnTo ? { returnTo } : {}),
          ...(emailMfa ? { emailMfa } : {}),
          ...(accountLinkRetry ? { accountLinkRetry } : {}),
        });
        return "retry-state";
      },
      createSession: async () => {
        sessions++;
        return { sessionId: "session", csrfToken: "csrf" };
      },
      setSessionCookies: () => {
        sessionCookies++;
      },
      cancelPendingAccountLink: async () => {},
    },
    "../services/user.service.js": {
      Auth0SubjectConflictError: SubjectConflict,
      createOrGetSelfUser: async (user: (typeof createdUsers)[number]) => {
        if (options.createUser) {
          createdUsers.push(user);
          return;
        }
        throw new SubjectConflict();
      },
      findSelfUserByEmail: async () => ({
        id: 42,
        auth0Sub: options.existingSub ?? "google-oauth2|google-user",
      }),
      updateSelfUserPrimarySub: async () => {
        reconciliations++;
      },
      updateUserEmailVerifiedBySub: async (sub: string) => {
        verifiedSubjects.push(sub);
      },
    },
    "../utils/auth0-management.js": {
      isAuth0IdentityLinked: async () => options.linked ?? false,
    },
    "../utils/security-audit.js": {
      logSecurityEvent: (event: string) => events.push(event),
    },
  };
  const module = {
    exports: {} as {
      default: (server: object) => Promise<void>;
    },
  };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: module.exports,
      require: (name: string) => {
        if (name.startsWith("node:") || name === "zod") return require(name);
        if (modules[name]) return modules[name];
        if (
          [
            "../controllers/auth.controller.js",
            "../schemas/auth.schema.js",
            "../utils/account-link-proof.js",
            "../utils/mfa-reauth.js",
            "../utils/account-link-continuation.js",
          ].includes(name)
        ) {
          return {};
        }
        throw new Error(`Unexpected module: ${name}`);
      },
      URL,
      URLSearchParams,
      fetch: async () =>
        Response.json({
          access_token: "access",
          id_token: "id",
          refresh_token: "refresh",
        }),
      Date,
      Error,
    },
  );
  await module.exports.default({
    post: () => {},
    get: (path: string, ...args: unknown[]) => {
      if (path === "/") {
        authorization = args[args.length - 1] as AuthorizationHandler;
      }
      if (path === "/callback") {
        callback = args[args.length - 1] as CallbackHandler;
      }
    },
  });
  assert.ok(callback);
  assert.ok(authorization);
  const handler = callback;
  const authorizationHandler = authorization;
  return {
    states,
    events,
    get cookies() {
      return cookies;
    },
    get sessions() {
      return sessions;
    },
    get sessionCookies() {
      return sessionCookies;
    },
    addOutstandingState: (state: string) => {
      cookies.push(state);
    },
    createdUsers,
    verifiedSubjects,
    get reconciliations() {
      return reconciliations;
    },
    run: (state = "original-state") =>
      handler(
        { query: { code: "authorization-code", state } },
        { redirect: (url) => url },
      ),
    startAuthorization: (query: Record<string, string | undefined>) =>
      authorizationHandler({ query }, { redirect: (url) => url }),
  };
}

test("login initiation issues PKCE state and keeps only safe redirect targets", async () => {
  const app = await callbackHarness({});
  const redirect = new URL(
    await app.startAuthorization({
      returnTo: "/settings",
      mfa: "true",
      emailMfa: "true",
      reauthenticate: "true",
    }),
  );

  assert.equal(redirect.origin, "https://tenant.example.test");
  assert.equal(redirect.pathname, "/authorize");
  assert.equal(redirect.searchParams.get("response_type"), "code");
  assert.equal(redirect.searchParams.get("state"), "retry-state");
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  const codeVerifier = app.states.get("retry-state")?.codeVerifier;
  assert.ok(codeVerifier);
  assert.equal(
    redirect.searchParams.get("code_challenge"),
    createHash("sha256").update(codeVerifier).digest("base64url"),
  );
  assert.equal(redirect.searchParams.get("prompt"), "login");
  assert.equal(redirect.searchParams.get("max_age"), "0");
  assert.match(redirect.searchParams.get("acr_values") ?? "", /multi-factor/);
  assert.match(redirect.searchParams.get("acr_values") ?? "", /email-otp/);
  assert.equal(app.states.get("retry-state")?.returnTo, "/settings");
  assert.deepEqual(
    [...app.cookies],
    ["other-tab-state", "original-state", "retry-state"],
  );

  const unsafeRedirect = new URL(
    await app.startAuthorization({ returnTo: "//attacker.example/path" }),
  );
  assert.equal(unsafeRedirect.searchParams.has("returnTo"), false);
  assert.equal(app.states.get("retry-state")?.returnTo, undefined);
});

test("verified Google callback creates a local user and session", async () => {
  const app = await callbackHarness({
    sub: "google-oauth2|google-user",
    email: "google-user@example.test",
    name: "Google Test User",
    createUser: true,
  });

  assert.equal(await app.run(), "https://app.example.test/");
  assert.equal(app.createdUsers.length, 1);
  assert.equal(app.createdUsers[0]?.auth0Sub, "google-oauth2|google-user");
  assert.equal(app.createdUsers[0]?.email, "google-user@example.test");
  assert.equal(app.createdUsers[0]?.username, "Google Test User");
  assert.deepEqual([...app.verifiedSubjects], ["google-oauth2|google-user"]);
  assert.equal(app.sessions, 1);
  assert.equal(app.sessionCookies, 1);
  assert.deepEqual([...app.cookies], ["other-tab-state"]);
});

test("verified password callback creates a local user and session", async () => {
  const app = await callbackHarness({
    sub: "auth0|password-user",
    email: "password-user@example.test",
    name: "Password Test User",
    createUser: true,
  });

  assert.equal(await app.run(), "https://app.example.test/");
  assert.equal(app.createdUsers.length, 1);
  assert.equal(app.createdUsers[0]?.auth0Sub, "auth0|password-user");
  assert.equal(app.createdUsers[0]?.email, "password-user@example.test");
  assert.equal(app.createdUsers[0]?.username, "Password Test User");
  assert.deepEqual([...app.verifiedSubjects], ["auth0|password-user"]);
  assert.equal(app.sessions, 1);
  assert.equal(app.sessionCookies, 1);
});

test("OAuth callback state cannot be replayed after session creation", async () => {
  const app = await callbackHarness({ createUser: true });

  assert.equal(await app.run(), "https://app.example.test/");
  assert.equal(app.sessions, 1);
  assert.deepEqual([...app.cookies], ["other-tab-state"]);

  const replay = new URL(await app.run());
  assert.equal(replay.pathname, "/error");
  assert.equal(
    replay.searchParams.get("authError"),
    "invalid_authentication_state",
  );
  assert.equal(app.sessions, 1);
});

test("OAuth callback rejects a browser state whose stored verifier expired", async () => {
  const app = await callbackHarness({});
  app.addOutstandingState("expired-state");

  const redirect = new URL(await app.run("expired-state"));
  assert.equal(redirect.pathname, "/error");
  assert.equal(
    redirect.searchParams.get("authError"),
    "authentication_state_expired",
  );
  assert.equal(app.sessions, 0);
  assert.deepEqual([...app.cookies], ["other-tab-state", "original-state"]);
});

test("unlinked password/Google callbacks retry Auth0 once with fresh PKCE and state", async () => {
  for (const [sub, existingSub] of [
    ["auth0|password-user", "google-oauth2|google-user"],
    ["google-oauth2|google-user", "auth0|password-user"],
  ] as const) {
    const app = await callbackHarness({
      sub,
      existingSub,
      state: {
        codeVerifier: "original-verifier",
        returnTo: "/settings",
        emailMfa: true,
      },
    });
    const redirect = new URL(await app.run());
    assert.equal(redirect.origin, "https://tenant.example.test");
    assert.equal(redirect.pathname, "/authorize");
    assert.equal(redirect.searchParams.get("state"), "retry-state");
    assert.equal(redirect.searchParams.get("prompt"), "login");
    assert.equal(redirect.searchParams.get("max_age"), "0");
    assert.equal(redirect.searchParams.get("login_hint"), "user@example.test");
    assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
    assert.ok(redirect.searchParams.get("code_challenge"));
    assert.match(redirect.searchParams.get("acr_values")!, /email-otp/);
    const retry = app.states.get("retry-state")!;
    assert.notEqual(retry.codeVerifier, "original-verifier");
    assert.equal(retry.accountLinkRetry, true);
    assert.equal(retry.returnTo, "/settings");
    assert.equal(retry.emailMfa, true);
    assert.deepEqual([...app.cookies], ["other-tab-state", "retry-state"]);
    assert.equal(app.sessions, 0);
    assert.equal(app.reconciliations, 0);
    assert.ok(app.events.includes("account_linking_needed"));

    const retryRedirect = new URL(await app.run("retry-state"));
    assert.equal(retryRedirect.pathname, "/error");
    assert.equal(
      retryRedirect.searchParams.get("authError"),
      "account_linking_required",
    );
    assert.deepEqual([...app.cookies], ["other-tab-state"]);
    assert.equal(app.sessions, 0);
    assert.equal(app.reconciliations, 0);
  }
});

test("a linked Google/password login reconciles and creates a session in either direction", async () => {
  for (const [sub, existingSub] of [
    ["auth0|password-user", "google-oauth2|google-user"],
    ["google-oauth2|google-user", "auth0|password-user"],
  ] as const) {
    const app = await callbackHarness({
      sub,
      existingSub,
      linked: true,
      state: {
        codeVerifier: "retry-verifier",
        accountLinkRetry: true,
        returnTo: "/settings",
      },
    });
    assert.equal(await app.run(), "https://app.example.test/settings");
    assert.equal(app.reconciliations, 1);
    assert.equal(app.sessions, 1);
    assert.equal(app.sessionCookies, 1);
  }
});

test("unsupported identity conflicts fail closed without retrying Auth0", async () => {
  const app = await callbackHarness({ existingSub: "github|other-user" });
  const redirect = new URL(await app.run());
  assert.equal(redirect.pathname, "/error");
  assert.equal(app.sessions, 0);
  assert.equal(app.reconciliations, 0);
});
