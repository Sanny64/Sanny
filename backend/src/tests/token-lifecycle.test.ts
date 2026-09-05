import test from "node:test";
import assert from "node:assert/strict";

import {
  AccessTokenValidationError,
  getAccessTokenIdentity,
} from "../utils/access-token.js";
import { shouldRequireReauthentication } from "../utils/session-rotation.js";

test("access-token identity rejects mismatched or missing audiences", () => {
  const previousAudience = process.env.AUTH0_AUDIENCE;
  process.env.AUTH0_AUDIENCE = "https://api.example.com";

  try {
    assert.throws(
      () =>
        getAccessTokenIdentity({
          user: {
            sub: "auth0|123",
            aud: "https://other.example.com",
          },
        } as any),
      AccessTokenValidationError,
    );

    assert.throws(
      () =>
        getAccessTokenIdentity({
          user: {
            aud: ["https://api.example.com"],
          },
        } as any),
      AccessTokenValidationError,
    );
  } finally {
    if (previousAudience === undefined) {
      delete process.env.AUTH0_AUDIENCE;
    } else {
      process.env.AUTH0_AUDIENCE = previousAudience;
    }
  }
});

test("identity parsing keeps namespaced claims and permissions from scope", () => {
  const previousAudience = process.env.AUTH0_AUDIENCE;
  const previousRoles = process.env.AUTH0_ROLES_CLAIM;
  const previousEmail = process.env.AUTH0_EMAIL_CLAIM;
  const previousName = process.env.AUTH0_NAME_CLAIM;

  process.env.AUTH0_AUDIENCE = "https://api.example.com";
  process.env.AUTH0_ROLES_CLAIM = "https://sanny64.app/roles";
  process.env.AUTH0_EMAIL_CLAIM = "https://sanny64.app/email";
  process.env.AUTH0_NAME_CLAIM = "https://sanny64.app/name";

  try {
    const identity = getAccessTokenIdentity({
      user: {
        sub: "auth0|123",
        aud: ["https://api.example.com"],
        "https://sanny64.app/roles": ["admin", "editor"],
        "https://sanny64.app/email": "user@example.com",
        "https://sanny64.app/name": "Example User",
        email_verified: true,
        scope: "openid profile delete:me",
      },
    } as any);

    assert.equal(identity.sub, "auth0|123");
    assert.equal(identity.email, "user@example.com");
    assert.equal(identity.emailVerified, true);
    assert.equal(identity.name, "Example User");
    assert.deepEqual(identity.roles, ["admin", "editor"]);
    assert.deepEqual(identity.permissions, ["openid", "profile", "delete:me"]);
    assert.deepEqual(identity.audiences, ["https://api.example.com"]);
  } finally {
    if (previousAudience === undefined) {
      delete process.env.AUTH0_AUDIENCE;
    } else {
      process.env.AUTH0_AUDIENCE = previousAudience;
    }

    if (previousRoles === undefined) {
      delete process.env.AUTH0_ROLES_CLAIM;
    } else {
      process.env.AUTH0_ROLES_CLAIM = previousRoles;
    }

    if (previousEmail === undefined) {
      delete process.env.AUTH0_EMAIL_CLAIM;
    } else {
      process.env.AUTH0_EMAIL_CLAIM = previousEmail;
    }

    if (previousName === undefined) {
      delete process.env.AUTH0_NAME_CLAIM;
    } else {
      process.env.AUTH0_NAME_CLAIM = previousName;
    }
  }
});

test("email verification is fail-closed for local-account creation", () => {
  const previousAudience = process.env.AUTH0_AUDIENCE;
  process.env.AUTH0_AUDIENCE = "https://api.example.com";

  try {
    for (const emailVerified of [false, undefined]) {
      const claims: Record<string, unknown> = {
        sub: "auth0|123",
        aud: "https://api.example.com",
        email: "user@example.com",
      };
      if (emailVerified !== undefined) claims.email_verified = emailVerified;

      const identity = getAccessTokenIdentity({ user: claims } as any);
      assert.equal(identity.emailVerified, false);
    }
  } finally {
    if (previousAudience === undefined) {
      delete process.env.AUTH0_AUDIENCE;
    } else {
      process.env.AUTH0_AUDIENCE = previousAudience;
    }
  }
});

test("email verification reads the namespaced access-token claim the Post Login Actions stamp", () => {
  // Regression test: API access tokens never carry the raw OIDC
  // `email_verified` claim by default. roleClaims.js/verifyEmail.js stamp
  // verification status onto a namespaced custom claim instead (configured
  // via AUTH0_EMAIL_VERIFIED_CLAIM). If this backend only reads the raw
  // claim, emailVerified is always false on real access tokens, silently
  // skipping DB-user creation/account-linking for every login.
  const previousAudience = process.env.AUTH0_AUDIENCE;
  const previousClaim = process.env.AUTH0_EMAIL_VERIFIED_CLAIM;
  process.env.AUTH0_AUDIENCE = "https://api.example.com";
  process.env.AUTH0_EMAIL_VERIFIED_CLAIM = "https://sanny64.app/email_verified";

  try {
    const identity = getAccessTokenIdentity({
      user: {
        sub: "google-oauth2|123",
        aud: "https://api.example.com",
        "https://sanny64.app/email_verified": true,
        // No raw `email_verified` claim present, matching real access tokens.
      },
    } as any);

    assert.equal(identity.emailVerified, true);
  } finally {
    if (previousAudience === undefined) {
      delete process.env.AUTH0_AUDIENCE;
    } else {
      process.env.AUTH0_AUDIENCE = previousAudience;
    }

    if (previousClaim === undefined) {
      delete process.env.AUTH0_EMAIL_VERIFIED_CLAIM;
    } else {
      process.env.AUTH0_EMAIL_VERIFIED_CLAIM = previousClaim;
    }
  }
});

test("stale sessions require reauthentication after the configured age threshold", () => {
  const now = Date.now();

  assert.equal(
    shouldRequireReauthentication(now - 30 * 1000, now, 15 * 1000),
    true,
  );
  assert.equal(
    shouldRequireReauthentication(now - 5 * 1000, now, 15 * 1000),
    false,
  );
});
