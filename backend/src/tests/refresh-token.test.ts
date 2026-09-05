import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthorizationScope,
  buildRefreshTokenRequest,
} from "../utils/refresh-token.js";

test("login requests offline access so a refresh token can be issued", () => {
  const scope = buildAuthorizationScope();
  assert.match(scope, /offline_access/);
  assert.match(scope, /openid/);
  assert.match(scope, /profile/);
});

test("refresh requests include the refresh token grant and credentials", () => {
  const body = buildRefreshTokenRequest({
    clientId: "client-id",
    clientSecret: "client-secret",
    refreshToken: "refresh-token",
    audience: "https://api.example.com",
    callbackUrl: "https://example.com/callback",
  });

  assert.equal(body.grant_type, "refresh_token");
  assert.equal(body.refresh_token, "refresh-token");
  assert.equal(body.client_id, "client-id");
  assert.equal(body.client_secret, "client-secret");
  assert.equal(body.audience, "https://api.example.com");
  assert.equal(body.redirect_uri, "https://example.com/callback");
});
