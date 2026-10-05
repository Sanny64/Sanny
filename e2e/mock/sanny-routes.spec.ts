import { expect, test, type Page } from "@playwright/test";

const sannyUrl = "https://127.0.0.1:5176";

type Language = "en" | "de";

const errorPageTitle: Record<Language, string> = {
  en: "Something went wrong",
  de: "Ein Fehler ist aufgetreten",
};

const routes = [
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
    },
  },
  {
    path: "/route-that-does-not-exist",
    error: {
      en: "Page Not Found",
      de: "Seite nicht gefunden",
    },
  },
] as const;

async function setLanguage(page: Page, language: Language) {
  await page.addInitScript((selectedLanguage) => {
    localStorage.setItem("language", selectedLanguage);
    document.cookie = `language=${selectedLanguage}; path=/`;
  }, language);
}

for (const route of routes) {
  test(`Sanny route ${route.path} renders its translated page`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    for (const language of ["en", "de"] as const) {
      await setLanguage(page, language);
      await page.goto(`${sannyUrl}${route.path}`);

      if ("redirectTo" in route) {
        await expect(page).toHaveURL(`${sannyUrl}${route.redirectTo}`);
      }

      if ("content" in route) {
        await expect(
          page.getByText(route.content[language], { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: errorPageTitle[language] }),
        ).toHaveCount(0);
      } else {
        await expect(
          page.getByRole("heading", { name: errorPageTitle[language] }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: route.error[language] }),
        ).toBeVisible();
      }
    }

    expect(pageErrors).toEqual([]);
  });
}
