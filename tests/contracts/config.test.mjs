import assert from "node:assert/strict";
import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as prettier from "prettier";
import { ESLint } from "eslint";
import { parse } from "yaml";
import ts from "typescript";
import browserConfig from "../e2e/playwright.config.ts";
import docsBrowserConfig from "../e2e/playwright.docs.config.ts";
import rootBrowserConfig from "../../playwright.config.ts";
import { resolveFrontendApiUrl } from "../../tooling/config/vite.shared.ts";
import { createTestRules } from "../../backend/monitoring/tests/run-integration.mjs";
import { FULL_GATE_SCRIPTS } from "../../scripts/run-test-with-stopwatch.mjs";
import { createRedisTestCertificates } from "../../backend/docker/run-redis-tests.mjs";
import { readFile, rm } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import { assertRuntime } from "../../scripts/check-runtime.mjs";
import { deploymentTargets } from "../../scripts/deployment-targets.mjs";
import { recordDocumentationTranslationReview } from "../../scripts/record-doc-translation-review.mjs";
import { warnDocumentationLineCounts } from "../../scripts/warn-docs-translation.mjs";
import {
  visualDependencyImage,
  visualWorkspaceFiles,
} from "../../scripts/run-linux-visual-tests.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const sharedPackages = ["i18n", "styles", "ui"];

test("the backend application has no misleading package entrypoint", () => {
  assert.equal(json("backend/package.json").main, undefined);
});

