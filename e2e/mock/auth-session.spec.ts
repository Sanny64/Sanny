import { expect, test, type Route } from "@playwright/test";

const sannyUrl = "https://127.0.0.1:5176";

async function respondJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test("shows sign-in for an unauthenticated session and starts authentication", async ({
  page,
}) => {
  await page.route("**/api/v001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v001/auth/me") {
      await respondJson(route, { message: "Not authenticated" }, 401);
    } else if (path === "/api/v001/auth") {
      await route.fulfill({ status: 200, body: "mocked auth initiation" });
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  const returnTo = "/settings?tab=appearance#preferences";
  await page.goto(`${sannyUrl}${returnTo}`);
  await page
    .getByRole("button", { name: /^(Account menu|Kontomenü)$/ })
    .click();
  const signInButton = page
    .locator(".account-menu")
    .getByRole("button", { name: /^(Login|Anmelden)$/ });
  await expect(signInButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Logout|Abmelden)$/ }),
  ).toHaveCount(0);

  const authRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/v001/auth" && request.method() === "GET";
  });
  await signInButton.click();
  const authRequest = await authRequestPromise;
  expect(new URL(authRequest.url()).pathname).toBe("/api/v001/auth");
  expect(new URL(authRequest.url()).searchParams.get("returnTo")).toBe(
    returnTo,
  );
});

test("shows sign-out for an authenticated session and sends its CSRF token", async ({
  page,
}) => {
  const returnTo = "/settings?tab=appearance#preferences";
  let authenticated = true;
  let signedOutIdentityRequests = 0;
  await page.context().addCookies([
    {
      name: "__Host-sanny_csrf",
      value: "csrf-test-token",
      url: sannyUrl,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v001/auth/me") {
      if (!authenticated) {
        signedOutIdentityRequests++;
        await route.abort("failed");
        return;
      }
      await respondJson(route, {
        email: "user@example.com",
        roles: ["user"],
        permissions: [],
      });
    } else if (path === "/api/v001/auth/logout") {
      authenticated = false;
      await respondJson(route, {
        logoutUrl: `${sannyUrl}/?logout=complete`,
      });
    } else if (path === "/api/v001/users/me") {
      await respondJson(route, { message: "Not authenticated" }, 401);
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  await page.goto(`${sannyUrl}${returnTo}`);
  await page
    .getByRole("button", { name: /^(Account menu|Kontomenü)$/ })
    .click();
  const signOutButton = page
    .locator(".account-menu")
    .getByRole("button", { name: /^(Logout|Abmelden)$/ });
  await expect(signOutButton).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Login|Anmelden)$/ }),
  ).toHaveCount(0);

  const logoutRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === "/api/v001/auth/logout" && request.method() === "POST"
    );
  });
  const logoutNavigationPromise = page.waitForEvent("load");
  await signOutButton.click();
  const logoutRequest = await logoutRequestPromise;

  expect(logoutRequest.headers()["x-csrf-token"]).toBe("csrf-test-token");
  await logoutNavigationPromise;
  await expect(page).toHaveURL(`${sannyUrl}${returnTo}`);
  await expect(
    page.getByRole("heading", { name: /^(Settings|Einstellungen)$/, level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .locator("#main-content")
      .getByRole("button", { name: /^(Login|Anmelden)$/ }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("region", { name: /^(Notifications|Benachrichtigungen)$/ })
      .getByRole("alert"),
  ).toHaveCount(0);
  expect(signedOutIdentityRequests).toBe(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("sanny:logout-return")),
  ).toBeNull();

  let reloadedIdentityRequests = 0;
  await page.route("**/api/v001/auth/me", async (route) => {
    reloadedIdentityRequests++;
    await respondJson(route, { message: "Not authenticated" }, 401);
  });
  await page.reload();
  await expect(
    page
      .locator("#main-content")
      .getByRole("button", { name: /^(Login|Anmelden)$/ }),
  ).toBeEnabled();
  expect(reloadedIdentityRequests).toBeGreaterThan(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unexpected identity network failures still show an error outside logout", async ({
  page,
}) => {
  await page.route("**/api/v001/**", (route) => route.abort("failed"));
  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("session reauthentication preserves the current page", async ({
  page,
}) => {
  const returnTo = "/settings?tab=appearance#preferences";
  await page.route("**/api/v001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v001/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "X-Session-Expires-At": String(Date.now() + 60_000),
          "Access-Control-Expose-Headers": "X-Session-Expires-At",
        },
        body: JSON.stringify({ email: "user@example.com", roles: ["user"] }),
      });
    } else if (path === "/api/v001/auth") {
      await route.fulfill({ status: 200, body: "mocked reauthentication" });
    } else {
      await respondJson(route, { message: "Not found" }, 404);
    }
  });
  await page.goto(`${sannyUrl}${returnTo}`);
  const authRequestPromise = page.waitForRequest((request) => {
    return new URL(request.url()).pathname === "/api/v001/auth";
  });
  await page
    .getByRole("button", { name: /^(Sign in again|Erneut anmelden)$/ })
    .first()
    .click();
  const authUrl = new URL((await authRequestPromise).url());
  expect(authUrl.searchParams.get("returnTo")).toBe(returnTo);
  expect(authUrl.searchParams.get("reauthenticate")).toBe("true");
});
