import { expect, test, type Route } from "@playwright/test";

const sannyUrl = "https://127.0.0.1:5176";

async function respondJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function respondEmpty(route: Route) {
  await route.fulfill({ status: 204 });
}

test("updates, resets, and deletes a mocked own account", async ({ page }) => {
  let updateBody: { username?: string } | undefined;
  let resetRequests = 0;
  let deleteRequests = 0;

  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "account@example.com",
        name: "Account Test",
        roles: ["user"],
        permissions: ["update:me", "delete:me"],
      });
    } else if (path === "/api/v001/users/me" && request.method() === "GET") {
      await respondJson(route, {
        id: 7,
        email: "account@example.com",
        username: "Account Test",
      });
    } else if (path === "/api/v001/users/me" && request.method() === "PATCH") {
      updateBody = request.postDataJSON() as { username?: string };
      await respondJson(route, {
        id: 7,
        email: "account@example.com",
        username: updateBody.username,
      });
    } else if (path === "/api/v001/users/me/password-reset") {
      resetRequests += 1;
      await respondEmpty(route);
    } else if (path === "/api/v001/users/me" && request.method() === "DELETE") {
      deleteRequests += 1;
      await respondEmpty(route);
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${sannyUrl}/settings`);

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue("Account Test");

  await page.getByLabel("Username").fill("Updated Test Account");
  await page.getByRole("button", { name: "Save username" }).click();
  await expect
    .poll(() => updateBody)
    .toEqual({
      username: "Updated Test Account",
    });

  await page.getByRole("button", { name: "Password reset" }).click();
  await expect.poll(() => resetRequests).toBe(1);

  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect.poll(() => deleteRequests).toBe(1);
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
});

test("creates a local account when none exists", async ({ page }) => {
  let createBody: unknown;

  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "new-account@example.com",
        name: "New Account",
        roles: ["user"],
        permissions: ["update:me"],
      });
    } else if (path === "/api/v001/users/me" && request.method() === "GET") {
      await respondJson(route, { message: "User not found" }, 404);
    } else if (path === "/api/v001/users/me" && request.method() === "POST") {
      createBody = request.postDataJSON();
      await respondJson(route, {
        id: 8,
        email: "new-account@example.com",
        username: "New Account",
      });
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByText("No local account exists yet.")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.poll(() => createBody).toEqual({});
  await expect(page.getByLabel("Username")).toHaveValue("New Account");
});

test("loads an admin user, updates roles, resets, and deletes that mocked user", async ({
  page,
}) => {
  let usernameBody: { username?: string } | undefined;
  let rolesBody: { roles?: string[] } | undefined;
  let resetRequests = 0;
  let deleteRequests = 0;

  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "admin@example.com",
        name: "Admin Test",
        roles: ["admin"],
        permissions: ["read:users", "write:users", "delete:users"],
      });
    } else if (path === "/api/v001/users/roles/available") {
      await respondJson(route, { roles: ["admin", "user", "moderator"] });
    } else if (path === "/api/v001/users/list") {
      await respondJson(route, [
        { id: 42, email: "managed@example.com", username: "Managed User" },
      ]);
    } else if (
      path === "/api/v001/users/42/roles" &&
      request.method() === "GET"
    ) {
      await respondJson(route, { roles: ["user"] });
    } else if (path === "/api/v001/users/42" && request.method() === "PATCH") {
      usernameBody = request.postDataJSON() as { username?: string };
      await respondJson(route, {
        id: 42,
        email: "managed@example.com",
        username: usernameBody.username,
      });
    } else if (
      path === "/api/v001/users/42/roles" &&
      request.method() === "PATCH"
    ) {
      rolesBody = request.postDataJSON() as { roles?: string[] };
      await respondJson(route, { roles: rolesBody.roles });
    } else if (path === "/api/v001/users/42/password-reset") {
      resetRequests += 1;
      await respondEmpty(route);
    } else if (path === "/api/v001/users/42" && request.method() === "DELETE") {
      deleteRequests += 1;
      await respondEmpty(route);
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${sannyUrl}/admin/settings`);
  await expect(
    page.getByRole("heading", { name: "Admin settings" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Load allusers" }).click();
  await page.getByRole("button", { name: "Select user" }).first().click();
  await expect(page.getByLabel("Username")).toHaveValue("Managed User");

  await page.getByLabel("Username").fill("Updated Managed User");
  await page.getByRole("checkbox", { name: "moderator" }).check();
  await page.getByRole("button", { name: "Save user" }).click();

  await expect
    .poll(() => usernameBody)
    .toEqual({
      username: "Updated Managed User",
    });
  await expect.poll(() => rolesBody).toEqual({ roles: ["user", "moderator"] });

  await page.getByRole("button", { name: "Password reset" }).click();
  await expect.poll(() => resetRequests).toBe(1);
  await page.getByRole("button", { name: "Delete user" }).click();
  await expect.poll(() => deleteRequests).toBe(1);
});

test("allows an admin to update their own roles", async ({ page }) => {
  let rolesBody: { roles?: string[] } | undefined;

  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "admin@example.com",
        name: "Admin Test",
        roles: ["admin"],
        permissions: ["read:users", "write:users"],
      });
    } else if (path === "/api/v001/users/roles/available") {
      await respondJson(route, { roles: ["admin", "user", "moderator"] });
    } else if (path === "/api/v001/users/list") {
      await respondJson(route, [
        { id: 43, email: "admin@example.com", username: "Admin Test" },
      ]);
    } else if (
      path === "/api/v001/users/43/roles" &&
      request.method() === "GET"
    ) {
      await respondJson(route, { roles: ["admin", "user"] });
    } else if (
      path === "/api/v001/users/43/roles" &&
      request.method() === "PATCH"
    ) {
      rolesBody = request.postDataJSON() as { roles?: string[] };
      await respondJson(route, { roles: rolesBody.roles });
    } else if (path === "/api/v001/users/43" && request.method() === "PATCH") {
      const body = request.postDataJSON() as { username?: string };
      await respondJson(route, {
        id: 43,
        email: "admin@example.com",
        username: body.username,
      });
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  await page.goto(`${sannyUrl}/admin/settings`);
  await page.getByRole("button", { name: "Load allusers" }).click();
  await page.getByRole("button", { name: "Select user" }).first().click();
  await page.getByRole("checkbox", { name: "moderator" }).check();
  await page.getByRole("button", { name: "Save user" }).click();

  await expect
    .poll(() => rolesBody)
    .toEqual({
      roles: ["admin", "user", "moderator"],
    });
});

