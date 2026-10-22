import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../playwright.config.ts';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig(baseConfig, {
  testDir: fileURLToPath(new URL('./mock', import.meta.url)),
  fullyParallel: true,
  workers: Number.parseInt(process.env.PW_WORKERS ?? '2', 10),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  webServer: [
    {
      command: 'npm run dev -w auth -- --host 127.0.0.1 --port 5175',
      cwd: workspaceRoot,
      url: 'https://127.0.0.1:5175',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: 'https://127.0.0.1:8443' },
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w sanny -- --host 127.0.0.1 --port 5176',
      cwd: workspaceRoot,
      url: 'https://127.0.0.1:5176',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: 'https://127.0.0.1:8443' },
      timeout: 120_000,
    },
  ],
});
