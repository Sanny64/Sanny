import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const authUrl = 'https://127.0.0.1:5175';
type Language = 'en' | 'de';
type Theme = 'light' | 'dark';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function setLanguage(page: Page, language: Language, theme: Theme) {
  await page.addInitScript(
    ({ selectedLanguage, selectedTheme }) => {
      localStorage.setItem('language', selectedLanguage);
      document.cookie = `language=${selectedLanguage}; path=/`;
      localStorage.setItem('theme', selectedTheme);
      document.cookie = `theme=${selectedTheme}; path=/`;
    },
    { selectedLanguage: language, selectedTheme: theme }
  );
}

async function setVisualPreferences(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    document.cookie = 'language=en; path=/';
    localStorage.setItem('theme', 'light');
    document.cookie = 'theme=light; path=/';
  });
}

function accountLinkParams() {
  return new URLSearchParams({
    primaryUserId: 'google-oauth2|google-user',
    secondaryUserId: 'auth0|password-user',
    proofUserId: 'auth0|password-user',
    continuationState: 'test-continuation-state',
    proofState: 'a'.repeat(43),
    expiresAt: String(Date.now() + 60_000),
  });
}

async function captureDesktopAndMobile(page: Page) {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 960 },
    { name: 'mobile', width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.evaluate(async () => document.fonts.ready);
    await expect
      .poll(() =>
        page
          .locator('.app-brand img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBeGreaterThan(0);
    await expect(page).toHaveScreenshot(
      `auth-account-link-${viewport.name}.png`,
      {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      }
    );
  }
}

test('Auth root exposes accessible shared appearance controls and persists preferences', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('language')) {
      localStorage.setItem('language', 'en');
      document.cookie = 'language=en; path=/';
    }
    if (!localStorage.getItem('theme')) {
      localStorage.setItem('theme', 'light');
      document.cookie = 'theme=light; path=/';
    }
  });
  await page.goto(authUrl);
  await expect(
    page.getByRole('heading', { name: 'Authentication', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('No authentication request is active.')
  ).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Switch to German' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(
    page.getByRole('heading', { name: 'Authentifizierung', exact: true })
  ).toBeVisible();
  await expectAccessible(page);
});

for (const theme of ['light', 'dark'] as const) {
  for (const language of ['en', 'de'] as const) {
    test(`${language} ${theme} Auth helper routes pass the WCAG 2.2 AA axe audit`, async ({
      page,
    }) => {
      await setLanguage(page, language, theme);
      await page.goto(
        `${authUrl}/confirm-linking?${accountLinkParams().toString()}`
      );
      await expect(
        page.getByRole('heading', { name: 'Link Your Accounts' })
      ).toBeVisible();
      await expectAccessible(page);

      const invalidResume = new URLSearchParams({
        state: 'invalid-state',
        expiresAt: String(Date.now() + 60_000),
      });
      await page.goto(
        `${authUrl}/account-link-proof-resume#${invalidResume.toString()}`
      );
      await expect(page.getByRole('alert')).toContainText(
        'This account verification has expired or is unavailable.'
      );
      await expectAccessible(page);

      await page.addInitScript(() => {
        window.close = () => {};
      });
      await page.goto(
        `${authUrl}/account-link-proof-complete#error=Authentication%20failed`
      );
      await expect(
        page.getByText('Completing account verification...')
      ).toBeVisible();
      await expectAccessible(page);
    });

    test(`${language} ${theme} Auth account linking has no narrow/wide overflow`, async ({
      page,
    }) => {
      await setLanguage(page, language, theme);
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(
          `${authUrl}/confirm-linking?${accountLinkParams().toString()}`
        );
        await expect(
          page.getByRole('heading', { name: 'Link Your Accounts' })
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth
            )
          )
          .toBe(true);
      }
    });
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} Auth account-link confirmation works by keyboard on mobile`, async ({
    page,
  }) => {
    await setLanguage(page, 'en', theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto(
      `${authUrl}/confirm-linking?${accountLinkParams().toString()}`
    );

    const continueButton = page.getByRole('button', {
      name: 'Authenticate & Continue',
    });
    let reachedButton = false;
    for (let tabCount = 0; tabCount < 20; tabCount += 1) {
      await page.keyboard.press('Tab');
      if (
        await continueButton.evaluate(
          (button) => button === document.activeElement
        )
      ) {
        reachedButton = true;
        break;
      }
    }

    expect(reachedButton).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Popup was blocked.');
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      )
      .toBe(true);
  });
}

test('Chromium visual baselines: Auth account-link helper desktop and mobile', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Visual baselines use Chromium.'
  );
  await setVisualPreferences(page);
  await page.goto(
    `${authUrl}/confirm-linking?${accountLinkParams().toString()}`
  );
  await expect(
    page.getByRole('heading', { name: 'Link Your Accounts' })
  ).toBeVisible();
  await captureDesktopAndMobile(page);
});
