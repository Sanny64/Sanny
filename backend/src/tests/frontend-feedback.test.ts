import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { en } from "../../../shared/packages/i18n/locales/en.js";
import { de } from "../../../shared/packages/i18n/locales/de.js";
import {
  getErrorStatus,
  supportedStatuses,
} from "../../../sanny/src/utils/error-status.js";

const feedbackKeys = [
  "accountCreated",
  "accountUpdated",
  "accountDeleted",
  "userDeleted",
  "requestFailed",
  "usersLoaded",
  "userLoaded",
  "userUpdated",
  "rolesUpdated",
  "passwordResetRequested",
  "accountTested",
] as const;

test("German and English transient feedback belongs to notifications, not pages", () => {
  for (const locale of [de, en]) {
    for (const key of feedbackKeys) {
      assert.equal(typeof locale.shared.notifications[key], "string");
      assert.ok(!Object.hasOwn(locale.shared.settings, key));
    }
    assert.ok(!Object.hasOwn(locale.login, "userSyncError"));
    assert.ok(locale.shared.notifications.userSyncError);
    assert.ok(locale.shared.notifications.accountLinkAuthenticationFailed);
    assert.ok(
      locale.shared.notifications
        .accountLinkPopupBlocked("Google")
        .includes("Google"),
    );
    assert.ok(locale.shared.errors[404].message);
    assert.ok(locale.shared.errors[500].message);
    assert.ok(locale.login.emailVerificationRequired);
  }
});

test("settings and recoverable login failures do not duplicate toasts inline", async () => {
  for (const path of [
    "../../../sanny/src/pages/settings/AccountSettings.tsx",
    "../../../sanny/src/pages/settings/AdminSettings.tsx",
    "../../../sanny/src/components/default/LoginButton.tsx",
    "../../../login/src/pages/accountLinkingPage/AccountLinkingPage.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setError|setMessage|setUserSyncError/);
    assert.match(source, /show(?:Error)?Toast\(/);
  }

  for (const page of ["AccountSettings", "AdminSettings"]) {
    const source = await readFile(
      new URL(`../../../sanny/src/pages/settings/${page}.tsx`, import.meta.url),
      "utf8",
    );
    const request = source.slice(
      source.indexOf("async function request<T>"),
      source.indexOf("function isMfaAuthenticationRequired"),
    );
    assert.doesNotMatch(request, /show(?:Error)?Toast\(/);
  }
});

test("error status resolution preserves redirects and distinguishes missing routes", () => {
  for (const status of supportedStatuses) {
    assert.equal(getErrorStatus(String(status)), status);
    assert.equal(getErrorStatus(status), status);
  }
  assert.equal(getErrorStatus(null), 500);
  assert.equal(getErrorStatus(null, 404), 404);
  assert.equal(getErrorStatus("418"), 400);
  assert.equal(getErrorStatus("502"), 500);
  assert.equal(getErrorStatus("invalid"), 500);
});

test("wildcard routes use 404 while error redirects and boundaries remain", async () => {
  const source = await readFile(
    new URL("../../../sanny/src/App.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /path: "\*", element: <ErrorPage status=\{404\} \/>/);
  assert.match(source, /path: "\/error", element: <ErrorPage \/>/);
  assert.match(source, /errorElement: <ErrorPage \/>/);

  const errorPage = await readFile(
    new URL("../../../sanny/src/pages/ErrorPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(errorPage, /isRouteErrorResponse\(routeError\)/);
  assert.match(errorPage, /getErrorStatus\(routeError.status\)/);
  assert.match(
    errorPage,
    /pageStatus \?\? getErrorStatus\(searchParams.get\("status"\)\)/,
  );
});
