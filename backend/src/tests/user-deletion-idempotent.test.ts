import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

import prisma from "../utils/prisma.js";
import {
  deleteUserById,
  deleteSelfUserBySub,
} from "../services/user.service.js";

// Prisma's generated client exposes model delegates via a Proxy whose
// getOwnPropertyDescriptor trap reports `value: undefined` for methods that
// are actually callable. node:test's `mock.method` inspects that descriptor
// and rejects it, so mock deleteMany with a direct, restorable property
// assignment instead.
function mockDeleteMany(impl: (...args: unknown[]) => unknown) {
  const original = prisma.user.deleteMany;
  prisma.user.deleteMany = mock.fn(impl) as typeof prisma.user.deleteMany;
  return () => {
    prisma.user.deleteMany = original;
  };
}

test("admin deletion is idempotent when the local user no longer exists", async () => {
  const restore = mockDeleteMany(async () => ({ count: 0 }));

  try {
    const result = await deleteUserById(999);
    assert.equal(result, 0);
  } finally {
    restore();
  }
});

test("self deletion is idempotent when the subject is already absent locally", async () => {
  const restore = mockDeleteMany(async () => ({ count: 0 }));

  try {
    const result = await deleteSelfUserBySub("auth0|missing");
    assert.equal(result, 0);
  } finally {
    restore();
  }
});
