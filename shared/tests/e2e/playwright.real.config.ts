import { defineConfig } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../playwright.config.ts';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

const apiUrl =
  process.env.SANNY_E2E_API_URL ??
  process.env.VITE_API_URL ??
  'https://localhost:8443';

const backendEnvironment: Record<string, string | undefined> = {};
loadDotenv({
  path: fileURLToPath(new URL('../../../apps/backend/.env', import.meta.url)),
  processEnv: backendEnvironment,
  quiet: true,
});

for (const key of ['TESTUSER_EMAIL', 'TESTUSER_PASSWORD']) {
  if (process.env[key] === undefined && backendEnvironment[key] !== undefined) {
    process.env[key] = backendEnvironment[key];
  }
}

const missingCredentials = ['TESTUSER_EMAIL', 'TESTUSER_PASSWORD'].filter(
  (key) => !process.env[key]?.trim()
);
if (missingCredentials.length > 0) {
  throw new Error(
    `Live Auth0 tests require ${missingCredentials.join(' and ')}. Set these in the environment or in apps/backend/.env; credentials are read only by this explicitly selected live-test config.`
  );
}

export default defineConfig(baseConfig, {
  testDir: fileURLToPath(new URL('./real', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: (baseConfig.projects ?? []).filter(
    (project) => project.name !== 'webkit'
  ),
  webServer: [
    {
      command: 'npm run dev -w sanny -- --host 127.0.0.1 --port 5178',
      cwd: workspaceRoot,
      url: 'https://127.0.0.1:5178',
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      env: { VITE_API_URL: apiUrl },
      timeout: 120_000,
    },
  ],
  use: {
    trace: 'off',
    screenshot: 'off',
  },
});
