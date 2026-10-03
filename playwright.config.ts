import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

const selectedRealSuite = process.argv.some((argument) =>
  argument.replaceAll("\\", "/").includes("e2e/real"),
);

if (selectedRealSuite) {
  const backendEnvironment: Record<string, string | undefined> = {};
  loadDotenv({
    path: "backend/.env",
    processEnv: backendEnvironment,
    quiet: true,
  });

  for (const key of [
    "TESTUSER_EMAIL",
    "TESTUSER_PASSWORD",
    "TESTGOOGLEUSER_EMAIL",
    "TESTGOOGLEUSER_PASSWORD",
  ]) {
    if (
      process.env[key] === undefined &&
      backendEnvironment[key] !== undefined
    ) {
      process.env[key] = backendEnvironment[key];
    }
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:5175",
    ignoreHTTPSErrors: true,
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
      name: "edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: [
    {
      command: "npm run dev -w login -- --host 127.0.0.1 --port 5175",
      url: "https://127.0.0.1:5175",
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -w sanny -- --host 127.0.0.1 --port 5176",
      url: "https://127.0.0.1:5176",
      ignoreHTTPSErrors: true,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
