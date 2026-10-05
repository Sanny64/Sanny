import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const sannyUrl = "https://127.0.0.1:5176";
const loginUrl = "https://127.0.0.1:5175";

type Language = "en" | "de";

const publicRoutes = [
  { path: "/", content: { en: "Home", de: "Startseite" } },
  {
    path: "/home",
    content: { en: "Home", de: "Startseite" },
    redirectTo: "/",
  },
  { path: "/portfolio", content: { en: "Portfolio", de: "Portfolio" } },
  { path: "/projects", content: { en: "Projects", de: "Projekte" } },
  {
    path: "/projects/haptigation",
    content: { en: "Haptigation", de: "Haptigation" },
  },
  {
    path: "/projects/proscrum",
    content: { en: "Proscrum", de: "Proscrum" },
  },
  { path: "/projects/sau", content: { en: "SAU", de: "SAU" } },
  { path: "/projects/seo", content: { en: "SEOS", de: "SEOS" } },
  { path: "/projects/sm.now", content: { en: "SMNow", de: "SMNow" } },
  { path: "/blog", content: { en: "Blog", de: "Blog" } },
  { path: "/games", content: { en: "Games", de: "Spiele" } },
  { path: "/party", content: { en: "Party", de: "Party" } },
  {
    path: "/party/refreshments",
    content: { en: "Refreshments Kit", de: "Refreshments Kit" },
  },
  {
    path: "/party/comfort",
    content: { en: "Period Comfort Kit", de: "Period Comfort Kit" },
  },
  {
    path: "/error",
    error: {
      en: "Server Error",
      de: "Serverfehler",
      pageTitle: {
        en: "Something went wrong",
        de: "Ein Fehler ist aufgetreten",
      },
    },
  },
  {
    path: "/route-that-does-not-exist",
    error: {
      en: "Page Not Found",
      de: "Seite nicht gefunden",
      pageTitle: {
        en: "Something went wrong",
        de: "Ein Fehler ist aufgetreten",
      },
    },
  },
] as const;

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function routeUnauthenticated(page: Page) {
  await page.route("**/api/v001/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Not authenticated" }),
    }),
  );
}

async function setLanguage(page: Page, language: Language) {
  await page.addInitScript((selectedLanguage) => {
    localStorage.setItem("language", selectedLanguage);
    document.cookie = `language=${selectedLanguage}; path=/`;
  }, language);
}

async function setVisualPreferences(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("language", "en");
    document.cookie = "language=en; path=/";
    localStorage.setItem("theme", "light");
    document.cookie = "theme=light; path=/";
  });
}

async function captureDesktopAndMobile(page: Page, name: string) {
  const viewports = [
    { name: "desktop", width: 1440, height: 960 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.evaluate(async () => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}-${viewport.name}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    });
  }
}

async function routeAdminVisualState(page: Page) {
  await page.route("**/api/v001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === "/api/v001/auth/me") {
      body = {
        email: "admin@example.com",
        name: "Visual Admin",
        roles: ["admin"],
        permissions: ["read:users", "write:users", "delete:users"],
      };
    } else if (path === "/api/v001/users/roles/available") {
      body = { roles: ["admin", "user", "moderator"] };
    } else if (path === "/api/v001/users/list") {
      body = [
        {
          id: 42,
          email: "managed@example.com",
          username: "Managed User",
        },
      ];
    } else if (path === "/api/v001/users/42") {
      body = {
        id: 42,
        email: "managed@example.com",
        username: "Managed User",
      };
    } else if (path === "/api/v001/users/42/roles") {
      body = { roles: ["user"] };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

async function routeAuthenticatedSanny(
  page: Page,
  identity: {
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
  },
) {
  await page.route("**/api/v001/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v001/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(identity),
      });
    } else if (path === "/api/v001/users/me") {
      const request = route.request();
      const username =
        request.method() === "PATCH"
          ? (request.postDataJSON() as { username?: string }).username
          : identity.name;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 7, email: identity.email, username }),
      });
    } else if (path === "/api/v001/users/roles/available") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ roles: ["admin", "user"] }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  });
}

