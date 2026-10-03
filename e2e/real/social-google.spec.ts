/// <reference types="node" />

import { expect, test } from "@playwright/test";
import { env } from "node:process";

async function beginSignIn(
  page: import("@playwright/test").Page,
  appUrl: string,
  apiUrl: string,
) {
  await page.goto(appUrl);
  const appHost = new URL(appUrl).host;
  const apiHost = new URL(apiUrl).host;
  await Promise.all([
    page.waitForURL((url) => url.host !== appHost && url.host !== apiHost, {
      waitUntil: "commit",
      timeout: 90_000,
    }),
    page.locator("button.login-button").click(),
  ]);
}

async function submitCredentialsAndWaitForCallback(
  page: import("@playwright/test").Page,
  submit: () => Promise<void>,
) {
  const callbackResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v001/auth/callback",
    { timeout: 45_000 },
  );
  await submit();

  try {
    const response = await callbackResponse;
    const location = response.headers().location;
    if (location) {
      const redirectPath = new URL(location, response.url()).pathname;
      if (redirectPath.endsWith("/authorize")) {
        throw new Error(
          "Auth0 requested another login; account linking or reauthentication is required.",
        );
      }
      if (redirectPath === "/error") {
        throw new Error(
          "The backend rejected the Auth0 callback and redirected to its error page.",
        );
      }
    }
    expect(response.status()).toBeLessThan(400);
  } catch (error) {
    const currentUrl = new URL(page.url());
    if (error instanceof Error && error.message.startsWith("The backend")) {
      throw error;
    }
    throw new Error(
      `Auth0 did not complete the backend callback; browser is at ${currentUrl.host}${currentUrl.pathname}.`,
    );
  }
}

async function expectAuthenticatedUser(
  context: import("@playwright/test").BrowserContext,
  apiUrl: string,
  email: string,
) {
  await expect
    .poll(
      async () =>
        (await context.request.get(`${apiUrl}/api/v001/auth/me`)).status(),
      { timeout: 10_000 },
    )
    .toBe(200);

  const userResponse = await context.request.get(`${apiUrl}/api/v001/users/me`);
  expect(userResponse.status()).toBe(200);
  const user = (await userResponse.json()) as {
    email: string;
    username: string;
  };
  expect(user.email.toLowerCase()).toBe(email.toLowerCase());
  expect(user.username).toBeTruthy();
}

test("creates or loads a Google social user through live Auth0 @real", async ({
  page,
  context,
}) => {
  test.skip(
    true,
    "Google blocks Playwright-controlled sign-in by default; run this flow manually.",
  );
  test.setTimeout(120_000);
  const googleEmail = env.TESTGOOGLEUSER_EMAIL;
  const googlePassword = env.TESTGOOGLEUSER_PASSWORD;
  test.skip(
    !googleEmail || !googlePassword,
    "Set TESTGOOGLEUSER_EMAIL and TESTGOOGLEUSER_PASSWORD to run the live flow.",
  );

  const appUrl = env.SANNY_E2E_APP_URL ?? "https://127.0.0.1:5176";
  const apiUrl = env.SANNY_E2E_API_URL ?? "https://localhost:8443";

  await beginSignIn(page, appUrl, apiUrl);

  await page.getByRole("button", { name: /google/i }).click();
  await page.getByLabel(/email or phone/i).fill(googleEmail!);
  await page.getByRole("button", { name: /next/i }).click();
  const googlePasswordInput = page.locator('input[type="password"]');
  try {
    await googlePasswordInput.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    const securityInterstitial = page.getByText(
      /This browser or app may not be secure/i,
    );
    if (await securityInterstitial.isVisible().catch(() => false)) {
      throw new Error(
        "Google blocked automated sign-in with its security interstitial; use a manual supported-browser flow for this identity.",
      );
    }
    const currentUrl = new URL(page.url());
    throw new Error(
      `Google sign-in did not show a password field; browser is at ${currentUrl.host}${currentUrl.pathname}.`,
    );
  }
  await googlePasswordInput.fill(googlePassword!);
  await submitCredentialsAndWaitForCallback(page, () =>
    page.getByRole("button", { name: /next/i }).click(),
  );

  await expectAuthenticatedUser(context, apiUrl, googleEmail!);
});

test("creates or loads a password user through live Auth0 @real", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const email = env.TESTUSER_EMAIL;
  const password = env.TESTUSER_PASSWORD;
  test.skip(
    !email || !password,
    "Set TESTUSER_EMAIL and TESTUSER_PASSWORD to run the live flow.",
  );

  const appUrl = env.SANNY_E2E_APP_URL ?? "https://127.0.0.1:5176";
  const apiUrl = env.SANNY_E2E_API_URL ?? "https://localhost:8443";

  await beginSignIn(page, appUrl, apiUrl);
  await page.getByLabel(/email address/i).fill(email!);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: "visible", timeout: 20_000 });
  await passwordInput.fill(password!);
  await submitCredentialsAndWaitForCallback(page, () =>
    page.getByRole("button", { name: /continue|log in/i }).click(),
  );

  await expectAuthenticatedUser(context, apiUrl, email!);

  const csrfCookie = (await context.cookies(apiUrl)).find(
    (cookie) => cookie.name === "__Host-sanny_csrf",
  );
  expect(csrfCookie?.value).toBeTruthy();

  const csrfDenied = await context.request.post(
    `${apiUrl}/api/v001/auth/logout`,
    { headers: { accept: "application/json" } },
  );
  expect(csrfDenied.status()).toBe(403);
  expect(await csrfDenied.json()).toEqual({
    error: "Forbidden",
    message: "Invalid CSRF token",
  });

  const logout = await context.request.post(`${apiUrl}/api/v001/auth/logout`, {
    headers: {
      accept: "application/json",
      "x-csrf-token": csrfCookie!.value,
    },
  });
  expect(logout.status()).toBe(200);
  expect(new URL((await logout.json()).logoutUrl).pathname).toBe(
    "/oidc/logout",
  );
});
