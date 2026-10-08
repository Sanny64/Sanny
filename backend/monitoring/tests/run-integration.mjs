import { spawn } from "node:child_process";
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
    const child = spawn("docker", [...composeArgs, ...args], {
      stdio: "inherit",
    });
    activeComposeChild = child;

    child.once("error", (error) => {
      console.error(`Unable to run Docker Compose: ${error.message}`);
      if (activeComposeChild === child) activeComposeChild = undefined;
      resolve(1);
    });
    child.once("exit", (code, signal) => {
      if (activeComposeChild === child) activeComposeChild = undefined;
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
    "--build",
    "--abort-on-container-exit",
    "--exit-code-from",
    "monitoring-tests",
  ]);
} finally {
  cleanupStarted = true;
  cleanupExitCode = await runDocker(["down", "--volumes", "--remove-orphans"]);
  process.off("SIGINT", handleSignal);
  process.off("SIGTERM", handleSignal);
}

process.exitCode = receivedSignal
  ? receivedSignal === "SIGINT"
    ? 130
    : 143
  : testExitCode || cleanupExitCode;
