import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function deploymentTargets(
  paths,
  branch,
  manual = false,
  deployBackend = false,
) {
  const targets = {
    auth: false,
    sanny: false,
    docs: false,
    backend: false,
    testing: false,
    deployBackend: false,
  };
  if (branch === "test") return { ...targets, testing: true };
  if (branch !== "main") return targets;
  const common =
    manual ||
    paths.some(
      (path) =>
        /^(package(?:-lock)?\.json|tsconfig[^/]*\.json|eslint\.config\.js|vite\.shared\.ts|\.editorconfig|\.prettierignore|\.nvmrc)$/.test(
          path,
        ) ||
        /^(shared\/|tooling\/|scripts\/|tests\/|\.github\/workflows\/)/.test(
          path,
        ),
    );
  return {
    auth: common || paths.some((path) => path.startsWith("auth/")),
    sanny:
      common ||
      paths.some((path) => path.startsWith("sanny/") || path === "favicon.ico"),
    docs:
      common ||
      paths.some(
        (path) => path.startsWith("documentation/") || path === "favicon.ico",
      ),
    backend:
      common ||
      paths.some(
        (path) => path.startsWith("backend/") || path === ".dockerignore",
      ),
    testing: false,
    deployBackend: manual && deployBackend,
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  const before = process.env.RELEASE_BEFORE;
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const paths =
    !manual && /^[a-f0-9]{40}$/.test(before ?? "") && !/^0+$/.test(before)
      ? execFileSync("git", ["diff", "--name-only", "-z", before, "HEAD"], {
          encoding: "utf8",
        })
          .split("\0")
          .filter(Boolean)
      : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
          .split("\0")
          .filter(Boolean);
  const targets = deploymentTargets(
    paths,
    process.env.GITHUB_REF_NAME,
    manual,
    process.env.RELEASE_DEPLOY_BACKEND === "true",
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(targets)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
  );
}
