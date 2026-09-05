import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccountLinkProof,
  verifyAccountLinkProof,
} from "../utils/account-link-proof.js";

const secret = "test-account-link-proof-secret";
const now = 1_000_000;

test("accepts a proof only for its authenticated account pair", () => {
  const proof = createAccountLinkProof(
    "google-oauth2|google-user",
    "auth0|database-user",
    secret,
    now,
  );

  assert.equal(
    verifyAccountLinkProof(
      proof,
      "google-oauth2|google-user",
      "auth0|database-user",
      secret,
      now,
    ),
    true,
  );
  assert.equal(
    verifyAccountLinkProof(
      proof,
      "google-oauth2|other-google-user",
      "auth0|database-user",
      secret,
      now,
    ),
    false,
  );
});

test("rejects tampered and expired account-link proofs", () => {
  const proof = createAccountLinkProof(
    "google-oauth2|google-user",
    "auth0|database-user",
    secret,
    now,
  );

  assert.equal(
    verifyAccountLinkProof(
      `${proof}x`,
      "google-oauth2|google-user",
      "auth0|database-user",
      secret,
      now,
    ),
    false,
  );
  assert.equal(
    verifyAccountLinkProof(
      proof,
      "google-oauth2|google-user",
      "auth0|database-user",
      secret,
      now + 2 * 60 * 1000,
    ),
    false,
  );
});
