import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ESLint } from "eslint";
import { parse } from "yaml";
import browserConfig from "../playwright.config.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const sharedPackages = ["i18n", "styles", "ui"];

test("workspaces expose distinct lint, typecheck, and composed check scripts", () => {
  for (const directory of [
    "backend",
    "auth",
    "sanny",
    "documentation",
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const { scripts } = json(`${directory}/package.json`);
    assert.match(scripts.lint, /^eslint /, directory);
    assert.match(scripts.typecheck, /^tsc /, directory);
    assert.equal(scripts.check, "npm run lint && npm run typecheck", directory);
    assert.equal(scripts["type-check"], undefined, directory);
    assert.notEqual(scripts.test, "npm run lint", directory);
  }
  const { scripts } = json("package.json");
  for (const [suffix, workspace] of [
    ["backend", "backend"],
    ["auth", "auth"],
    ["sanny", "sanny"],
    ["docs", "documentation"],
  ]) {
    for (const operation of ["lint", "typecheck", "check"]) {
      assert.equal(
        scripts[`${operation}:${suffix}`],
        `npm run ${operation} -w ${workspace}`,
      );
    }
  }
});

test("shared packages export existing source and use the root compiler version", () => {
  const compiler = json("package.json").devDependencies.typescript;
  for (const name of sharedPackages) {
    const directory = `shared/packages/${name}`;
    const manifest = json(`${directory}/package.json`);
    const entry = manifest.exports["."];
    const source = typeof entry === "string" ? entry : entry.default;
    assert.match(source, /\.tsx?$/);
    assert.ok(existsSync(resolve(root, directory, source)));
    assert.equal(manifest.devDependencies.typescript, compiler);
    assert.ok(manifest.scripts.typecheck);
    assert.equal(manifest.scripts.build, undefined);
  }
});

test("workspace installs have one lockfile", () => {
  for (const directory of ["auth", "sanny", "documentation", "backend"]) {
    assert.equal(
      existsSync(resolve(root, directory, "package-lock.json")),
      false,
    );
    assert.ok(json("package-lock.json").packages[directory]);
  }
});

test("shared editor lint discovery uses the same policy as npm", async () => {
  for (const name of sharedPackages) {
    const directory = resolve(root, "shared/packages", name);
    const manifest = json(`shared/packages/${name}/package.json`);
    assert.equal(manifest.scripts.lint, "eslint .");
    const eslint = new ESLint({ cwd: directory });
    const config = await eslint.calculateConfigForFile(
      name === "ui" ? "src/index.ts" : "index.ts",
    );
    assert.ok(config.rules["@typescript-eslint/no-explicit-any"]);
    assert.equal(
      config.rules["react-refresh/only-export-components"],
      undefined,
    );
  }
});

test("default browser tests exclude live authentication and monitoring", () => {
  assert.equal(browserConfig.testDir, "./e2e/mock");
  for (const server of browserConfig.webServer) {
    assert.equal(server.reuseExistingServer, !process.env.CI);
  }
  assert.equal(browserConfig.forbidOnly, Boolean(process.env.CI));
});

test("production inherits common services without a local app build", () => {
  const development = parse(read("backend/docker/docker-compose.yml"));
  const production = parse(read("backend/docker/docker-compose.prod.yml"));
  assert.equal(development.services.app.build.context, "../..");
  assert.equal(
    development.services.app.build.dockerfile,
    "backend/docker/Dockerfile",
  );
  assert.equal(production.services.app.build, undefined);
  assert.match(production.services.app.image, /BACKEND_IMAGE_TAG/);
  assert.equal(
    production.services.app.environment.PROD_TRUST_PROXY,
    "172.28.0.2",
  );
  for (const [name, service] of Object.entries(production.services)) {
    if (name === "app") continue;
    assert.equal(service.extends.file, "docker-compose.yml");
    assert.ok(development.services[service.extends.service]);
  }
  assert.equal(development.services.promtail, undefined);
  assert.ok(development.services.alloy);
  assert.ok(development.volumes["alloy-data"] === null);
  assert.match(
    read("backend/monitoring/config.alloy"),
    /legacy_positions_file/,
  );
});

test("backend runtime loader is retained by production-only installs", () => {
  const manifest = json("backend/package.json");
  assert.ok(manifest.dependencies.tsx);
  assert.equal(manifest.devDependencies.tsx, undefined);
  assert.match(read("backend/docker/Dockerfile"), /npm ci --workspace=backend/);
  assert.doesNotMatch(read("backend/docker/Dockerfile"), /RUN npm install/);
});
