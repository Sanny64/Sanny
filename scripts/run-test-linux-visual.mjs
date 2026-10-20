import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function visualWorkspaceFiles(paths) {
  return paths.filter(
    (path) =>
      !/(^|\/)(\.env(?:\.[^/]*)?|\.secret|\.agents|\.git|node_modules|dist|build|test-results|playwright-report|certs)(\/|$)/.test(
        path,
      ),
  );
}

export function visualDependencyImage(inputs) {
  const hash = createHash("sha256");
  for (const [path, content] of [...inputs].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update(JSON.stringify([path, content]));
  }
  return `sanny64-visual-deps:${hash.digest("hex")}`;
}

async function runDocker(args) {
  return new Promise((resolveCode, reject) => {
    const child = spawn("docker", args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveCode(exitCode ?? 1));
  });
}

async function main() {
  const update = process.argv.includes("--update");
  const directory = await mkdtemp(join(tmpdir(), "sanny-linux-visual-"));
  try {
    const files = visualWorkspaceFiles(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean),
    );
    for (const path of new Set(
      files.filter((path) => existsSync(resolve(root, path))),
    )) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await cp(resolve(root, path), target);
    }
    const lock = JSON.parse(
      await readFile(join(directory, "package-lock.json"), "utf8"),
    );
    const version = lock.packages["node_modules/@playwright/test"].version;
    if (!/^\d+\.\d+\.\d+$/.test(version))
      throw new Error("Invalid locked Playwright version");
    const dependencyPaths = files.filter(
      (path) =>
        /(^|\/)package\.json$/.test(path) || path === "package-lock.json",
    );
    const dockerfile = "scripts/Dockerfile.visual";
    const inputs = await Promise.all(
      [...new Set([...dependencyPaths, dockerfile])].map(async (path) => [
        path,
        await readFile(join(directory, path), "utf8"),
      ]),
    );
    const image = visualDependencyImage(inputs);
    let cached = false;
    try {
      execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
      cached = true;
    } catch {
      cached = false;
    }
    console.log(`[visual:linux] Dependency image ${cached ? "hit" : "miss"}`);
    if (!cached) {
      const context = await mkdtemp(join(tmpdir(), "sanny-visual-deps-"));
      try {
        for (const [path] of inputs) {
          const target = join(context, path);
          await mkdir(dirname(target), { recursive: true });
          await cp(join(directory, path), target);
        }
        const code = await runDocker([
          "build",
          "--build-arg",
          `PLAYWRIGHT_VERSION=${version}`,
          "--file",
          join(context, dockerfile),
          "--tag",
          image,
          context,
        ]);
        if (code !== 0) {
          process.exitCode = code;
          return;
        }
      } finally {
        await rm(context, { recursive: true, force: true });
      }
    }
    const command = [
      "cp -a /source/. /workspace/",
      "npm run check:runtime",
      `npx playwright test tests/e2e/mock/auth-accessibility.spec.ts tests/e2e/mock/sanny-accessibility.spec.ts --project chromium --grep 'visual baseline'${update ? " --update-snapshots" : ""}`,
      ...(update
        ? [
            "cp tests/e2e/mock/auth-accessibility.spec.ts-snapshots/*-linux.png /source/tests/e2e/mock/auth-accessibility.spec.ts-snapshots/",
            "cp tests/e2e/mock/sanny-accessibility.spec.ts-snapshots/*-linux.png /source/tests/e2e/mock/sanny-accessibility.spec.ts-snapshots/",
          ]
        : []),
    ].join(" && ");
    const code = await runDocker([
      "run",
      "--rm",
      "--ipc=host",
      "--mount",
      `type=bind,source=${directory},target=/source${update ? "" : ",readonly"}`,
      "--workdir",
      "/workspace",
      "--env",
      "VITE_API_URL=https://127.0.0.1:8443",
      "--env",
      "CI=true",
      image,
      "bash",
      "-lc",
      command,
    ]);
    if (code !== 0) {
      process.exitCode = code;
      return;
    }
    if (update) {
      for (const suite of ["auth-accessibility", "sanny-accessibility"]) {
        const relative = `tests/e2e/mock/${suite}.spec.ts-snapshots`;
        const snapshots = join(directory, relative);
        await mkdir(join(root, relative), { recursive: true });
        for (const name of await readdir(snapshots)) {
          if (name.endsWith("-linux.png"))
            await cp(join(snapshots, name), join(root, relative, name));
        }
      }
    }
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
