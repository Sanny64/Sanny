import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/monitoring",
  fullyParallel: false,
  reporter: "list",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL:
      (
        globalThis as typeof globalThis & {
          process?: { env?: Record<string, string | undefined> };
        }
      ).process?.env?.SANNY_E2E_API_URL ?? "https://localhost:8443",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
