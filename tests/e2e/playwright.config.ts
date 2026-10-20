import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL("./mock", import.meta.url)),
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:5175",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testMatch: ["**/*accessibility.spec.ts", "**/sanny-routes.spec.ts"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: [
    {
      command: "npm run dev -w auth -- --host 127.0.0.1 --port 5175",
      cwd: workspaceRoot,
      url: "https://127.0.0.1:5175",
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: "https://127.0.0.1:8443" },
      timeout: 120_000,
    },
    {
      command: "npm run dev -w sanny -- --host 127.0.0.1 --port 5176",
      cwd: workspaceRoot,
      url: "https://127.0.0.1:5176",
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: "https://127.0.0.1:8443" },
      timeout: 120_000,
    },
  ],
});
