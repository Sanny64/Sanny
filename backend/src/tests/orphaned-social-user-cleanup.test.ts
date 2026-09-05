import test from "node:test";
import assert from "node:assert/strict";

import { cleanUpOrphanedSocialUsers } from "../utils/orphaned-social-user-cleanup.js";

test("deletes local rows for social users that no longer exist in Auth0", async () => {
  const deleted: string[] = [];

  await cleanUpOrphanedSocialUsers({
    findNonDatabaseConnectionUsers: async () => [
      { id: 1, auth0Sub: "google-oauth2|gone" },
      { id: 2, auth0Sub: "google-oauth2|still-there" },
    ],
    auth0UserExists: async (auth0Sub) =>
      auth0Sub === "google-oauth2|still-there",
    deleteSelfUserBySub: async (auth0Sub) => {
      deleted.push(auth0Sub);
      return 1;
    },
  });

  assert.deepEqual(deleted, ["google-oauth2|gone"]);
});

test("keeps local rows for social users that still exist in Auth0", async () => {
  const deleted: string[] = [];

  await cleanUpOrphanedSocialUsers({
    findNonDatabaseConnectionUsers: async () => [
      { id: 1, auth0Sub: "google-oauth2|still-there" },
    ],
    auth0UserExists: async () => true,
    deleteSelfUserBySub: async (auth0Sub) => {
      deleted.push(auth0Sub);
      return 1;
    },
  });

  assert.deepEqual(deleted, []);
});

test("continues checking remaining users when one Auth0 lookup fails", async () => {
  const checked: string[] = [];
  const deleted: string[] = [];

  await cleanUpOrphanedSocialUsers({
    findNonDatabaseConnectionUsers: async () => [
      { id: 1, auth0Sub: "google-oauth2|errors" },
      { id: 2, auth0Sub: "google-oauth2|gone" },
    ],
    auth0UserExists: async (auth0Sub) => {
      checked.push(auth0Sub);
      if (auth0Sub === "google-oauth2|errors") {
        throw new Error("upstream error");
      }
      return false;
    },
    deleteSelfUserBySub: async (auth0Sub) => {
      deleted.push(auth0Sub);
      return 1;
    },
  });

  assert.deepEqual(checked, ["google-oauth2|errors", "google-oauth2|gone"]);
  assert.deepEqual(deleted, ["google-oauth2|gone"]);
});
