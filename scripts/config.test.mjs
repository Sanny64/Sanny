import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ESLint } from "eslint";
import { parse } from "yaml";
import ts from "typescript";
import browserConfig from "../playwright.config.ts";
import { resolveFrontendApiUrl } from "../vite.shared.ts";
import { createTestRules } from "../backend/monitoring/tests/run-integration.mjs";
import { FULL_GATE_SCRIPTS } from "./run-test-with-stopwatch.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const sharedPackages = ["i18n", "styles", "ui"];

test("frontend API configuration selects deployment inputs and validates origins", () => {
  const environment = {
    VITE_DEV_API_URL: "https://dev.example.test/",
    VITE_PROD_API_URL: "https://api.example.test",
  };
  for (const mode of ["development", "test"]) {
    assert.equal(
      resolveFrontendApiUrl(environment, mode, "build"),
      "https://dev.example.test",
    );
  }
  assert.equal(
    resolveFrontendApiUrl(environment, "production", "build"),
    "https://api.example.test",
  );
  assert.equal(
    resolveFrontendApiUrl(
      { ...environment, VITE_API_URL: "https://override.example.test" },
      "production",
      "build",
    ),
    "https://override.example.test",
  );
  assert.equal(
    resolveFrontendApiUrl(
      { VITE_API_URL: "http://localhost:8443" },
      "development",
      "serve",
    ),
    "http://localhost:8443",
  );
  for (const value of [
    undefined,
    "not-a-url",
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test/?key=value",
    "https://api.example.test/#fragment",
  ]) {
    assert.throws(() =>
      resolveFrontendApiUrl({ VITE_API_URL: value }, "production", "build"),
    );
  }
});

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

test("shared packages export existing source without redundant build steps", () => {
  for (const name of sharedPackages) {
    const directory = `shared/packages/${name}`;
    const manifest = json(`${directory}/package.json`);
    const entry = manifest.exports["."];
    const source = typeof entry === "string" ? entry : entry.default;
    assert.match(source, /\.tsx?$/);
    assert.ok(existsSync(resolve(root, directory, source)));
    assert.ok(manifest.scripts.typecheck);
    assert.equal(manifest.scripts.build, undefined);
  }
});