test("English and German documentation contain the same pages", () => {
  const listPages = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.isDirectory()) {
          return listPages(resolve(directory, entry.name)).map(
            (page) => `${entry.name}/${page}`,
          );
        }
        return entry.isFile() && /\.mdx?$/.test(entry.name) ? [entry.name] : [];
      })
      .sort();
  const english = listPages(resolve(root, "documentation/docs"));
  const german = listPages(
    resolve(
      root,
      "documentation/i18n/de/docusaurus-plugin-content-docs/current",
    ),
  );

  assert.deepEqual(
    german,
    english,
    "German docs must contain the same Markdown and MDX pages as English docs",
  );

  const missingReferences = english.flatMap((page) => {
    const englishContent = read(`documentation/docs/${page}`).replace(
      /^[ \t]*```[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm,
      "",
    );
    const germanContent = read(
      `documentation/i18n/de/docusaurus-plugin-content-docs/current/${page}`,
    );
    const germanCodeBlocks = [
      ...germanContent.matchAll(
        /^[ \t]*```[^\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm,
      ),
    ].map((match) => match[1]);
    const germanInlineReferences = [
      ...germanContent
        .replace(/^[ \t]*```[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm, "")
        .matchAll(/`([^`\n]+)`/g),
    ].map((match) => match[1]);
    const germanCode = [...germanCodeBlocks, ...germanInlineReferences]
      .join(" ")
      .replace(/\s+/g, " ");

    return [...englishContent.matchAll(/`([^`\n]+)`/g)]
      .map((match) => match[1])
      .filter((reference) => !reference.startsWith("http"))
      .filter((reference) => {
        const identifier = reference.includes("=")
          ? reference.slice(0, reference.indexOf("="))
          : reference;
        return !germanCode.includes(identifier.replace(/\s+/g, " "));
      })
      .map((reference) => `${page}: ${reference}`);
  });

  assert.deepEqual(
    missingReferences,
    [],
    "German docs must retain inline technical references from English docs",
  );

  const reviewedSources = json("documentation/translation-source-hashes.json");
  assert.deepEqual(
    Object.keys(reviewedSources).sort(),
    english,
    "Every German page must record the English source revision it was reviewed against",
  );
  const staleTranslations = english.filter((page) => {
    const digest = createHash("sha256")
      .update(read(`documentation/docs/${page}`))
      .digest("hex");
    return reviewedSources[page] !== digest;
  });
  assert.deepEqual(
    staleTranslations,
    [],
    "Review the German page and update its source hash after changing English content",
  );
});

test("documentation translation line counts and file sizes emit only non-blocking warnings", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "docs-translation-lines-"));
  const english = resolve(fixture, "documentation/docs");
  const german = resolve(
    fixture,
    "documentation/i18n/de/docusaurus-plugin-content-docs/current",
  );
  try {
    for (const directory of [english, german]) {
      mkdirSync(resolve(directory, "nested"), { recursive: true });
      writeFileSync(resolve(directory, "empty.md"), "");
      writeFileSync(resolve(directory, "ignored.json"), "{}");
    }
    writeFileSync(resolve(english, "equal.md"), "one\ntwo\n");
    writeFileSync(resolve(german, "equal.md"), "eins\r\nzwei");
    writeFileSync(
      resolve(english, "nested/changed.mdx"),
      "a\nb\n" + "c".repeat(98),
    );
    writeFileSync(resolve(german, "nested/changed.mdx"), "a");
    writeFileSync(resolve(english, "nested/larger.mdx"), "a");
    writeFileSync(
      resolve(german, "nested/larger.mdx"),
      "a\nb\n" + "c".repeat(98),
    );
    for (const [page, content] of [
      ["at-byte-limit.md", "a\nb\n" + "c".repeat(97)],
      ["at-line-limit.md", "a\n" + "b".repeat(101)],
      ["bytes-only.md", "a".repeat(102)],
      ["lines-only.md", "a\nb\nc"],
    ]) {
      writeFileSync(resolve(english, page), "a");
      writeFileSync(resolve(german, page), content);
    }
    writeFileSync(resolve(english, "unicode.md"), "a\n");
    writeFileSync(resolve(german, "unicode.md"), "\u00e4\n");
    writeFileSync(resolve(english, "missing.md"), "not translated\n");
    const warnings = [];
    warnDocumentationLineCounts(fixture, (warning) => warnings.push(warning));
    assert.deepEqual(warnings.sort(), [
      "::warning title=Translation drift::at-byte-limit.md: +100 bytes, +2 lines (DE - EN)",
      "::warning title=Translation drift::at-line-limit.md: +102 bytes, +1 lines (DE - EN)",
      "::warning title=Translation drift::lines-only.md: +4 bytes, +2 lines (DE - EN)",
      "::warning title=Translation drift::nested/changed.mdx: -101 bytes, -2 lines (DE - EN)",
      "::warning title=Translation drift::nested/larger.mdx: +101 bytes, +2 lines (DE - EN)",
    ]);
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { warnDocumentationLineCounts } from ${JSON.stringify(new URL("../../scripts/warn-docs-translation.mjs", import.meta.url).href)}; warnDocumentationLineCounts(${JSON.stringify(fixture)});`,
      ],
      { encoding: "utf8", cwd: fixture },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /nested\/changed\.mdx: -101 bytes, -2 lines/);
    assert.match(result.stderr, /nested\/larger\.mdx: \+101 bytes, \+2 lines/);
    writeFileSync(resolve(german, "equal.md"), "one\ntwo\n");
    writeFileSync(
      resolve(german, "nested/changed.mdx"),
      "a\nb\n" + "c".repeat(98),
    );
    writeFileSync(resolve(german, "nested/larger.mdx"), "a");
    writeFileSync(resolve(german, "unicode.md"), "a\n");
    writeFileSync(resolve(german, "at-byte-limit.md"), "a");
    writeFileSync(resolve(german, "at-line-limit.md"), "a");
    writeFileSync(resolve(german, "lines-only.md"), "a");
    const matchingWarnings = [];
    warnDocumentationLineCounts(fixture, (warning) =>
      matchingWarnings.push(warning),
    );
    assert.deepEqual(matchingWarnings, [
      "No drift between locales has been recognized.",
    ]);

    const workflow = parse(read(".github/workflows/verify.yml"));
    const step = workflow.jobs.verify.steps.find(
      (entry) => entry.run === "node scripts/warn-docs-translation.mjs",
    );
    assert.equal(step?.["continue-on-error"], true);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("translation review records only a paired page source hash", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "docs-translation-review-"));
  const english = resolve(fixture, "documentation/docs/guide.mdx");
  const german = resolve(
    fixture,
    "documentation/i18n/de/docusaurus-plugin-content-docs/current/guide.mdx",
  );
  const manifest = resolve(
    fixture,
    "documentation/translation-source-hashes.json",
  );
  try {
    mkdirSync(resolve(english, ".."), { recursive: true });
    mkdirSync(resolve(german, ".."), { recursive: true });
    writeFileSync(english, "## English source\n");
    writeFileSync(german, "## Deutscher Text\n");
    writeFileSync(manifest, "{}\n");

    const digest = recordDocumentationTranslationReview(fixture, "guide.mdx");
    assert.equal(
      JSON.parse(readFileSync(manifest, "utf8"))["guide.mdx"],
      digest,
    );
    assert.equal(
      digest,
      createHash("sha256").update("## English source\n").digest("hex"),
    );
    assert.equal(readFileSync(german, "utf8"), "## Deutscher Text\n");
    assert.throws(
      () => recordDocumentationTranslationReview(fixture, "../outside.mdx"),
      /inside documentation\/docs/,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("release planning preserves branch and target boundaries", () => {
  assert.equal(
    deploymentTargets(["backend/src/server.ts"], "main").backend,
    true,
  );
  assert.equal(
    deploymentTargets(["backend/src/server.ts"], "main").auth,
    false,
  );
  assert.equal(deploymentTargets(["auth/src/App.tsx"], "main").auth, true);
  assert.equal(deploymentTargets(["auth/src/App.tsx"], "main").backend, false);
  for (const path of [
    "shared/types/frontend-env.d.ts",
    ".nvmrc",
    "tests/contracts/config.test.mjs",
    "tests/e2e/playwright.config.ts",
    "tooling/config/tsconfig.base.json",
    "tsconfig.json",
  ]) {
    const targets = deploymentTargets([path], "main");
    for (const name of ["auth", "sanny", "docs", "backend"])
      assert.equal(targets[name], true);
  }
  assert.equal(deploymentTargets([], "test").testing, true);
  assert.equal(deploymentTargets([], "test", true, true).deployBackend, false);
  assert.equal(deploymentTargets([], "dev", true, true).backend, false);
  assert.equal(deploymentTargets([], "main", false, true).deployBackend, false);
  assert.equal(deploymentTargets([], "main", true, true).deployBackend, true);
});

test("Linux visual workspaces exclude environment files and local assets", () => {
  assert.deepEqual(
    visualWorkspaceFiles([
      "package.json",
      "auth/src/App.tsx",
      "shared/types/frontend-env.d.ts",
      "backend/.env",
      "auth/.env.local",
      ".secret/key",
      "backend/redis/certs/ca.crt",
      "node_modules/vite/index.js",
      "sanny/dist/index.html",
      "documentation/build/index.html",
    ]),
    ["package.json", "auth/src/App.tsx", "shared/types/frontend-env.d.ts"],
  );
  assert.match(
    read("scripts/run-linux-visual-tests.mjs"),
    /lock\.packages\["node_modules\/@playwright\/test"\]/,
  );
});

test("Linux visual dependency images invalidate for every build input", () => {
  const inputs = [
    ["package.json", '{"packageManager":"npm@11.6.3"}'],
    ["package-lock.json", '{"lockfileVersion":3}'],
    ["auth/package.json", '{"name":"auth"}'],
    ["scripts/Dockerfile.visual", "FROM playwright"],
  ];
  const image = visualDependencyImage(inputs);
  assert.match(image, /^sanny64-visual-deps:[a-f0-9]{64}$/);
  assert.equal(image, visualDependencyImage([...inputs].reverse()));
  for (const [index] of inputs.entries()) {
    const changed = inputs.map(([path, content], position) => [
      path,
      position === index ? `${content}\n` : content,
    ]);
    assert.notEqual(image, visualDependencyImage(changed));
  }
  assert.notEqual(image, visualDependencyImage(inputs.slice(1)));
  assert.notEqual(
    image,
    visualDependencyImage([...inputs, ["sanny/package.json", "{}"]]),
  );
});

test("visual suites have Linux counterparts for Windows baselines", () => {
  for (const suite of ["auth-accessibility", "sanny-accessibility"]) {
    const directory = resolve(
      root,
      `tests/e2e/mock/${suite}.spec.ts-snapshots`,
    );
    const files = readdirSync(directory);
    const windows = files.filter((name) => name.endsWith("-win32.png"));
    assert.ok(windows.length > 0);
    for (const name of windows) {
      assert.ok(
        files.includes(name.replace(/-win32\.png$/, "-linux.png")),
        name,
      );
    }
  }
});

test("runtime enforcement rejects unsupported Node and npm versions", () => {
  const npmVersion = json("package.json").packageManager.slice(4);
  assert.doesNotThrow(() => assertRuntime(read(".nvmrc").trim(), npmVersion));
  assert.throws(() => assertRuntime("26.9.0", npmVersion), /Node.js 24/);
  assert.throws(() => assertRuntime("24.22.0", "11.0.0"), /Use npm/);
  assert.equal(
    json("package.json").scripts.preinstall,
    "node scripts/check-runtime.mjs",
  );
});

test("Redis test TLS is generated independently of local certificates", async () => {
  const directory = await createRedisTestCertificates();
  try {
    const authority = new X509Certificate(
      await readFile(resolve(directory, "ca.crt")),
    );
    const certificate = new X509Certificate(
      await readFile(resolve(directory, "redis.crt")),
    );
    assert.equal(authority.ca, true);
    assert.ok(certificate.verify(authority.publicKey));
    assert.equal(certificate.checkHost("redis"), "redis");
    assert.equal(certificate.checkHost("production.example.test"), undefined);
    assert.ok(Date.parse(certificate.validTo) - Date.now() < 86_400_000);
    const compose = read("backend/docker/docker-compose.test.redis.yml");
    assert.doesNotMatch(compose, /\.\.\/redis\/certs/);
    assert.match(compose, /SANNY_REDIS_TEST_CERTS/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
    assert.equal(manifest.scripts["build:frontend"], undefined);
    assert.equal(manifest.main, undefined);
    assert.equal(manifest.types, undefined);
  }
});

test("frontend environment declarations reject unknown keys", () => {
  const path = resolve(root, "auth/tsconfig.json");
  const { config } = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    resolve(root, "auth"),
  );
  const filePath = resolve(root, "auth/src/config-contract-probe.ts");
  const options = { ...parsed.options, incremental: false };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, createNew) =>
    resolve(name) === filePath
      ? ts.createSourceFile(
          name,
          "export const valid = import.meta.env.VITE_API_URL; export const invalid = import.meta.env.VITE_APPI_URL;",
          languageVersion,
          true,
        )
      : getSourceFile(name, languageVersion, onError, createNew);
  const program = ts.createProgram(
    [...parsed.fileNames, filePath],
    options,
    host,
  );
  const diagnostics = program.getSemanticDiagnostics(
    program.getSourceFile(filePath),
  );
  assert.equal(diagnostics.length, 1);
  assert.match(
    ts.flattenDiagnosticMessageText(diagnostics[0].messageText, " "),
    /VITE_APPI_URL/,
  );
});

test("Auth0 scripts have narrow runtime lint scopes", async () => {
  assert.match(json("backend/package.json").scripts.lint, /\bauth0\b/);
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintText(
    "function login(email, password, callback) { callback(new ValidationError(configuration.message)); }",
    { filePath: "backend/auth0/database-action/login.js" },
  );
  assert.equal(results[0].errorCount, 0);
  const browser = await eslint.calculateConfigForFile("auth/src/main.tsx");
  assert.equal(browser.languageOptions.globals.configuration, undefined);
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

test("Auth0 scripts use the experimental ternary layout only", async () => {
  const auth0Path = resolve(root, "backend/auth0/example.js");
  const otherPath = resolve(root, "backend/src/example.js");
  const auth0Options = await prettier.resolveConfig(auth0Path);
  const otherOptions = await prettier.resolveConfig(otherPath);
  const formatted = await prettier.format(
    "const result = condition ? firstChoice : secondChoice;\n",
    { ...auth0Options, filepath: auth0Path, printWidth: 25 },
  );

  assert.match(formatted, /condition \?\n/);
  assert.equal(otherOptions?.experimentalTernaries, undefined);
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
  const release = parse(read(".github/workflows/release.yml"));
  assert.equal(release.jobs.verify.uses, "./.github/workflows/verify.yml");
  assert.equal(
    Object.values(release.jobs).filter(
      (job) => job.uses === "./.github/workflows/verify.yml",
    ).length,
    1,
  );
  for (const name of ["auth", "sanny", "docs", "to-test", "backend"]) {
    const workflow = parse(read(`.github/workflows/deploy-${name}.yml`));
    assert.deepEqual(Object.keys(workflow.on), ["workflow_call"]);
    assert.equal(workflow.jobs.verify, undefined);
    const caller = Object.values(release.jobs).find(
      (job) => job.uses === `./.github/workflows/deploy-${name}.yml`,
    );
    assert.deepEqual(caller.needs, ["plan", "verify"], name);
    assert.notEqual(caller.secrets, "inherit");
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, step.uses);
      }
    }
  }
  for (const workflow of [release, verification]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
      }
    }
  }
});

