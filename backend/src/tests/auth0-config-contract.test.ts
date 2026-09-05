import test from "node:test";
import assert from "node:assert/strict";

import {
  getCallbackUrl,
  getAccountLinkFrontendUrl,
  getLogoutRedirectUrl,
  getSuccessRedirectUrl,
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
