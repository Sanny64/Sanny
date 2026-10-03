import test from "node:test";
import assert from "node:assert/strict";

import {
  getCallbackUrl,
  getAccountLinkFrontendUrl,
  getLogoutRedirectUrl,
  getSuccessRedirectUrl,
  getTrustProxy,
} from "../utils/config.js";

test("production Auth0 redirects require HTTPS URLs", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousCallback = process.env.PROD_AUTH0_CALLBACK_URL;
  const previousSuccess = process.env.PROD_AUTH0_SUCCESS_REDIRECT;
  const previousLogout = process.env.PROD_AUTH0_LOGOUT_REDIRECT;
  const previousAccountLinkFrontend =
    process.env.PROD_ACCOUNT_LINK_FRONTEND_URL;

  try {
    process.env.NODE_ENV = "production";
    process.env.PROD_AUTH0_CALLBACK_URL =
      "https://app.example.com/api/v001/auth/callback";
    process.env.PROD_AUTH0_SUCCESS_REDIRECT = "https://app.example.com/";
    process.env.PROD_AUTH0_LOGOUT_REDIRECT = "https://app.example.com/";
    process.env.PROD_ACCOUNT_LINK_FRONTEND_URL =
      "https://app.example.com/confirm-linking";

    assert.equal(getCallbackUrl(), process.env.PROD_AUTH0_CALLBACK_URL);
    assert.equal(
      getSuccessRedirectUrl(),
      process.env.PROD_AUTH0_SUCCESS_REDIRECT,
    );
    assert.equal(
      getLogoutRedirectUrl(),
      process.env.PROD_AUTH0_LOGOUT_REDIRECT,
    );
    assert.equal(
      getAccountLinkFrontendUrl(),
      process.env.PROD_ACCOUNT_LINK_FRONTEND_URL,
    );

    process.env.PROD_AUTH0_CALLBACK_URL =
      "http://app.example.com/api/v001/auth/callback";
    assert.throws(() => getCallbackUrl(), /must use HTTPS in production/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousCallback === undefined)
      delete process.env.PROD_AUTH0_CALLBACK_URL;
    else process.env.PROD_AUTH0_CALLBACK_URL = previousCallback;

    if (previousSuccess === undefined)
      delete process.env.PROD_AUTH0_SUCCESS_REDIRECT;
    else process.env.PROD_AUTH0_SUCCESS_REDIRECT = previousSuccess;

    if (previousLogout === undefined)
      delete process.env.PROD_AUTH0_LOGOUT_REDIRECT;
    else process.env.PROD_AUTH0_LOGOUT_REDIRECT = previousLogout;

    if (previousAccountLinkFrontend === undefined)
      delete process.env.PROD_ACCOUNT_LINK_FRONTEND_URL;
    else
      process.env.PROD_ACCOUNT_LINK_FRONTEND_URL = previousAccountLinkFrontend;
  }
});

test("trusted proxy config requires explicit false, true, or IP/CIDR values", () => {
  const keys = ["NODE_ENV", "DEV_TRUST_PROXY", "PROD_TRUST_PROXY"] as const;
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  try {
    process.env.NODE_ENV = "development";
    delete process.env.DEV_TRUST_PROXY;
    assert.equal(getTrustProxy(), false);

    process.env.DEV_TRUST_PROXY = "false";
    assert.equal(getTrustProxy(), false);
    process.env.DEV_TRUST_PROXY = "true";
    assert.equal(getTrustProxy(), true);
    process.env.DEV_TRUST_PROXY = "127.0.0.1,10.0.0.0/8";
    assert.equal(getTrustProxy(), "127.0.0.1,10.0.0.0/8");
    process.env.DEV_TRUST_PROXY = "2";
    assert.throws(
      () => getTrustProxy(),
      /numeric hop counts are not supported/,
    );

    process.env.NODE_ENV = "production";
    process.env.DEV_TRUST_PROXY = "false";
    process.env.PROD_TRUST_PROXY = "192.0.2.10";
    assert.equal(getTrustProxy(), "192.0.2.10");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
