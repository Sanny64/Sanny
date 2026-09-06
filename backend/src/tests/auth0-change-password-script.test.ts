import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptPath = fileURLToPath(
  new URL(
    "../../auth0/database-action/changePassword.js",
    import.meta.url,
  ),
);

type ChangePasswordCallback = (err: unknown, result?: unknown) => void;
type ChangePasswordFn = (
  email: string,
  newPassword: string,
  callback: ChangePasswordCallback,
) => void;

class ValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

type FakeRow = { password: string | null };

function createFakeConnection(rows: FakeRow[]) {
  let updatedPassword: string | undefined;
  const connection = {
    connect(cb: (err: Error | null) => void) {
      cb(null);
    },
    beginTransaction(cb: (err: Error | null) => void) {
      cb(null);
    },
    query(
      sql: string,
      params: unknown[],
      cb: (err: Error | null, result?: unknown) => void,
    ) {
      if (sql.trim().startsWith("SELECT")) {
        return cb(null, rows);
      }
      if (sql.trim().startsWith("UPDATE")) {
        updatedPassword = params[0] as string;
        return cb(null, { affectedRows: rows.length });
      }
      return cb(new Error(`Unexpected query: ${sql}`));
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
  return { connection, getUpdatedPassword: () => updatedPassword };
}

async function loadChangePassword(
  connection: ReturnType<typeof createFakeConnection>["connection"],
) {
  const source = await readFile(scriptPath, "utf8");
  const sandbox: Record<string, unknown> = {
    Buffer,
    configuration: {
      DB_HOST: "localhost",
      DB_PORT: "3306",
      DB_USER: "user",
      DB_PASSWORD: "password",
      DB_NAME: "db",
      DB_SSL_CA: "-----BEGINCERTIFICATE-----abc-----ENDCERTIFICATE-----",
    },
    ValidationError,
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
          hash: (
            value: string,
            _rounds: number,
            cb: (err: unknown, hashed: string) => void,
          ) => cb(null, `hashed:${value}`),
        };
      }
      throw new Error(`Unexpected require: ${moduleName}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.changePassword as ChangePasswordFn;
}

test("rejects reusing the current password without ending the connection early", async () => {
  const currentPassword = "Zx9!Qw3$LmP7*Vb";
  const { connection } = createFakeConnection([{ password: currentPassword }]);
  const changePassword = await loadChangePassword(connection);
  await new Promise<void>((resolve) => {
    changePassword("user@example.com", currentPassword, (err) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.code, "password_reuse");
      resolve();
    });
  });
});

test("allows setting an initial password for a Google-only account with no current password", async () => {
  const newPassword = "Kp4&Wn8!Zt2@Rq5";
  const { connection, getUpdatedPassword } = createFakeConnection([
    { password: null },
  ]);
  const changePassword = await loadChangePassword(connection);
  await new Promise<void>((resolve) => {
    changePassword("user@example.com", newPassword, (err, result) => {
      assert.equal(err, null);
      assert.equal(result, true);
      assert.equal(getUpdatedPassword(), `hashed:${newPassword}`);
      resolve();
    });
  });
});

test("rejects when no user exists for the email", async () => {
  const { connection } = createFakeConnection([]);
  const changePassword = await loadChangePassword(connection);
  await new Promise<void>((resolve) => {
    changePassword("missing@example.com", "Kp4&Wn8!Zt2@Rq5", (err) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.code, "user_not_found");
      resolve();
    });
  });
});

test("updates to a genuinely new password", async () => {
  const newPassword = "Kp4&Wn8!Zt2@Rq5";
  const { connection, getUpdatedPassword } = createFakeConnection([
    { password: "old-hash" },
  ]);
  const changePassword = await loadChangePassword(connection);
  await new Promise<void>((resolve) => {
    changePassword("user@example.com", newPassword, (err, result) => {
      assert.equal(err, null);
      assert.equal(result, true);
      assert.equal(getUpdatedPassword(), `hashed:${newPassword}`);
      resolve();
    });
  });
});
