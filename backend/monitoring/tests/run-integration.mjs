import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { pid } from "node:process";

const composeArgs = [
  "compose",
  "--project-name",
  `sanny-monitoring-tests-${pid}`,
  "--file",
  "docker/docker-compose.monitoring-test.yml",
];

let activeComposeChild;
let receivedSignal;
let cleanupStarted = false;

function runDocker(args) {
  return new Promise((resolve) => {
    const command = `docker compose ${args.join(" ")}`;
    const startedAt = performance.now();
    const timestamp = () => new Date().toISOString();
    console.log(`[${timestamp()}] Starting ${command}`);
    const child = spawn("docker", [...composeArgs, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
    });
    activeComposeChild = child;
    for (const [stream, output] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      createInterface({ input: stream, crlfDelay: Infinity }).on(
        "line",
        (line) => output.write(`[${timestamp()}] ${line}\n`),
      );
    }

    child.once("error", (error) => {
      console.error(
        `[${timestamp()}] Unable to run Docker Compose: ${error.message}`,
      );
    });
    child.once("close", (code, signal) => {
      if (activeComposeChild === child) activeComposeChild = undefined;
      const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(
        2,
      );
      const result = code === null ? `signal ${signal}` : `exit code ${code}`;
      console.log(
        `[${timestamp()}] Finished ${command} with ${result} after ${elapsedSeconds}s`,
      );
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

function handleSignal(signal) {
  receivedSignal ??= signal;
  if (!cleanupStarted) activeComposeChild?.kill(signal);
}

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

let testExitCode = 1;
let cleanupExitCode = 1;
try {
  testExitCode = await runDocker([
    "up",
    "--timeout",
    "0",
    "--build",
    "--abort-on-container-exit",
    "--exit-code-from",
    "monitoring-tests",
  ]);
} finally {
  cleanupStarted = true;
  cleanupExitCode = await runDocker([
    "down",
    "--timeout",
    "0",
    "--volumes",
    "--remove-orphans",
  ]);
  process.off("SIGINT", handleSignal);
  process.off("SIGTERM", handleSignal);
}

process.exitCode = receivedSignal
  ? receivedSignal === "SIGINT"
    ? 130
    : 143
  : testExitCode || cleanupExitCode;
