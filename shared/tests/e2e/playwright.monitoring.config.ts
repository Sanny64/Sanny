import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../playwright.config.ts';
import {
  applyBackendTestEnvironment,
  MONITORING_CREDENTIALS,
} from './backend-environment.ts';

if (
  process.env.RUN_CRITICAL_TESTS === 'true' ||
  process.env.RUN_429_SPIKE_E2E === 'true' ||
  process.env.RUN_DISCORD_INTEGRATION === 'true' ||
  process.env.RUN_EMAIL_INTEGRATION === 'true'
) {
  applyBackendTestEnvironment(MONITORING_CREDENTIALS);

  const missingCredentials = MONITORING_CREDENTIALS.filter(
    (key) => !process.env[key]?.trim()
  );
  if (missingCredentials.length > 0) {
    throw new Error(
      `The opted-in monitoring tests require ${missingCredentials.join(' and ')}. Set them in the environment or apps/backend/.env; only these four credentials are read by this test config.`
    );
  }
}

export default defineConfig({
  ...baseConfig,
  testDir: fileURLToPath(new URL('./monitoring', import.meta.url)),
  outputDir: fileURLToPath(new URL('../../../test-results', import.meta.url)),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  workers: 1,
  use: {
    baseURL:
      process.env.E2E_API_URL ??
      process.env.VITE_API_URL ??
      'https://localhost:8443',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
