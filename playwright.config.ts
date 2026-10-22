import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './shared/tests/e2e',
  outputDir: './test-results',
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: ['**/*accessibility.spec.ts', '**/sanny-routes.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
  use: {
    baseURL: 'https://127.0.0.1:5175',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
