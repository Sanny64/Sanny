import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../playwright.config.ts';

if (process.env.RUN_429_SPIKE_E2E === 'true') {
  const backendEnvironment: Record<string, string | undefined> = {};
  loadDotenv({
    path: fileURLToPath(new URL('../../../apps/backend/.env', import.meta.url)),
    processEnv: backendEnvironment,
    quiet: true,
  });

  for (const key of [
    'NGINX_BASIC_AUTH_USER',
    'NGINX_BASIC_AUTH_PASSWORD',
    'GRAFANA_ADMIN_USER',
    'GRAFANA_ADMIN_PASSWORD',
  ]) {
    if (
      process.env[key] === undefined &&
      backendEnvironment[key] !== undefined
    ) {
      process.env[key] = backendEnvironment[key];
    }
  }

  const missingCredentials = [
    'NGINX_BASIC_AUTH_USER',
    'NGINX_BASIC_AUTH_PASSWORD',
    'GRAFANA_ADMIN_USER',
    'GRAFANA_ADMIN_PASSWORD',
  ].filter((key) => !process.env[key]?.trim());
  if (missingCredentials.length > 0) {
    throw new Error(
      `The opted-in 429 spike test requires ${missingCredentials.join(' and ')}. Set them in the environment or apps/backend/.env; only these four credentials are read by this test config.`
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
      process.env.SANNY_E2E_API_URL ??
      process.env.VITE_API_URL ??
      'https://localhost:8443',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
