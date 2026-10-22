import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../playwright.config.ts';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  ...baseConfig,
  testDir: fileURLToPath(new URL('./docs', import.meta.url)),
  outputDir: fileURLToPath(new URL('../../../test-results', import.meta.url)),
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command:
        'npm run build -w documentation && npm run serve -w documentation -- --host 127.0.0.1 --port 5177 --no-open',
      cwd: workspaceRoot,
      url: 'http://127.0.0.1:5177',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
