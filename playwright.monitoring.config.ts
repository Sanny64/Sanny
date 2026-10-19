import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/monitoring",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  workers: 1,
  use: {
    baseURL: process.env.SANNY_E2E_API_URL ?? "https://localhost:8443",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
