import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const loginScriptPath = fileURLToPath(
  new URL("../../auth0/database-action/login.js", import.meta.url),
);
const getUserScriptPath = fileURLToPath(
  new URL("../../auth0/database-action/getUser.js", import.meta.url),
);
const verifyScriptPath = fileURLToPath(
  new URL("../../auth0/database-action/verify.js", import.meta.url),
);

class ValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

class WrongUsernameOrPasswordError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WrongUsernameOrPasswordError";
    this.code = code;
  }
}

type FakeRow = Record<string, unknown>;

// Some MySQL driver/connection configurations return TINYINT(1) columns as
// the raw numeric 1/0 rather than a coerced boolean. Auth0 persists whatever
// login.js/getUser.js return verbatim, and downstream Post Login Actions
// (linkAccounts.js) compare that against other users' profiles using strict
// `=== true`, so a numeric 1 silently fails that check and permanently
// excludes the user from account-linking detection.
function createFakeConnection(rows: FakeRow[]) {
  const connection = {
    connect(cb: (err: Error | null) => void) {
      cb(null);
    },
    beginTransaction(cb: (err: Error | null) => void) {
      cb(null);
    },
    query(
      _sql: string,
      _params: unknown[],
      cb: (err: Error | null, result?: unknown) => void,
    ) {
      cb(null, rows);
    },
    commit(cb: (err: Error | null) => void) {
      cb(null);
    },
    rollback(cb: () => void) {
      cb();
    },
    end(cb: () => void) {
      cb();
    },
    destroy() {
      // no-op for the fake connection
    },
  };
  return connection;
}

async function loadScript(
  scriptPath: string,
  exportName: string,
  connection: ReturnType<typeof createFakeConnection>,
) {
  const source = await readFile(scriptPath, "utf8");
  const sandbox: Record<string, unknown> = {
    configuration: {
      DB_HOST: "localhost",
      DB_PORT: "3306",
      DB_USER: "user",
      DB_PASSWORD: "password",
      DB_NAME: "db",
      DB_SSL_CA: "-----BEGINCERTIFICATE-----abc-----ENDCERTIFICATE-----",
    },
    ValidationError,
    WrongUsernameOrPasswordError,
    require: (moduleName: string) => {
      if (moduleName === "mysql") {
        return { createConnection: () => connection };
      }
      if (moduleName === "bcrypt") {
        return {
          compare: (
            candidate: string,
            hash: string,
            cb: (err: unknown, isMatch: boolean) => void,
          ) => cb(null, candidate === hash),
        };
      }
      throw new Error(`Unexpected require: ${moduleName}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox[exportName] as (...args: unknown[]) => void;
}

test("login.js coerces a numeric emailVerified column into a strict boolean", async () => {
  const connection = createFakeConnection([
    {
      id: 6,
      username: "sanny64",
      email: "user@example.com",
      password: "hash",
      emailVerified: 1,
    },
  ]);
  const login = await loadScript(loginScriptPath, "login", connection);

  await new Promise<void>((resolve) => {
    login(
      "user@example.com",
      "hash",
      (err: unknown, result: { email_verified?: unknown }) => {
        assert.equal(err, null);
        assert.equal(result?.email_verified, true);
        resolve();
      },
    );
  });
});

test("getUser.js coerces a numeric emailVerified column into a strict boolean", async () => {
  const connection = createFakeConnection([
    { id: 6, username: "sanny64", email: "user@example.com", emailVerified: 0 },
  ]);
  const getByEmail = await loadScript(
    getUserScriptPath,
    "getByEmail",
    connection,
  );

  await new Promise<void>((resolve) => {
    getByEmail(
      "user@example.com",
      (err: unknown, result: { email_verified?: unknown }) => {
        assert.equal(err, null);
        assert.equal(result?.email_verified, false);
        resolve();
      },
    );
  });
});

// Auth0 does not sync our custom DB's `emailVerified` flag onto its own
// persisted user profile automatically, and it defaults the profile's
// display "Name" to the email when no `name` field is returned. Without
// these fields on every login/getUser call, database-connection users are
// permanently treated as unverified by Post Login Actions (role claims,
// account-linking eligibility), even after a real verification succeeded.
test("login.js reports name and email_verified so Auth0's profile stays in sync", async () => {
  const source = await readFile(loginScriptPath, "utf8");

  assert.match(source, /emailVerified FROM User/);
  assert.match(source, /name:\s*rows\[0\]\.username/);
  assert.match(source, /email_verified:\s*Boolean\(rows\[0\]\.emailVerified\)/);
});

test("getUser.js reports name and email_verified so Auth0's profile stays in sync", async () => {
  const source = await readFile(getUserScriptPath, "utf8");

  assert.match(source, /emailVerified FROM User/);
  assert.match(source, /name:\s*rows\[0\]\.username/);
  assert.match(source, /email_verified:\s*Boolean\(rows\[0\]\.emailVerified\)/);
});

// mysql's `UPDATE` queries resolve to an OkPacket (affectedRows/changedRows),
// not an array of rows, so checking `.length` on the result always yields
// `undefined` and silently reports every verification attempt as failed.
test("verify.js checks affectedRows instead of the non-existent length of an UPDATE result", async () => {
  const source = await readFile(verifyScriptPath, "utf8");

  assert.match(source, /result\.affectedRows === 0/);
  assert.doesNotMatch(source, /rows\.length/);
});
