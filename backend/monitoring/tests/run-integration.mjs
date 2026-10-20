import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { performance } from "node:perf_hooks";
import { pid } from "node:process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse, stringify } from "yaml";
import { removeStaleTestProjects } from "../../docker/stale-test-projects.mjs";

export function createTestRules(documents) {
  const groups = structuredClone(
    documents.flatMap((document) => document.groups),
  );
  return {
    apiVersion: 1,
    groups: groups.flatMap((group) => {
      const rules = group.rules.filter((rule) =>
        rule.data.some((query) => query.datasourceUid === "loki"),
      );
      if (!rules.length) return [];
      return [
        {
          ...group,
          interval: "10s",
          rules: rules.map((rule) => ({ ...rule, for: "0s" })),
        },
      ];
    }),
  };
}

const projectPrefix = "sanny-monitoring-tests-";
const composeArgs = (projectName) => [
  "compose",
  "--project-name",
  projectName,
  "--file",
  "docker/docker-compose.test.monitoring.yml",
];
const downArgs = ["down", "--timeout", "0", "--volumes", "--remove-orphans"];

let activeComposeChild;
let receivedSignal;
let cleanupStarted = false;
let testRulesPath;

function runDocker(args, projectName = `${projectPrefix}${pid}`) {
  return new Promise((resolve) => {
    const command = `docker compose -p ${projectName} ${args.join(" ")}`;
    const startedAt = performance.now();
    const timestamp = () => new Date().toISOString();
    console.log(`[${timestamp()}] Starting ${command}`);
    const child = spawn("docker", [...composeArgs(projectName), ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, SANNY_MONITORING_TEST_RULES: testRulesPath },
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
  const directory = await mkdtemp(join(tmpdir(), "sanny-monitoring-rules-"));
  testRulesPath = join(directory, "rules.yml").replaceAll("\\", "/");
  try {
    const rulesDirectory = new URL("../alerting/rules/", import.meta.url);
    const files = (await readdir(rulesDirectory))
      .filter((name) => name.endsWith(".yml"))
      .sort();
    const documents = await Promise.all(
      files.map(async (name) =>
        parse(await readFile(new URL(name, rulesDirectory), "utf8")),
      ),
    );
    await writeFile(testRulesPath, stringify(createTestRules(documents)), {
      mode: 0o644,
    });
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
        "monitoring-tests",
      ]);
    } finally {
      cleanupStarted = true;
      cleanupExitCode = await runDocker(downArgs);
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    }
    process.exitCode = receivedSignal
      ? receivedSignal === "SIGINT"
        ? 130
        : 143
      : testExitCode || cleanupExitCode;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  await main();
}
