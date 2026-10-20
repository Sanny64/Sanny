import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { pid } from "node:process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generate } from "selfsigned";
import { removeStaleTestProjects } from "./stale-test-projects.mjs";

export async function createRedisTestCertificates() {
  const directory = await mkdtemp(join(tmpdir(), "sanny-redis-tls-"));
  try {
    const validity = {
      algorithm: "sha256",
      keySize: 2048,
      notBeforeDate: new Date(Date.now() - 60_000),
      notAfterDate: new Date(Date.now() + 86_400_000),
    };
    const authority = await generate(
      [{ name: "commonName", value: "Sanny isolated Redis test CA" }],
      {
        ...validity,
        extensions: [
          { name: "basicConstraints", cA: true, critical: true },
          {
            name: "keyUsage",
            keyCertSign: true,
            cRLSign: true,
            critical: true,
          },
        ],
      },
    );
    const server = await generate([{ name: "commonName", value: "redis" }], {
      ...validity,
      ca: { key: authority.private, cert: authority.cert },
    });
    await chmod(directory, 0o755);
    await Promise.all([
      writeFile(join(directory, "ca.crt"), authority.cert, { mode: 0o644 }),
      writeFile(join(directory, "redis.crt"), server.cert, { mode: 0o644 }),
      writeFile(join(directory, "redis.key"), server.private, { mode: 0o644 }),
    ]);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

const projectPrefix = "sanny-redis-tests-";
const composeArgs = (projectName) => [
  "compose",
  "--project-directory",
  "docker",
  "--project-name",
  projectName,
  "--file",
  "docker/docker-compose.test.redis.yml",
];
const downArgs = ["down", "--timeout", "0", "--volumes", "--remove-orphans"];

let activeComposeChild;
let receivedSignal;
let cleanupStarted = false;
let certificatesDirectory;

function runDocker(args, projectName = `${projectPrefix}${pid}`) {
  return new Promise((resolve) => {
    const command = `docker compose -p ${projectName} ${args.join(" ")}`;
    const startedAt = performance.now();
    const timestamp = () => new Date().toISOString();
    console.log(`[${timestamp()}] Starting ${command}`);
    const child = spawn("docker", [...composeArgs(projectName), ...args], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      stdio: ["inherit", "pipe", "pipe"],
      env: {
        ...process.env,
        SANNY_REDIS_TEST_CERTS: certificatesDirectory.replaceAll("\\", "/"),
      },
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

async function main() {
  certificatesDirectory = await createRedisTestCertificates();
  await removeStaleTestProjects(projectPrefix, (projectName) =>
    runDocker(downArgs, projectName),
  );
  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  let testExitCode;
  let cleanupExitCode;
  try {
    testExitCode = await runDocker([
      "up",
      "--timeout",
      "0",
      "--build",
      "--abort-on-container-exit",
      "--exit-code-from",
      "sanny64-backend",
    ]);
  } finally {
    cleanupStarted = true;
    try {
      cleanupExitCode = await runDocker(downArgs);
    } finally {
      await rm(certificatesDirectory, { recursive: true, force: true });
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    }
  }
  process.exitCode = receivedSignal
    ? receivedSignal === "SIGINT"
      ? 130
      : 143
    : testExitCode || cleanupExitCode;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  await main();
}
