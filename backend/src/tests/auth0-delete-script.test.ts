import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptPath = fileURLToPath(
  new URL("../../auth0/database-action-scripts/delete.js", import.meta.url),
);

type RemoveCallback = (err: unknown, result?: unknown) => void;
type RemoveFn = (id: string, callback: RemoveCallback) => void;

function createFakeConnection() {
  const deletedIds: unknown[] = [];
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
      if (sql.trim().startsWith("DELETE")) {
        deletedIds.push(params[0]);
        return cb(null, { affectedRows: 1 });
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
  return { connection, getDeletedIds: () => deletedIds };
}

async function loadRemove(
  connection: ReturnType<typeof createFakeConnection>["connection"],
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
    // Inject the outer realm's Error so `err instanceof Error` holds in
    // assertions; a vm context otherwise has its own Error identity.
    Error,
    require: (moduleName: string) => {
      if (moduleName === "mysql") {
        return { createConnection: () => connection };
      }
      throw new Error(`Unexpected require: ${moduleName}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.remove as RemoveFn;
}

test("deletes the row by internal numeric id, not by email", async () => {
  const { connection, getDeletedIds } = createFakeConnection();
  const remove = await loadRemove(connection);
  await new Promise<void>((resolve) => {
    remove("42", (err) => {
      assert.equal(err, null);
      assert.deepEqual(getDeletedIds(), [42]);
      resolve();
    });
  });
});

test("rejects a non-numeric id instead of silently deleting nothing", async () => {
  const { connection, getDeletedIds } = createFakeConnection();
  const remove = await loadRemove(connection);
  await new Promise<void>((resolve) => {
    remove("user@example.com", (err) => {
      assert.ok(err instanceof Error);
      assert.deepEqual(getDeletedIds(), []);
      resolve();
    });
  });
});
