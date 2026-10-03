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

  await page.goto(`${sannyUrl}/`);
  const signInButton = page.getByRole("button", {
    name: /^(Login|Anmelden)$/,
  });
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
});

test("shows sign-out for an authenticated session and sends its CSRF token", async ({
  page,
}) => {
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
      await respondJson(route, {
        email: "user@example.com",
        roles: ["user"],
        permissions: [],
      });
    } else if (path === "/api/v001/auth/logout") {
      await respondJson(route, {
        logoutUrl: `${sannyUrl}/?logout=complete`,
      });
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  await page.goto(`${sannyUrl}/`);
  const signOutButton = page.getByRole("button", {
    name: /^(Logout|Abmelden)$/,
  });
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
  await signOutButton.click();
  const logoutRequest = await logoutRequestPromise;

  expect(logoutRequest.headers()["x-csrf-token"]).toBe("csrf-test-token");
  await page.waitForURL(`${sannyUrl}/?logout=complete`);
});
