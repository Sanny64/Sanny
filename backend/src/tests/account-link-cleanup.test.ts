import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cleanupRetryDelayMs = 60_000;

const pendingLink = {
  primaryUserId: "google-oauth2|primary",
  secondaryUserId: "auth0|secondary",
  temporaryUserId: "google-oauth2|temporary",
};

async function loadCleanup(options: {
  deleteError?: Error;
  claim?: (typeof pendingLink)[];
}) {
  const source = await readFile(
    new URL("../utils/account-link-cleanup.ts", import.meta.url),
    "utf8",
  );
  const deleted: string[] = [];
  const requeued: Array<{ link: typeof pendingLink; ttlMs?: number }> = [];
  const events: Array<{ name: string; details: unknown }> = [];
  const modules: Record<string, object> = {
    "./auth0-management.js": {
      deleteAuth0UserBySub: async (auth0Sub: string) => {
        if (options.deleteError) throw options.deleteError;
        deleted.push(auth0Sub);
      },
    },
    "./session.js": {
      claimExpiredPendingAccountLinks: async () =>
        options.claim ?? [pendingLink],
      schedulePendingAccountLink: async (
        link: typeof pendingLink,
        ttlMs?: number,
      ) => requeued.push({ link, ...(ttlMs === undefined ? {} : { ttlMs }) }),
    },
    "./security-audit.js": {
      logSecurityEvent: (name: string, details: unknown) =>
        events.push({ name, details }),
    },
  };
  const module = {
    exports: {} as {
      cleanUpExpiredPendingAccountLinks: () => Promise<void>;
    },
  };

  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports: module.exports,
      require: (name: string) => {
        if (modules[name]) return modules[name];
        return require(name);
      },
      Error,
      String,
    },
  );

  return {
    cleanup: module.exports.cleanUpExpiredPendingAccountLinks,
    deleted,
    requeued,
    events,
  };
}

test("expired account-link cleanup deletes the temporary Auth0 identity", async () => {
  const cleanup = await loadCleanup({});

  await cleanup.cleanup();

  assert.deepEqual(cleanup.deleted, [pendingLink.temporaryUserId]);
  assert.deepEqual(cleanup.requeued, []);
  assert.deepEqual(
    cleanup.events.map(({ name }) => name),
    ["pending_account_link_expired"],
  );
});

test("failed Auth0 cleanup requeues the expired link for retry", async () => {
  const cleanup = await loadCleanup({
    deleteError: new Error("Auth0 temporarily unavailable"),
  });

  await cleanup.cleanup();

  assert.deepEqual(cleanup.deleted, []);
  assert.deepEqual(cleanup.requeued, [
    { link: pendingLink, ttlMs: cleanupRetryDelayMs },
  ]);
  assert.deepEqual(
    cleanup.events.map(({ name }) => name),
    ["pending_account_link_cleanup_failed"],
  );
});