async function tabTo(page: Page, target: ReturnType<Page["getByRole"]>) {
  for (let tabCount = 0; tabCount < 30; tabCount += 1) {
    await page.keyboard.press("Tab");
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error("Keyboard focus did not reach the expected control.");
}

for (const language of ["en", "de"] as const) {
  for (const route of publicRoutes) {
    test(`${language} ${route.path} passes the WCAG 2.2 AA axe audit`, async ({
      page,
    }) => {
      await setLanguage(page, language);
      await routeUnauthenticated(page);
      await page.goto(`${sannyUrl}${route.path}`);

      if ("redirectTo" in route) {
        await expect(page).toHaveURL(`${sannyUrl}${route.redirectTo}`);
      }

      if ("content" in route) {
        await expect(
          page.getByText(route.content[language], { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", {
            name: route.error.pageTitle[language],
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: route.error[language] }),
        ).toBeVisible();
      }

      await expectAccessible(page);
    });
  }

  test(`${language} login helper routes pass the WCAG 2.2 AA axe audit`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    const params = new URLSearchParams({
      primaryUserId: "google-oauth2|google-user",
      secondaryUserId: "auth0|password-user",
      proofUserId: "auth0|password-user",
      continuationState: "test-continuation-state",
      proofState: "a".repeat(43),
      expiresAt: String(Date.now() + 60_000),
    });

    await page.goto(`${loginUrl}/confirm-linking?${params.toString()}`);
    await expect(
      page.getByRole("heading", { name: "Link Your Accounts" }),
    ).toBeVisible();
    await expectAccessible(page);

    const invalidResume = new URLSearchParams({
      state: "invalid-state",
      expiresAt: String(Date.now() + 60_000),
    });
    await page.goto(
      `${loginUrl}/account-link-proof-resume#${invalidResume.toString()}`,
    );
    await expect(page.getByRole("alert")).toContainText(
      "This account verification has expired or is unavailable.",
    );
    await expectAccessible(page);

    await page.addInitScript(() => {
      window.close = () => {};
    });
    await page.goto(
      `${loginUrl}/account-link-proof-complete#error=Authentication%20failed`,
    );
    await expect(
      page.getByText("Completing account verification..."),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test(`${language} authenticated settings and denied admin pass the WCAG 2.2 AA axe audit`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    await routeAuthenticatedSanny(page, {
      email: "user@example.com",
      name: "Regular User",
      roles: ["user"],
      permissions: ["update:me", "delete:me"],
    });

    await page.goto(`${sannyUrl}/settings`);
    await expect(
      page.getByRole("heading", {
        name: language === "en" ? "Settings" : "Einstellungen",
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(language === "en" ? "Username" : "Benutzername"),
    ).toHaveValue("Regular User");
    await expectAccessible(page);

    await page.unrouteAll();
    await routeAuthenticatedSanny(page, {
      email: "user@example.com",
      name: "Regular User",
      roles: ["user"],
      permissions: [],
    });
    await page.goto(`${sannyUrl}/admin/settings`);
    await expect(
      page.getByRole("heading", {
        name:
          language === "en"
            ? "Administrator access is required for this page."
            : "Fuer diese Seite sind Administratorrechte erforderlich.",
      }),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test(`${language} admin allowed state passes the WCAG 2.2 AA axe audit`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    await routeAuthenticatedSanny(page, {
      email: "admin@example.com",
      name: "Admin User",
      roles: ["admin"],
      permissions: ["read:users", "write:users", "delete:users"],
    });

    await page.goto(`${sannyUrl}/admin/settings`);
    await expect(
      page.getByRole("heading", {
        name: language === "en" ? "Admin settings" : "Admin-Einstellungen",
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(
        language === "en" ? "User ID or email" : "Benutzer-ID oder E-Mail",
      ),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test(`${language} skip navigation and sign-in are keyboard accessible`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    await routeUnauthenticated(page);
    await page.goto(`${sannyUrl}/`);

    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    const signIn = page.getByRole("button", {
      name: language === "en" ? "Login" : "Anmelden",
    });
    await expect(signIn).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    const skipLinkStyle = await skipLink.evaluate((element) => ({
      color: getComputedStyle(element).color,
      top: element.getBoundingClientRect().top,
    }));
    expect(skipLinkStyle.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(skipLinkStyle.top).toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Tab");
    await expect(signIn).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test(`${language} settings and admin forms are keyboard operable`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    await routeAuthenticatedSanny(page, {
      email: "user@example.com",
      name: "Regular User",
      roles: ["user"],
      permissions: ["update:me", "delete:me"],
    });
    await page.goto(`${sannyUrl}/settings`);

    const username = page.getByLabel(
      language === "en" ? "Username" : "Benutzername",
    );
    await tabTo(page, username);
    await expect(username).toBeFocused();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Keyboard User");
    await expect(username).toHaveValue("Keyboard User");

    const saveUsername = page.getByRole("button", {
      name: language === "en" ? "Save username" : "Benutzername speichern",
    });
    await tabTo(page, saveUsername);
    await expect(saveUsername).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText: language === "en" ? "Account updated" : "Konto aktualisiert",
      }),
    ).toBeVisible();

    await page.unrouteAll();
    await routeAuthenticatedSanny(page, {
      email: "admin@example.com",
      name: "Admin User",
      roles: ["admin"],
      permissions: ["read:users", "write:users", "delete:users"],
    });
    await page.goto(`${sannyUrl}/admin/settings`);
    const userLookup = page.getByLabel(
      language === "en" ? "User ID or email" : "Benutzer-ID oder E-Mail",
    );
    await tabTo(page, userLookup);
    await expect(userLookup).toBeFocused();
    await page.keyboard.type("managed@example.com");
    await expect(userLookup).toHaveValue("managed@example.com");
  });

  test(`${language} settings and login helper have no narrow/wide horizontal overflow`, async ({
    page,
  }) => {
    await setLanguage(page, language);
    await routeAuthenticatedSanny(page, {
      email: "user@example.com",
      name: "Regular User",
      roles: ["user"],
      permissions: ["update:me", "delete:me"],
    });

    const params = new URLSearchParams({
      primaryUserId: "google-oauth2|google-user",
      secondaryUserId: "auth0|password-user",
      proofUserId: "auth0|password-user",
      continuationState: "test-continuation-state",
      proofState: "a".repeat(43),
      expiresAt: String(Date.now() + 60_000),
    });

    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${sannyUrl}/settings`);
      await expect(
        page.getByLabel(language === "en" ? "Username" : "Benutzername"),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);

      await page.goto(`${loginUrl}/confirm-linking?${params.toString()}`);
      await expect(
        page.getByRole("heading", { name: "Link Your Accounts" }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    }
  });
}

test("account-link confirmation passes the WCAG 2.2 AA axe audit", async ({
  page,
}) => {
  const params = new URLSearchParams({
    primaryUserId: "google-oauth2|google-user",
    secondaryUserId: "auth0|password-user",
    proofUserId: "auth0|password-user",
    continuationState: "test-continuation-state",
    proofState: "test-proof-state",
    expiresAt: String(Date.now() + 60_000),
  });

  await page.goto(`/confirm-linking?${params.toString()}`);
  await expect(
    page.getByRole("heading", { name: "Link Your Accounts" }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("settings and denied admin states pass the WCAG 2.2 AA axe audit", async ({
  page,
}) => {
  await routeUnauthenticated(page);
  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expectAccessible(page);

  await page.unrouteAll();
  await page.route("**/api/v001/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: "user@example.com",
        name: "Regular User",
        roles: ["user"],
        permissions: [],
      }),
    }),
  );
  await page.goto(`${sannyUrl}/admin/settings`);
  await expect(
    page.getByRole("heading", {
      name: "Administrator access is required for this page.",
    }),
  ).toBeVisible();
  await expectAccessible(page);
});

test("account-link confirmation works by keyboard and on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.open = () => null;
  });

  const params = new URLSearchParams({
    primaryUserId: "google-oauth2|google-user",
    secondaryUserId: "auth0|password-user",
    proofUserId: "auth0|password-user",
    continuationState: "test-continuation-state",
    proofState: "test-proof-state",
    expiresAt: String(Date.now() + 60_000),
  });
  await page.goto(`/confirm-linking?${params.toString()}`);

  const continueButton = page.getByRole("button", {
    name: "Authenticate & Continue",
  });
  let reachedButton = false;
  for (let tabCount = 0; tabCount < 20; tabCount += 1) {
    await page.keyboard.press("Tab");
    if (
      await continueButton.evaluate(
        (button) => button === document.activeElement,
      )
    ) {
      reachedButton = true;
      break;
    }
  }

  expect(reachedButton).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Popup was blocked.");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("mobile settings visual baseline remains stable", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Visual baselines use Chromium.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await routeUnauthenticated(page);
  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(page).toHaveScreenshot("settings-mobile.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.02,
  });
});

test("Chromium visual baselines: public home desktop and mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Visual baselines use Chromium.",
  );
  await setVisualPreferences(page);
  await routeUnauthenticated(page);
  await page.goto(`${sannyUrl}/`);
  await expect(page.getByText("Home", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  await captureDesktopAndMobile(page, "public-home");
});

test("Chromium visual baselines: login helper desktop and mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Visual baselines use Chromium.",
  );
  await setVisualPreferences(page);
  const params = new URLSearchParams({
    primaryUserId: "google-oauth2|google-user",
    secondaryUserId: "auth0|password-user",
    proofUserId: "auth0|password-user",
    continuationState: "visual-baseline-state",
    proofState: "a".repeat(43),
    expiresAt: String(Date.now() + 60_000),
  });
  await page.goto(`${loginUrl}/confirm-linking?${params.toString()}`);
  await expect(
    page.getByRole("heading", { name: "Link Your Accounts" }),
  ).toBeVisible();
  await captureDesktopAndMobile(page, "login-account-link");
});

test("Chromium visual baselines: account settings desktop and mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Visual baselines use Chromium.",
  );
  await setVisualPreferences(page);
  await routeAuthenticatedSanny(page, {
    email: "visual@example.com",
    name: "Visual Account",
    roles: ["user"],
    permissions: ["update:me", "delete:me"],
  });
  await page.goto(`${sannyUrl}/settings`);
  await expect(page.getByLabel("Username")).toHaveValue("Visual Account");
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to German" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Test account endpoints" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save username" }),
  ).toBeVisible();
  await captureDesktopAndMobile(page, "account-settings");
});

test("Chromium visual baselines: populated admin desktop and mobile", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Visual baselines use Chromium.",
  );
  await setVisualPreferences(page);
  await routeAdminVisualState(page);
  await page.goto(`${sannyUrl}/admin/settings`);
  await expect(
    page.getByRole("heading", { name: "Admin settings" }),
  ).toBeVisible();
  await page.getByLabel("User ID or email").fill("42");
  await page.getByRole("button", { name: "Load user" }).click();
  await expect(page.getByLabel("Username")).toHaveValue("Managed User");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await captureDesktopAndMobile(page, "admin-user-editor");
});