test("denies the admin page to a non-admin without loading protected data", async ({
  page,
}) => {
  let protectedRequests = 0;

  await page.route("**/api/v001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "user@example.com",
        name: "Regular User",
        roles: ["user"],
        permissions: [],
      });
    } else {
      protectedRequests += 1;
      await respondJson(route, { message: "Forbidden" }, 403);
    }
  });

  await page.goto(`${sannyUrl}/admin/settings`);

  await expect(
    page.getByRole("heading", {
      name: "Administrator access is required for this page.",
    }),
  ).toBeVisible();
  expect(protectedRequests).toBe(0);
});

test("switches and persists the settings page language and theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("language")) {
      localStorage.setItem("language", "en");
    }
  });
  await page.route("**/api/v001/auth/me", async (route) => {
    await respondJson(route, { message: "Not authenticated" }, 401);
  });

  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.getByText("Language: en", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Switch to German" }).click();
  await expect(page.getByText("Sprache: de", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Einstellungen" }),
  ).toBeVisible();
  await expect(page.getByText("Sprache: de", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Wechselt zu Englisch" }).click();
  await expect(page.getByText("Language: en", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
});

test("starts MFA reauthentication when deleting an account requires it", async ({
  page,
}) => {
  await page.route("**/api/v001/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === "/api/v001/auth/me") {
      await respondJson(route, {
        email: "account@example.com",
        name: "Account Test",
        roles: ["user"],
        permissions: ["delete:me"],
      });
    } else if (path === "/api/v001/users/me" && request.method() === "GET") {
      await respondJson(route, {
        id: 7,
        email: "account@example.com",
        username: "Account Test",
      });
    } else if (path === "/api/v001/users/me" && request.method() === "DELETE") {
      await respondJson(
        route,
        {
          message: "MFA authentication required",
          resumeToken: "test-resume-token",
        },
        401,
      );
    } else if (path === "/api/v001/auth") {
      await route.fulfill({ status: 200, contentType: "text/html", body: "" });
    } else {
      await respondJson(route, { message: `Unexpected request: ${path}` }, 500);
    }
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${sannyUrl}/settings`);
  const authRequestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/v001/auth" && url.searchParams.has("mfa");
  });

  await page.getByRole("button", { name: "Delete my account" }).click();
  const authRequest = await authRequestPromise;
  const authUrl = new URL(authRequest.url());

  expect(authUrl.searchParams.get("mfa")).toBe("true");
  expect(authUrl.searchParams.get("returnTo")).toBe("/settings");
});