test("TypeScript target is centralized across runtime workspaces", () => {
  assert.equal(
    json("tooling/config/tsconfig.base.json").compilerOptions.target,
    "ES2023",
  );
  for (const path of [
    "tooling/config/tsconfig.frontend.base.json",
    "tooling/config/tsconfig.node.base.json",
    "backend/tsconfig.json",
  ]) {
    assert.equal(json(path).compilerOptions.target, undefined, path);
  }
});

test("compiler ownership separates browser sources from Node tooling", () => {
  const base = json("tooling/config/tsconfig.base.json").compilerOptions;
  assert.equal(base.module, undefined);
  assert.equal(base.moduleResolution, undefined);
  for (const app of ["auth", "sanny"]) {
    const config = json(`${app}/tsconfig.json`);
    assert.equal(
      config.extends,
      "../tooling/config/tsconfig.frontend.base.json",
    );
    assert.deepEqual(config.include, ["src"]);
    assert.equal(config.references, undefined);
  }
  const path = resolve(root, "tsconfig.json");
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
  assert.equal(rootBrowserConfig, browserConfig);
  assert.equal(resolve(browserConfig.testDir), resolve(root, "tests/e2e/mock"));
  assert.equal(browserConfig.workers, 2);
  assert.equal(
    json("package.json").scripts["test:e2e:mocked"],
    "playwright test",
  );
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ["chromium", "firefox", "webkit", "edge"],
  );
  for (const server of browserConfig.webServer) {
    assert.equal(server.reuseExistingServer, !process.env.CI);
    assert.equal(resolve(server.cwd), resolve(root));
  }
  assert.equal(browserConfig.forbidOnly, Boolean(process.env.CI));
});

