import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FULL_GATE_SCRIPTS = [
  "test:ci",
  "test:e2e:real",
  "test:e2e:429-spike",
];

export const BACKEND_DEPENDENT_SCRIPTS = new Set([
  "test:e2e:real",
  "test:e2e:429-spike",
]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BACKEND_START_TIMEOUT_MS = 180_000;

export function backendHealthUrl(env = process.env) {
  return new URL(
    "/healthcheck",
    env.SANNY_E2E_API_URL ?? env.VITE_API_URL ?? "https://localhost:8443",
  );
}

function isBackendHealthy(url) {
  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        // The local development stack uses a self-signed certificate.
        rejectUnauthorized: !LOOPBACK_HOSTS.has(url.hostname),
        timeout: 5_000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

async function ensureBackendRunning(
  npmCli,
  getActiveChild,
  setActiveChild,
  isCancelled,
  onBackendStart,
) {
  const url = backendHealthUrl();
  if (await isBackendHealthy(url)) {
    console.log(`Backend is already running at ${url.origin}.`);
    return 0;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    console.error(`Backend at ${url.origin} is unreachable.`);
    return 1;
  }

  console.log(`Backend at ${url.origin} is not running; starting it.`);
  onBackendStart();
  const startExitCode = await runScript(
    npmCli,
    "start:backend",
    getActiveChild,
    setActiveChild,
  );
  if (isCancelled()) return 1;
  if (startExitCode !== 0) {
    console.error(
      "Unable to start the backend; create the stack with `npm run restart:stack`.",
    );
    return startExitCode;
  }
  const deadline = performance.now() + BACKEND_START_TIMEOUT_MS;
  while (performance.now() < deadline && !isCancelled()) {
    if (await isBackendHealthy(url)) {
      console.log(`Backend is ready at ${url.origin}.`);
      return 0;
    }
    await delay(2_000);
  }
  console.error(`Backend did not become healthy at ${url.origin}.`);
  return 1;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    "0",
  );
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours ? `${hours}:` : ""}${minutes}:${seconds}`;
}

async function runScript(npmCli, scriptName, getActiveChild, setActiveChild) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [npmCli, "run", scriptName], {
      stdio: "inherit",
    });
    setActiveChild(child);

    child.once("error", (error) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      console.error(`Unable to start ${scriptName}: ${error.message}`);
      resolve(1);
    });
    child.once("close", (code, signal) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error("Cannot locate the npm CLI; run this script through npm.");
    process.exitCode = 1;
    return;
  }

  const startedAt = performance.now();
  const timestamp = () => new Date().toISOString();
  let activeChild;
  let receivedSignal;
  let backendChecked = false;
  let backendStarted = false;
  const getActiveChild = () => activeChild;
  const setActiveChild = (child) => {
    activeChild = child;
  };
  const forwardSignal = (signal) => {
    receivedSignal ??= signal;
    // Ctrl+C already reaches every process in the console; killing npm here
    // would orphan its children (on Windows) before Docker test stacks are removed.
    if (signal !== "SIGINT") activeChild?.kill(signal);
  };
  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  console.log(`[${timestamp()}] Starting the full test suite.`);
  let exitCode = 0;
  try {
    for (const scriptName of FULL_GATE_SCRIPTS) {
      if (BACKEND_DEPENDENT_SCRIPTS.has(scriptName) && !backendChecked) {
        backendChecked = true;
        exitCode = await ensureBackendRunning(
          npmCli,
          getActiveChild,
          setActiveChild,
          () => Boolean(receivedSignal),
          () => {
            backendStarted = true;
          },
        );
        if (exitCode !== 0 || receivedSignal) break;
      }
      exitCode = await runScript(
        npmCli,
        scriptName,
        getActiveChild,
        setActiveChild,
      );
      if (exitCode !== 0 || receivedSignal) break;
    }
  } finally {
    if (backendStarted) {
      console.log("Stopping the backend started by this test run.");
      const stopExitCode = await runScript(
        npmCli,
        "stop:backend",
        getActiveChild,
        setActiveChild,
      );
      if (stopExitCode !== 0) {
        console.error("Unable to stop the backend started by this test run.");
        if (exitCode === 0) exitCode = stopExitCode;
      }
    }
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
  }

  const elapsed = formatDuration(performance.now() - startedAt);
  const result = receivedSignal
    ? `signal ${receivedSignal}`
    : `exit code ${exitCode}`;
  console.log(
    `[${timestamp()}] Full test suite finished with ${result} after ${elapsed}.`,
  );
  process.exitCode = receivedSignal
    ? receivedSignal === "SIGINT"
      ? 130
      : 143
    : exitCode;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  await main();
}
