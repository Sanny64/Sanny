import { defineConfig } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import frontendConfig from "./playwright.config.ts";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

const apiUrl =
  process.env.SANNY_E2E_API_URL ??
  process.env.VITE_API_URL ??
  "https://localhost:8443";

const backendEnvironment: Record<string, string | undefined> = {};
loadDotenv({
  path: fileURLToPath(new URL("../../backend/.env", import.meta.url)),
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
  testDir: fileURLToPath(new URL("./real", import.meta.url)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: frontendConfig.projects?.filter(
    (project) => project.name !== "webkit",
  ),
  webServer: [
    {
      command: "npm run dev -w sanny -- --host 127.0.0.1 --port 5178",
      cwd: workspaceRoot,
      url: "https://127.0.0.1:5178",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      env: { VITE_API_URL: apiUrl },
      timeout: 120_000,
    },
  ],
  use: {
    trace: "off",
    screenshot: "off",
  },
});
