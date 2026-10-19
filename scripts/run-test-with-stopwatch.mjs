import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FULL_GATE_SCRIPTS = ["test:ci", "test:e2e:real"];

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
  const forwardSignal = (signal) => {
    receivedSignal ??= signal;
    activeChild?.kill(signal);
  };
  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  console.log(`[${timestamp()}] Starting the full test suite.`);
  let exitCode = 0;
  try {
    for (const scriptName of FULL_GATE_SCRIPTS) {
      exitCode = await runScript(
        npmCli,
        scriptName,
        () => activeChild,
        (child) => {
          activeChild = child;
        },
      );
      if (exitCode !== 0 || receivedSignal) break;
    }
  } finally {
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
