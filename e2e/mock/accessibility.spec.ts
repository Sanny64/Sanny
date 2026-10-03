import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const sannyUrl = "https://127.0.0.1:5176";

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