test("live authentication uses one API origin for the app and backend checks", () => {
  const liveConfig = read("tests/e2e/playwright.real.config.ts");
  const liveTest = read("tests/e2e/real/login-logout.spec.ts");
  const apiOrigin =
    /SANNY_E2E_API_URL\s*\?\?\s*(?:process\.)?env\.VITE_API_URL\s*\?\?\s*["']https:\/\/localhost:8443["']/;

  assert.match(liveConfig, apiOrigin);
  assert.match(liveTest, apiOrigin);
  assert.match(liveConfig, /reuseExistingServer:\s*false/);
  assert.match(liveConfig, /sanny -- --host 127\.0\.0\.1 --port 5178/);
  assert.doesNotMatch(liveConfig, /auth -- --host/);
  assert.match(liveTest, /127\.0\.0\.1:5178/);
  assert.match(liveTest, /SANNY_E2E_TRUSTED_ORIGIN/);
});

test("docs browser tests use a dedicated mobile Chromium server", () => {
  assert.equal(
    resolve(docsBrowserConfig.testDir),
    resolve(root, "tests/e2e/docs"),
  );
  assert.deepEqual(
    docsBrowserConfig.projects.map((project) => project.name),
    ["chromium-mobile"],
  );
  assert.deepEqual(docsBrowserConfig.projects[0].use.viewport, {
    width: 390,
    height: 844,
  });
  assert.equal(docsBrowserConfig.projects[0].use.isMobile, true);
  assert.equal(docsBrowserConfig.projects[0].use.hasTouch, true);
  assert.equal(docsBrowserConfig.webServer.length, 1);
  assert.match(docsBrowserConfig.webServer[0].command, /documentation/);
  assert.equal(
    json("package.json").scripts["test:e2e:docs"],
    "playwright test --config=tests/e2e/playwright.docs.config.ts",
  );
});

test("tooling relocation removes obsolete paths and preserves Docker configuration", () => {
  for (const path of [
    "vite.shared.ts",
    "tsconfig.base.json",
    "tsconfig.frontend.base.json",
    "tsconfig.node.base.json",
    "shared/frontend-env.d.ts",
    "scripts/config.test.mjs",
    "playwright.real.config.ts",
    "playwright.monitoring.config.ts",
    "e2e",
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, path);
  }
  assert.match(
    read("backend/docker/Dockerfile"),
    /COPY tooling\/config\/tsconfig\.base\.json/,
  );
  assert.match(
    read("backend/docker/Dockerfile"),
    /\/app\/tooling\/config\/tsconfig\.base\.json/,
  );
  assert.match(read("eslint.config.js"), /tooling\/config\/eslint\.shared\.js/);
});

test("mocked browser and visual commands cover accessibility checks", () => {
  const { scripts } = json("package.json");
  assert.equal(scripts["test:e2e:mocked"], "playwright test");
  for (const file of [
    "auth-accessibility.spec.ts",
    "sanny-accessibility.spec.ts",
    "accessibility.spec.ts",
  ]) {
    assert.ok(existsSync(resolve(root, "tests/e2e/mock", file)), file);
  }
  assert.equal(
    scripts["test:visual:linux"],
    "node scripts/run-linux-visual-tests.mjs",
  );
  const visualRunner = read("scripts/run-linux-visual-tests.mjs");
  assert.match(visualRunner, /auth-accessibility\.spec\.ts/);
  assert.match(visualRunner, /sanny-accessibility\.spec\.ts/);
  assert.match(visualRunner, /--project chromium --grep 'visual baseline'/);
  const webkit = browserConfig.projects.find(
    (project) => project.name === "webkit",
  );
  assert.ok(webkit.testMatch.includes("**/*accessibility.spec.ts"));
});

test("the full gate runs each suite once and covers all major browsers", () => {
  const { scripts } = json("package.json");
  const backendScripts = json("backend/package.json").scripts;
  assert.match(scripts["test:ci"], /npm run check(?: &&|$)/);
  assert.match(scripts["test:ci"], /npm run build:frontend/);
  assert.doesNotMatch(
    scripts["test:ci"],
    /npm run build:backend|npm run build(?:\s|&&)/,
  );
  assert.equal(
    scripts.build,
    "npm run build:backend && npm run build:frontend",
  );
  assert.match(
    scripts["build:frontend"],
    /npm run build:auth && npm run build:docs && npm run build:sanny/,
  );
  assert.equal(
    scripts["build:docs:en"],
    "npm run build -w documentation -- --locale en",
  );
  assert.equal(
    scripts["build:docs:de"],
    "npm run build -w documentation -- --locale de",
  );
  assert.equal(scripts["build:docs"], "npm run build -w documentation");
  assert.equal(scripts["build:docs:all"], undefined);
  assert.match(scripts["test:ci"], /npm run test:components/);
  assert.match(scripts["test:ci"], /npm run test:e2e:mocked/);
  assert.match(
    scripts["test:ci"],
    /npm run test:e2e:mocked && npm run test:e2e:docs/,
  );
  assert.match(scripts["test:ci"], /npm run test:visual:linux/);
  assert.doesNotMatch(
    scripts["test:ci"],
    /npm run test:frontend(?: &&|$)|test:integration(?: &&|$)/,
  );
  assert.equal(scripts.test, "node scripts/run-test-with-stopwatch.mjs");
  assert.deepEqual(FULL_GATE_SCRIPTS, [
    "test:ci",
    "test:e2e:real",
    "test:e2e:429-spike",
  ]);
  assert.equal(scripts["test:backend:redis"], undefined);
  assert.equal(
    backendScripts.test,
    "npm run test:unit && npm run test:integration:monitoring && npm run test:integration:redis && npm run test:integration:discord",
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
    read("backend/docker/docker-compose.test.redis.yml"),
    /extends:|env_file:/,
  );
  assert.match(
    read("backend/docker/docker-compose.test.redis.yml"),
    /internal:\s*true/,
  );
  assert.doesNotMatch(
    read("backend/docker/docker-compose.test.redis.yml"),
    /ports:/,
  );
  assert.match(
    read("backend/docker/docker-compose.test.redis.yml"),
    /sanny-redis-test-only/,
  );
  assert.match(read("backend/docker/run-redis-tests.mjs"), /"--build"/);
  assert.equal(
    parse(read("backend/docker/docker-compose.test.redis.yml")).services[
      "sanny64-backend"
    ].build.dockerfile,
    "backend/docker/Dockerfile",
  );
  assert.equal(
    scripts["test:e2e:real"],
    "playwright test --config=tests/e2e/playwright.real.config.ts --headed",
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
    ["chromium", "firefox", "webkit", "edge"],
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

test("production and test deployments build both documentation locales", () => {
  for (const workflowPath of [
    ".github/workflows/deploy-docs.yml",
    ".github/workflows/deploy-to-test.yml",
  ]) {
    const workflow = read(workflowPath);
    assert.match(workflow, /npm run build:docs(?:\r?\n|$)/);
    assert.doesNotMatch(workflow, /npm run build:docs:(?:en|de)/);
  }
  assert.equal(
    json("package.json").scripts["build:docs"],
    "npm run build -w documentation",
  );
  assert.match(
    read("documentation/docusaurus.config.ts"),
    /locales:\s*\["en", "de"\]/,
  );
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

test("backend names are explicit without coupling isolated test projects", () => {
  const development = parse(read("backend/docker/docker-compose.dev.yml"));
  const production = parse(read("backend/docker/docker-compose.prod.yml"));
  const local = development.services["sanny64-backend"];
  assert.equal(local.image, "sanny64-backend:latest");
  assert.equal(local.container_name, "sanny64-backend");
  assert.equal(local.pull_policy, "build");
  assert.equal(
    production.services["sanny64-backend"].container_name,
    "sanny64-backend",
  );
  for (const name of ["redis", "monitoring"]) {
    const isolated = parse(
      read(`backend/docker/docker-compose.test.${name}.yml`),
    );
    for (const service of Object.values(isolated.services)) {
      assert.equal(service.container_name, undefined);
      assert.notEqual(service.image, local.image);
    }
  }
});

test("Compose restart scripts distinguish full-stack and backend-only recreation", () => {
  const rootScripts = json("package.json").scripts;
  const backendScripts = json("backend/package.json").scripts;
  const composeCommand =
    "docker compose --project-directory docker --env-file .env -f docker/docker-compose.dev.yml";

  assert.equal(
    rootScripts["restart:stack"],
    "npm run restart:stack -w backend",
  );
  assert.equal(
    backendScripts["restart:stack"],
    `${composeCommand} up -d --build --force-recreate --remove-orphans`,
  );
  assert.equal(
    backendScripts.restart,
    `${composeCommand} up -d --build --force-recreate sanny64-backend`,
  );
});

test("production inherits common services without a local backend build", () => {
  const development = parse(read("backend/docker/docker-compose.dev.yml"));
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
    assert.equal(service.extends.file, "docker-compose.dev.yml");
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
    read("backend/docker/docker-compose.test.monitoring.yml"),
  );
  assert.ok(
    compose.services.grafana.volumes.some((volume) =>
      volume.includes("SANNY_MONITORING_TEST_RULES"),
    ),
  );
});
