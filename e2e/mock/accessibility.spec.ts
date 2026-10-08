import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const applications = [
  {
    name: "Login",
    url: "https://127.0.0.1:5175/confirm-linking?primaryUserId=google-oauth2%7Cgoogle-user&secondaryUserId=auth0%7Cpassword-user&proofUserId=auth0%7Cpassword-user&continuationState=test-continuation-state&proofState=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&expiresAt=4102444800000",
  },
  {
    name: "Sanny",
    url: "https://127.0.0.1:5176/",
  },
] as const;

async function setPreferences(
  page: Page,
  language: "en" | "de",
  theme: "light" | "dark",
) {
  await page.addInitScript(
    ({ selectedLanguage, selectedTheme }) => {
      localStorage.setItem("language", selectedLanguage);
      document.cookie = `language=${selectedLanguage}; path=/`;
      localStorage.setItem("theme", selectedTheme);
      document.cookie = `theme=${selectedTheme}; path=/`;
    },
    { selectedLanguage: language, selectedTheme: theme },
  );
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

for (const application of applications) {
  for (const language of ["en", "de"] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`${application.name} initializes ${language} language and ${theme} theme accessibly`, async ({
        page,
      }) => {
        await setPreferences(page, language, theme);
        if (application.name === "Sanny") {
          await page.route("**/api/v001/auth/me", (route) =>
            route.fulfill({
              status: 401,
              contentType: "application/json",
              body: JSON.stringify({ message: "Not authenticated" }),
            }),
          );
        }

        await page.goto(application.url);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (application.name === "Sanny") {
          await expect(
            page.getByText(language === "en" ? "Home" : "Startseite", {
              exact: true,
            }),
          ).toBeVisible();
        }
        await expectAccessible(page);
      });
    }
  }
}

test("Sanny follows system color scheme until a user theme override is selected", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.removeItem("theme");
    document.cookie = "theme=; Max-Age=0; path=/";
    localStorage.setItem("language", "en");
    document.cookie = "language=en; path=/";
  });
  await page.route("**/api/v001/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Not authenticated" }),
    }),
  );
  await page.goto("https://127.0.0.1:5176/settings");

  const documentElement = page.locator("html");
  await expect(documentElement).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(documentElement).toHaveAttribute("data-theme", "light");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(documentElement).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);

  await page.emulateMedia({ colorScheme: "light" });
  await expect(documentElement).toHaveAttribute("data-theme", "dark");
  await expectAccessible(page);
});