test("repository-wide development tools have one root owner", () => {
  const dependencies = json("package.json").devDependencies;
  const tools = [
    "typescript",
    "vite",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "yaml",
  ];
  for (const tool of tools) assert.ok(dependencies[tool], tool);
  for (const directory of [
    "backend",
    "auth",
    "sanny",
    "documentation",
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const manifest = json(`${directory}/package.json`);
    for (const tool of tools)
      assert.equal(
        manifest.devDependencies?.[tool],
        undefined,
        `${directory}: ${tool}`,
      );
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

test("deployments use authenticated FTPS and the canonical API build input", () => {
  for (const name of ["auth", "sanny", "docs", "to-test"]) {
    const path = `.github/workflows/deploy-${name}.yml`;
    const workflow = parse(read(path));
    const steps = Object.values(workflow.jobs).flatMap(
      (job) => job.steps ?? [],
    );
    const uploads = steps.filter((step) =>
      step.uses?.startsWith("SamKirkland/FTP-Deploy-Action@"),
    );
    assert.ok(uploads.length, path);
    for (const upload of uploads) {
      assert.equal(upload.with.protocol, "ftps", path);
      assert.equal(upload.with.security, "strict", path);
    }
    assert.doesNotMatch(read(path), /--insecure/, path);
    if (name === "docs") continue;
    const build = steps.find((step) => step.env?.VITE_API_URL);
    assert.ok(build, path);
    assert.equal(
      build.env.VITE_API_URL,
      name === "to-test"
        ? "${{ vars.VITE_DEV_API_URL }}"
        : "${{ vars.VITE_PROD_API_URL }}",
    );
  }
});

test("formatting uses the root EditorConfig and Prettier ignore file", () => {
  const { scripts } = json("package.json");
  assert.equal(scripts.format, "prettier . --write");
  assert.equal(scripts["format:check"], "prettier . --check");
  assert.match(read(".editorconfig"), /end_of_line = lf/);
  assert.ok(existsSync(resolve(root, ".prettierignore")));
});

test("every deployment waits for the common secret-free verification gate", () => {
  const verification = parse(read(".github/workflows/verify.yml"));
  assert.ok(Object.hasOwn(verification.on, "pull_request"));
  assert.ok(Object.hasOwn(verification.on, "workflow_call"));
  assert.equal(verification.permissions.contents, "read");
  assert.ok(
    verification.jobs.verify.steps.some(
      (step) => step.run === "npm run test:ci",
    ),
  );
  assert.doesNotMatch(read(".github/workflows/verify.yml"), /secrets\./);
  for (const name of ["auth", "sanny", "docs", "to-test", "backend"]) {
    const workflow = parse(read(`.github/workflows/deploy-${name}.yml`));
    assert.equal(workflow.jobs.verify.uses, "./.github/workflows/verify.yml");
    const build = Object.values(workflow.jobs).find((job) =>
      job.steps?.some((step) =>
        /npm (?:run build|ci)|docker\/build-push-action/.test(
          step.run ?? step.uses ?? "",
        ),
      ),
    );
    assert.equal(build.needs, "verify", name);
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, step.uses);
      }
    }
  }
});

test("TypeScript target is centralized across runtime workspaces", () => {
  assert.equal(json("tsconfig.base.json").compilerOptions.target, "ES2023");
  for (const path of [
    "tsconfig.frontend.base.json",
    "tsconfig.node.base.json",
    "backend/tsconfig.json",
  ]) {
    assert.equal(json(path).compilerOptions.target, undefined, path);
  }
});

test("compiler ownership separates browser sources from Node tooling", () => {
  const base = json("tsconfig.base.json").compilerOptions;
  assert.equal(base.module, undefined);
  assert.equal(base.moduleResolution, undefined);
  for (const app of ["auth", "sanny"]) {
    const config = json(`${app}/tsconfig.json`);
    assert.equal(config.extends, "../tsconfig.frontend.base.json");
    assert.deepEqual(config.include, ["src"]);
    assert.equal(config.references, undefined);
  }
  const path = resolve(root, "tsconfig.tooling.json");
  const config = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  assert.equal(
    parsed.options.moduleResolution,
    ts.ModuleResolutionKind.NodeNext,
  );
  for (const file of [
    "auth/vite.config.ts",
    "sanny/vite.config.ts",
    "shared/packages/ui/vitest.config.ts",
  ]) {
    assert.ok(
      parsed.fileNames.some((name) => resolve(name) === resolve(root, file)),
      file,
    );
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

test("ESLint keeps Node globals out of browser source", async () => {
  const eslint = new ESLint({ cwd: root });
  const browserConfig =
    await eslint.calculateConfigForFile("auth/src/main.tsx");
  const toolingConfig = await eslint.calculateConfigForFile(
    "playwright.config.ts",
  );

  assert.equal(browserConfig.languageOptions.globals.process, undefined);
  assert.ok(Object.hasOwn(toolingConfig.languageOptions.globals, "process"));
  const vitestConfig = await eslint.calculateConfigForFile(
    "shared/packages/ui/vitest.config.ts",
  );
  assert.equal(vitestConfig.languageOptions.globals.window, undefined);
  assert.equal(vitestConfig.rules["react-hooks/rules-of-hooks"], undefined);
  const backendConfig = await eslint.calculateConfigForFile(
    "backend/src/server.ts",
  );
  for (const config of [browserConfig, backendConfig]) {
    assert.equal(config.languageOptions.parserOptions.projectService, true);
    assert.equal(config.rules["@typescript-eslint/await-thenable"][0], 2);
    assert.equal(config.rules["@typescript-eslint/no-floating-promises"][0], 2);
  }
});

test("default browser tests exclude live authentication and monitoring", () => {
  assert.equal(browserConfig.testDir, "./e2e/mock");
  assert.equal(browserConfig.workers, 2);
  assert.equal(
    json("package.json").scripts["test:e2e:mocked"],
    "playwright test",
  );
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ["chromium", "firefox", "edge"],
  );
  for (const server of browserConfig.webServer) {
    assert.equal(server.reuseExistingServer, !process.env.CI);
  }
  assert.equal(browserConfig.forbidOnly, Boolean(process.env.CI));
});

test("aggregate scripts follow their underlying responsibilities", () => {
  for (const path of [
    "package.json",
    "backend/package.json",
    "auth/package.json",
    "sanny/package.json",
    "documentation/package.json",
    ...sharedPackages.map((name) => `shared/packages/${name}/package.json`),
  ]) {
    const { scripts } = json(path);
    const names = Object.keys(scripts);
    assert.ok(names.length > 0, path);
    assert.ok(["check", "test"].includes(names.at(-1)), path);
    if (scripts.check) {
      assert.ok(names.indexOf("check") > names.indexOf("lint"), path);
      assert.ok(names.indexOf("check") > names.indexOf("typecheck"), path);
      if (path !== "package.json") {
        assert.deepEqual(
          names.slice(names.indexOf("lint"), names.indexOf("check") + 1),
          ["lint", "typecheck", "check"],
          path,
        );
      }
    }
    if (scripts.test) {
      for (const name of names.filter((name) => name.startsWith("test:"))) {
        assert.ok(
          names.indexOf("test") > names.indexOf(name),
          `${path}: ${name}`,
        );
      }
    }
  }

  const rootScripts = json("package.json").scripts;
  const rootNames = Object.keys(rootScripts);
  const indexOf = (name) => rootNames.indexOf(name);
  for (const aggregate of ["lint", "typecheck", "check"]) {
    const scoped = rootNames.filter((name) => name.startsWith(`${aggregate}:`));
    for (const name of scoped) {
      assert.ok(indexOf(aggregate) > indexOf(name), `${aggregate}: ${name}`);
    }
    assert.deepEqual(
      rootNames.slice(indexOf(aggregate) - scoped.length, indexOf(aggregate)),
      scoped,
      aggregate,
    );
  }
  const assertImmediatelyAfter = (aggregate, children) => {
    const aggregateIndex = indexOf(aggregate);
    assert.deepEqual(
      rootNames.slice(aggregateIndex - children.length, aggregateIndex),
      children,
      aggregate,
    );
  };
  assertImmediatelyAfter("test:e2e", [
    "test:e2e:429-spike",
    "test:e2e:mocked",
    "test:e2e:real",
  ]);
  assertImmediatelyAfter("test:frontend:accessibility", [
    "test:frontend:accessibility:auth",
    "test:frontend:accessibility:sanny",
    "test:frontend:accessibility:shared",
  ]);
  assert.equal(
    indexOf("test:frontend"),
    indexOf("test:frontend:accessibility") + 1,
  );
  assert.equal(indexOf("test:ci"), indexOf("test") - 1);
});

test("the full gate runs each suite once and covers all major browsers", () => {
  const { scripts } = json("package.json");
  const backendScripts = json("backend/package.json").scripts;
  assert.match(scripts["test:ci"], /npm run check(?: &&|$)/);
  assert.match(scripts["test:ci"], /npm run build -w auth -w sanny/);
  assert.match(scripts["test:ci"], /npm run test:components/);
  assert.match(scripts["test:ci"], /npm run test:e2e:mocked/);
  assert.match(scripts["test:ci"], /npm run build:docs$/);
  assert.doesNotMatch(scripts["test:ci"], /npm run build:docs-de/);
  assert.doesNotMatch(
    scripts["test:ci"],
    /npm run test:frontend(?: &&|$)|test:integration(?: &&|$)/,
  );
  assert.equal(scripts.test, "node scripts/run-test-with-stopwatch.mjs");
  assert.deepEqual(FULL_GATE_SCRIPTS, ["test:ci", "test:e2e:real"]);
  assert.equal(scripts["test:backend:redis"], undefined);
  assert.equal(
    backendScripts.test,
    "npm run test:unit && npm run test:integration:monitoring && npm run test:integration:redis",
  );
  assert.equal(
    [...scripts["test:ci"].matchAll(/npm run test:backend(?:\s|$)/g)].length,
    1,
  );
  assert.doesNotMatch(scripts.test, /test:integration:redis/);
  assert.doesNotMatch(
    read("backend/docker/run-redis-tests.mjs"),
    /--env-file.*\.env/,
  );
  assert.doesNotMatch(
    read("backend/docker/docker-compose.redis-test.yml"),
    /extends:|env_file:/,
  );
  assert.match(
    read("backend/docker/docker-compose.redis-test.yml"),
    /internal:\s*true/,
  );
  assert.doesNotMatch(
    read("backend/docker/docker-compose.redis-test.yml"),
    /ports:/,
  );
  assert.match(
    read("backend/docker/docker-compose.redis-test.yml"),
    /sanny-redis-test-only/,
  );
  assert.equal(
    scripts["test:e2e:real"],
    "playwright test --config=playwright.real.config.ts --headed",
  );
  assert.equal(scripts["test:e2e:mocked"], "playwright test");
  assert.equal(scripts["test:gate"], undefined);
  for (const scriptName of [
    "test:e2e:real:chromium",
    "test:e2e:real:firefox",
    "test:e2e:real:edge",
    "test:e2e:mocked:chromium",
    "test:e2e:mocked:firefox",
    "test:e2e:mocked:edge",
    "test:e2e:accessibility:auth",
    "test:e2e:accessibility:sanny",
    "test:e2e:accessibility:shared",
  ]) {
    assert.equal(scripts[scriptName], undefined, scriptName);
  }
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ["chromium", "firefox", "edge"],
  );
  for (const app of ["auth", "sanny"]) {
    assert.doesNotMatch(
      json(`${app}/package.json`).scripts.build,
      /typecheck|lint/,
    );
    assert.match(
      scripts[`build:${app}`],
      new RegExp(`npm run build -w ${app}`),
    );
  }
});

test("root script composition does not reference missing aliases", () => {
  const { scripts } = json("package.json");
  for (const [name, script] of Object.entries(scripts)) {
    for (const command of script.split("&&")) {
      const match = command.trim().match(/^npm run ([\w:-]+)(.*)$/);
      if (
        !match ||
        /(?:^|\s)(?:-w|--workspace|--workspaces)(?:\s|=|$)/.test(match[2])
      )
        continue;
      assert.ok(scripts[match[1]], `${name} references missing ${match[1]}`);
    }
  }
});

test("production inherits common services without a local backend build", () => {
  const development = parse(read("backend/docker/docker-compose.yml"));
  const production = parse(read("backend/docker/docker-compose.prod.yml"));
  assert.equal(development.services["sanny64-backend"].build.context, "../..");
  assert.equal(
    development.services["sanny64-backend"].build.dockerfile,
    "backend/docker/Dockerfile",
  );
  assert.equal(production.services["sanny64-backend"].build, undefined);
  assert.match(
    production.services["sanny64-backend"].image,
    /^sanny64\/backend:/,
  );
  assert.match(
    production.services["sanny64-backend"].image,
    /BACKEND_IMAGE_TAG/,
  );
  assert.equal(
    production.services["sanny64-backend"].environment.PROD_TRUST_PROXY,
    "172.28.0.2",
  );
  for (const [name, service] of Object.entries(production.services)) {
    if (name === "sanny64-backend") continue;
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

test("monitoring test rules preserve production queries and thresholds", () => {
  const documents = [
    "429-spikes",
    "auth-abuse",
    "callback-flood",
    "backend-operational",
  ].map((name) => parse(read(`backend/monitoring/alerting/rules/${name}.yml`)));
  const original = structuredClone(documents);
  const generated = createTestRules(documents);
  assert.deepEqual(documents, original);
  assert.equal(generated.groups.length, 3);
  for (const group of generated.groups) {
    assert.equal(group.interval, "10s");
    const production = documents
      .flatMap((document) => document.groups)
      .find((candidate) => candidate.name === group.name);
    assert.ok(production);
    for (const rule of group.rules) {
      const source = production.rules.find(
        (candidate) => candidate.uid === rule.uid,
      );
      assert.deepEqual(rule, { ...source, for: "0s" });
    }
  }
  const compose = parse(
    read("backend/docker/docker-compose.monitoring-test.yml"),
  );
  assert.ok(
    compose.services.grafana.volumes.some((volume) =>
      volume.includes("SANNY_MONITORING_TEST_RULES"),
    ),
  );
});
