import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import process from "node:process";

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

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Cannot locate the npm CLI; run this script through npm.");
  process.exitCode = 1;
} else {
  const startedAt = performance.now();
  console.log(`[${new Date().toISOString()}] Starting the full test suite.`);

  const child = spawn(process.execPath, [npmCli, "run", "test:gate"], {
    stdio: "inherit",
  });
  let receivedSignal;

  const forwardSignal = (signal) => {
    receivedSignal ??= signal;
    child.kill(signal);
  };

  process.on("SIGINT", forwardSignal);
  process.on("SIGTERM", forwardSignal);

  child.once("error", (error) => {
    console.error(`Unable to start the full test suite: ${error.message}`);
  });
  child.once("close", (code, signal) => {
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);

    const elapsed = formatDuration(performance.now() - startedAt);
    const result = code === null ? `signal ${signal}` : `exit code ${code}`;
    console.log(
      `[${new Date().toISOString()}] Full test suite finished with ${result} after ${elapsed}.`,
    );
    process.exitCode = receivedSignal
      ? receivedSignal === "SIGINT"
        ? 130
        : 143
      : (code ?? 1);
  });
}
