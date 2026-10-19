import { defineConfig } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import frontendConfig from "./playwright.config.ts";

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
  if (process.env[key] === undefined && backendEnvironment[key] !== undefined) {
    process.env[key] = backendEnvironment[key];
  }
}

export default defineConfig(frontendConfig, {
  testDir: "./e2e/real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    trace: "off",
    screenshot: "off",
  },
});
