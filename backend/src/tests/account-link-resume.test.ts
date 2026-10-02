import assert from "node:assert/strict";
import test from "node:test";
import { getAccountLinkContinuationUrl } from "../utils/account-link-continuation.js";
import {
  getProofStartUrl,
  parseProofResume,
  prepareProofResume,
  proofResumeKey,
} from "../../../login/src/pages/accountLinkingPage/proof-resume.js";

test("continuation uses the backend custom Auth0 domain and preserves signed parameters", () => {
  const previousDomain = process.env.AUTH0_DOMAIN;
  process.env.AUTH0_DOMAIN = "auth.example.test";
  try {
    const input = {
      state: "opaque-state",
      decision: "confirm" as const,
      primaryUserId: "google-oauth2|primary",
      secondaryUserId: "auth0|secondary",
      temporaryUserId: "google-oauth2|primary",
      proof: "payload.signature",
    };
    const url = new URL(getAccountLinkContinuationUrl(input));
    assert.equal(url.origin, "https://auth.example.test");
    assert.equal(url.pathname, "/continue");
    assert.deepEqual(Object.fromEntries(url.searchParams), input);
    const cancel = new URL(
      getAccountLinkContinuationUrl({
        state: input.state,
        decision: "cancel",
        primaryUserId: input.primaryUserId,
        secondaryUserId: input.secondaryUserId,
      }),
    );
    assert.equal(cancel.searchParams.has("proof"), false);
    assert.equal(cancel.searchParams.has("temporaryUserId"), false);
  } finally {
    if (previousDomain === undefined) delete process.env.AUTH0_DOMAIN;
    else process.env.AUTH0_DOMAIN = previousDomain;
  }
});

test("popup remembers pending proof across reset and restarts the same secondary login", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const pending = { state: "a".repeat(43), expiresAt: Date.now() + 600_000 };
  const hash =
    "#" +
    new URLSearchParams({
      state: pending.state,
      expiresAt: String(pending.expiresAt),
    }).toString();
  const initial = prepareProofResume(
    "https://api.example.test",
    hash,
    () => storage,
  );
  assert.equal(initial.error, null);
  assert.deepEqual(JSON.parse(data.get(proofResumeKey)!), pending);
  assert.deepEqual(
    prepareProofResume("https://api.example.test", "", () => storage),
    initial,
  );
  data.set(
    proofResumeKey,
    JSON.stringify({ ...pending, expiresAt: Date.now() - 1 }),
  );
  const expired = prepareProofResume(
    "https://api.example.test",
    "",
    () => storage,
  );
  assert.equal(expired.url, null);
  assert.match(expired.error!, /expired/);
  assert.equal(data.has(proofResumeKey), false);
  assert.deepEqual(
    prepareProofResume("https://api.example.test", "", () => storage),
    {
      url: "https://api.example.test/api/v001/auth",
      error: null,
    },
  );
});

test("blocked popup storage produces an explicit error instead of ordinary login", () => {
  const result = prepareProofResume("https://api.example.test", "", () => {
    throw new Error("Storage blocked");
  });
  assert.equal(result.url, null);
  assert.match(result.error!, /Allow browser storage/);
});

test("popup resumes only a well-formed unexpired proof state", () => {
  const pending = { state: "a".repeat(43), expiresAt: 2000 };
  assert.deepEqual(parseProofResume(JSON.stringify(pending), 1000), pending);
  for (const raw of [
    null,
    "invalid JSON",
    "null",
    "{}",
    JSON.stringify({ ...pending, state: "https://attacker.test" }),
    JSON.stringify({ ...pending, expiresAt: "2000" }),
    JSON.stringify({ ...pending, expiresAt: 1000 }),
  ]) {
    assert.equal(parseProofResume(raw, 1000), null);
  }
  const url = new URL(
    getProofStartUrl("https://api.example.test", pending.state),
  );
  assert.equal(url.origin, "https://api.example.test");
  assert.equal(url.pathname, "/api/v001/auth/account-link-proof/start");
  assert.equal(url.searchParams.get("state"), pending.state);
});
