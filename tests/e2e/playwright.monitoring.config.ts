import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: fileURLToPath(new URL("./monitoring", import.meta.url)),
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
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
