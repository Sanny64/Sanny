import { expect, test } from '@playwright/test';

const navigationToggle = (page: import('@playwright/test').Page) =>
  page.getByRole('button', {
    name: /^(Toggle navigation bar|Navigationsleiste umschalten)$/,
  });

test('mobile documentation navigation can be reopened after returning to the main menu', async ({
  page,
}) => {
  await page.goto('/');
  await navigationToggle(page).click();

  const mainNavigation = page.getByRole('navigation', {
    name: /^(Main|Hauptnavigation)$/,
  });
  const documentationLink = mainNavigation.getByRole('link', {
    name: /^(Documentation|Dokumentation)$/,
  });
  const backButton = page.getByRole('button', {
    name: /^(← Back to main menu|← Zurück zum Hauptmenü)$/,
  });

  await documentationLink.click();
  await expect(page).toHaveURL(/\/docs\/start$/);
  await expect(backButton).toBeInViewport({ ratio: 0.9 });

  await backButton.click();
  await expect(backButton).not.toBeInViewport({ ratio: 0.9 });
  await expect(documentationLink).toBeInViewport({ ratio: 0.9 });

  await documentationLink.click();
  await expect(backButton).toBeInViewport({ ratio: 0.9 });
});

test('mobile language menu switches between German and English', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await navigationToggle(page).click();
  await page.getByRole('button', { name: 'Languages' }).click();
  await page.getByRole('link', { name: 'Deutsch', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');

  await navigationToggle(page).click();
  await page.getByRole('button', { name: 'Sprachen' }).click();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
