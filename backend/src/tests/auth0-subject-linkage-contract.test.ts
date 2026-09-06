import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const createScriptPath = fileURLToPath(
  new URL("../../auth0/database-action/create.js", import.meta.url),
);
const userServicePath = fileURLToPath(
  new URL("../services/user.service.ts", import.meta.url),
);
const authRoutePath = fileURLToPath(
  new URL("../routes/auth.route.ts", import.meta.url),
);

test("email/password creation stores the Auth0 database subject from its user id", async () => {
  const source = await readFile(createScriptPath, "utf8");

  assert.match(
    source,
    /UPDATE User SET auth0Sub = CONCAT\('auth0\|', id\) WHERE id = \?/,
  );
  assert.match(source, /id: String\(insertResult\.insertId\)/);
});

test("subject reconciliation fails closed for an unlinked or legacy user row", async () => {
  const [userService, authRoute] = await Promise.all([
    readFile(userServicePath, "utf8"),
    readFile(authRoutePath, "utf8"),
  ]);

  assert.match(
    userService,
    /if \(existingByEmail\.auth0Sub !== input\.auth0Sub\)/,
  );
  assert.match(
    authRoute,
    /existingUser\.auth0Sub \?\? `auth0\|\$\{existingUser\.id\}`/,
  );
});

test("an unresolved account-linking conflict redirects instead of returning raw JSON", async () => {
  // The /callback route is reached via a full-page browser redirect from
  // Auth0, not a fetch call. A bare `reply.code(409).send({...})` response
  // renders as unstyled JSON text in the browser instead of taking the user
  // back into the app, so this fallback conflict path must redirect through
  // getAuthErrorRedirectUrl like every other auth error on this route.
  const authRoute = await readFile(authRoutePath, "utf8");

  assert.doesNotMatch(authRoute, /reply\.code\(409\)\.send/);
  assert.match(
    authRoute,
    /reply\.redirect\(\s*getAuthErrorRedirectUrl\(\s*"account_linking_required"/,
  );
});
