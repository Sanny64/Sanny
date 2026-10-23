import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { test } from 'node:test';
import * as prettier from 'prettier';
import { ESLint } from 'eslint';
import ts from 'typescript';
import authVitestConfig from '../../../../apps/frontend/auth/vitest.config.ts';
import frontendVitestConfig from '../../../../apps/frontend/vitest.config.ts';
import sannyVitestConfig from '../../../../apps/frontend/sanny/vitest.config.ts';
import uiVitestConfig from '../../../packages/ui/vitest.config.ts';
import { resolveFrontendApiUrl } from '../../../../apps/frontend/vite.config.ts';
import { assertRuntime } from '../../../../tooling/scripts/runtime/check.mjs';
import { root, read, json, sharedPackages } from '../test.helper.mjs';

test('the backend application has no misleading package entrypoint', () => {
  assert.equal(json('apps/backend/package.json').main, undefined);
});

test('tooling modules follow domain ownership and have no import cycles', async () => {
  const scriptsRoot = resolve(root, 'tooling/scripts');
  const paths = readdirSync(scriptsRoot, { recursive: true })
    .filter((path) => path.endsWith('.mjs'))
    .map((path) => path.replaceAll('\\', '/'));
  const dependencies = new Map();
  const externalDependencies = new Map([
    [
      'test/run-suites.mjs',
      '../../../apps/backend/src/tests/test-lifecycle.mjs',
    ],
  ]);
  for (const path of paths) {
    assert.ok(
      /^(runtime|release|test)\/[a-z]+(?:-[a-z]+)*\.mjs$/.test(path),
      path
    );
    const source = read(`tooling/scripts/${path}`);
    const module = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true
    );
    const imports = module.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => statement.moduleSpecifier.text)
      .filter((specifier) => specifier.startsWith('.'));
    const localDependencies = [];
    for (const specifier of imports) {
      const target = resolve(scriptsRoot, dirname(path), specifier);
      assert.ok(existsSync(target), `${path}: ${specifier}`);
      const local = relative(scriptsRoot, target).replaceAll('\\', '/');
      if (!local.startsWith('../')) {
        assert.equal(local.split('/')[0], path.split('/')[0], path);
        localDependencies.push(local);
      } else {
        assert.equal(externalDependencies.get(path), specifier, path);
      }
    }
    dependencies.set(path, localDependencies);
    await import(
      new URL(`../../../../tooling/scripts/${path}`, import.meta.url)
    );
  }
  const visited = new Set();
  const active = new Set();
  function visit(path) {
    assert.ok(!active.has(path), `Import cycle at ${path}`);
    if (visited.has(path)) return;
    active.add(path);
    for (const dependency of dependencies.get(path) ?? []) visit(dependency);
    active.delete(path);
    visited.add(path);
  }
  for (const path of paths) visit(path);
});

test('executable scripts use the native Node entrypoint guard', () => {
  for (const script of [
    'tooling/scripts/runtime/check.mjs',
    'tooling/scripts/release/select-targets.mjs',
    'apps/backend/src/tests/grafana/notification-sink.mjs',
    'apps/documentation/src/scripts/record-doc-translation-review.mjs',
    'apps/backend/src/tests/grafana/run-integration.mjs',
    'apps/backend/src/tests/redis/run-integration.mjs',
    'tooling/scripts/test/run-ci.mjs',
    'tooling/scripts/test/run-visual-linux.mjs',
    'tooling/scripts/test/run-suites.mjs',
    'tooling/scripts/test/menu.mjs',
    'apps/documentation/src/scripts/warn-docs-translation.mjs',
  ]) {
    assert.match(read(script), /if \(import\.meta\.main\)/, script);
  }
});

test('workspace-owned utility scripts are exposed by their owner', () => {
  const rootScripts = json('package.json').scripts;
  const backendScripts = json('apps/backend/package.json').scripts;
  const documentationScripts = json('apps/documentation/package.json').scripts;

  assert.equal(
    backendScripts['test:integration:monitoring'],
    'node src/tests/grafana/run-integration.mjs'
  );
  assert.equal(backendScripts['test:integration:redis'], undefined);
  assert.match(
    backendScripts['test:integration'],
    /node src\/tests\/redis\/run-integration\.mjs/
  );
  assert.match(backendScripts.lint, /src/);
  assert.equal(
    documentationScripts['compare:translations'],
    'node src/scripts/warn-docs-translation.mjs'
  );
  assert.equal(
    documentationScripts['review:translations'],
    'node src/scripts/record-doc-translation-review.mjs'
  );
  assert.equal(
    rootScripts['compare:docs'],
    'npm run compare:translations -w documentation'
  );
  assert.equal(
    rootScripts['review:docs'],
    'npm run review:translations -w documentation'
  );
});

test('runtime enforcement rejects unsupported Node and npm versions', () => {
  const npmVersion = json('package.json').packageManager.slice(4);
  assert.doesNotThrow(() =>
    assertRuntime(read('tooling/config/.nvmrc').trim(), npmVersion)
  );
  assert.throws(() => assertRuntime('26.9.0', npmVersion), /Node.js 24/);
  assert.throws(() => assertRuntime('24.22.0', '11.0.0'), /Use npm/);
  assert.equal(
    json('package.json').scripts.preinstall,
    'node tooling/scripts/runtime/check.mjs'
  );
});

test('frontend API configuration selects deployment inputs and validates origins', () => {
  const environment = {
    VITE_DEV_API_URL: 'https://dev.example.test/',
    VITE_PROD_API_URL: 'https://api.example.test',
  };
  for (const mode of ['development', 'test']) {
    assert.equal(
      resolveFrontendApiUrl(environment, mode, 'build'),
      'https://dev.example.test'
    );
  }
  assert.equal(
    resolveFrontendApiUrl(environment, 'production', 'build'),
    'https://api.example.test'
  );
  assert.equal(
    resolveFrontendApiUrl(
      { ...environment, VITE_API_URL: 'https://override.example.test' },
      'production',
      'build'
    ),
    'https://override.example.test'
  );
  assert.equal(
    resolveFrontendApiUrl(
      { VITE_API_URL: 'http://localhost:8443' },
      'development',
      'serve'
    ),
    'http://localhost:8443'
  );
  for (const value of [
    undefined,
    'not-a-url',
    'http://api.example.test',
    'https://user:password@api.example.test',
    'https://api.example.test/path',
    'https://api.example.test/?key=value',
    'https://api.example.test/#fragment',
  ]) {
    assert.throws(() =>
      resolveFrontendApiUrl({ VITE_API_URL: value }, 'production', 'build')
    );
  }
});

test('workspaces expose distinct lint, typecheck, and composed check scripts', () => {
  for (const directory of [
    'apps/backend',
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const { scripts } = json(`${directory}/package.json`);
    assert.match(scripts.lint, /^eslint /, directory);
    assert.match(scripts.typecheck, /^tsc /, directory);
    assert.equal(scripts.check, 'npm run lint && npm run typecheck', directory);
    assert.equal(scripts['type-check'], undefined, directory);
    assert.notEqual(scripts.test, 'npm run lint', directory);
  }
  const { scripts } = json('package.json');
  for (const [suffix, workspace] of [
    ['backend', 'apps/backend'],
    ['auth', 'apps/frontend/auth'],
    ['sanny', 'apps/frontend/sanny'],
    ['docs', 'apps/documentation'],
  ]) {
    for (const operation of ['lint', 'typecheck', 'check']) {
      assert.equal(
        scripts[`${operation}:${suffix}`],
        `npm run ${operation} -w ${workspace === 'apps/backend' ? 'backend' : workspace === 'apps/frontend/auth' ? 'auth' : workspace === 'apps/frontend/sanny' ? 'sanny' : 'documentation'}`
      );
    }
  }
});

test('shared packages export existing source without redundant build steps', () => {
  for (const name of sharedPackages) {
    const directory = `shared/packages/${name}`;
    const manifest = json(`${directory}/package.json`);
    const entry = manifest.exports['.'];
    const source = typeof entry === 'string' ? entry : entry.default;
    assert.match(source, /\.tsx?$/);
    assert.ok(existsSync(resolve(root, directory, source)));
    assert.ok(manifest.scripts.typecheck);
    assert.equal(manifest.scripts['build:frontend'], undefined);
    assert.equal(manifest.main, undefined);
    assert.equal(manifest.types, undefined);
  }
});

test('frontend environment declarations reject unknown keys', () => {
  const path = resolve(root, 'apps/frontend/auth/tsconfig.json');
  const { config } = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    resolve(root, 'apps/frontend/auth')
  );
  const filePath = resolve(
    root,
    'apps/frontend/auth/src/config-contract-probe.ts'
  );
  const options = { ...parsed.options, incremental: false };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, createNew) =>
    resolve(name) === filePath
      ? ts.createSourceFile(
          name,
          'export const valid = import.meta.env.VITE_API_URL; export const invalid = import.meta.env.VITE_APPI_URL;',
          languageVersion,
          true
        )
      : getSourceFile(name, languageVersion, onError, createNew);
  const program = ts.createProgram(
    [...parsed.fileNames, filePath],
    options,
    host
  );
  const diagnostics = program.getSemanticDiagnostics(
    program.getSourceFile(filePath)
  );
  assert.equal(diagnostics.length, 1);
  assert.match(
    ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' '),
    /VITE_APPI_URL/
  );
});

test('Auth0 scripts have narrow runtime lint scopes', async () => {
  assert.match(json('apps/backend/package.json').scripts.lint, /\bauth0\b/);
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintText(
    'function login(email, password, callback) { callback(new ValidationError(configuration.message)); }',
    { filePath: 'apps/backend/auth0/database-action/login.js' }
  );
  assert.equal(results[0].errorCount, 0);
  const browser = await eslint.calculateConfigForFile(
    'apps/frontend/auth/src/main.tsx'
  );
  assert.equal(browser.languageOptions.globals.configuration, undefined);
});

test('repository-wide development tools have one root owner', () => {
  const dependencies = json('package.json').devDependencies;
  const tools = [
    'typescript',
    'vite',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'yaml',
  ];
  for (const tool of tools) assert.ok(dependencies[tool], tool);
  for (const directory of [
    'apps/backend',
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const manifest = json(`${directory}/package.json`);
    for (const tool of tools)
      assert.equal(
        manifest.devDependencies?.[tool],
        undefined,
        `${directory}: ${tool}`
      );
  }
});

test('workspace installs have one lockfile', () => {
  for (const directory of [
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    'apps/backend',
  ]) {
    assert.equal(
      existsSync(resolve(root, directory, 'package-lock.json')),
      false
    );
    assert.ok(json('package-lock.json').packages[directory]);
  }
});

test('formatting uses the root EditorConfig and Prettier ignore file', () => {
  const { scripts } = json('package.json');
  assert.equal(scripts.format, 'prettier . --write');
  assert.equal(scripts['format:check'], 'prettier . --check');
  assert.ok(existsSync(resolve(root, 'prettier.config.ts')));
  assert.ok(existsSync(resolve(root, '.editorconfig')));
  assert.match(read('.editorconfig'), /end_of_line = lf/);
  assert.ok(existsSync(resolve(root, '.prettierignore')));
});

test('Auth0 scripts use the experimental ternary layout only', async () => {
  const auth0Path = resolve(root, 'apps/backend/auth0/example.js');
  const otherPath = resolve(root, 'apps/backend/src/example.js');
  const auth0Options = await prettier.resolveConfig(auth0Path);
  const otherOptions = await prettier.resolveConfig(otherPath);
  const formatted = await prettier.format(
    'const result = condition ? firstChoice : secondChoice;\n',
    { ...auth0Options, filepath: auth0Path, printWidth: 25 }
  );

  assert.match(formatted, /condition\n\s+\? firstChoice/);
  assert.equal(otherOptions?.experimentalTernaries, undefined);
});

test('TypeScript target is centralized across runtime workspaces', () => {
  assert.equal(json('tsconfig.json').compilerOptions.target, 'ES2023');
  for (const path of [
    'apps/frontend/tsconfig.frontend.json',
    'apps/backend/tsconfig.json',
  ]) {
    assert.equal(json(path).compilerOptions.target, undefined, path);
  }
});

test('compiler ownership separates browser sources from Node tooling', () => {
  const base = json('tsconfig.json').compilerOptions;
  assert.equal(base.module, 'NodeNext');
  assert.equal(base.moduleResolution, 'NodeNext');
  for (const path of [
    'apps/frontend/auth/tsconfig.json',
    'apps/frontend/sanny/tsconfig.json',
  ]) {
    const config = json(path);
    assert.equal(config.extends, '../tsconfig.frontend.json');
    assert.deepEqual(config.include, ['src']);
    assert.equal(config.references, undefined);
  }
  for (const name of sharedPackages) {
    assert.equal(
      json(`shared/packages/${name}/tsconfig.json`).extends,
      '../../../apps/frontend/tsconfig.frontend.json'
    );
  }
  const path = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  assert.equal(
    parsed.options.moduleResolution,
    ts.ModuleResolutionKind.NodeNext
  );
  for (const file of [
    'apps/frontend/vite.config.ts',
    'apps/frontend/vitest.config.ts',
    'apps/frontend/auth/vite.config.ts',
    'apps/frontend/sanny/vite.config.ts',
    'shared/packages/ui/vitest.config.ts',
  ]) {
    assert.ok(
      parsed.fileNames.some((name) => resolve(name) === resolve(root, file)),
      file
    );
  }
});

test('frontend Vitest roots are anchored to their workspace configs', () => {
  for (const [config, path] of [
    [frontendVitestConfig, 'apps/frontend'],
    [authVitestConfig, 'apps/frontend/auth'],
    [sannyVitestConfig, 'apps/frontend/sanny'],
    [uiVitestConfig, 'shared/packages/ui'],
  ]) {
    assert.equal(resolve(config.test.root), resolve(root, path), path);
  }
});

test('shared editor lint discovery uses the same policy as npm', async () => {
  for (const name of sharedPackages) {
    const directory = resolve(root, 'shared/packages', name);
    const manifest = json(`shared/packages/${name}/package.json`);
    assert.equal(manifest.scripts.lint, 'eslint .');
    const eslint = new ESLint({ cwd: directory });
    const config = await eslint.calculateConfigForFile(
      name === 'ui' ? 'src/index.ts' : 'index.ts'
    );
    assert.ok(config.rules['@typescript-eslint/no-explicit-any']);
    assert.equal(
      config.rules['react-refresh/only-export-components'],
      undefined
    );
  }
});

test('ESLint keeps Node globals out of browser source', async () => {
  const eslint = new ESLint({ cwd: root });
  const browserConfig = await eslint.calculateConfigForFile(
    'apps/frontend/auth/src/main.tsx'
  );
  const toolingConfig = await eslint.calculateConfigForFile(
    'playwright.config.ts'
  );

  assert.equal(browserConfig.languageOptions.globals.process, undefined);
  assert.ok(Object.hasOwn(toolingConfig.languageOptions.globals, 'process'));
  const vitestConfig = await eslint.calculateConfigForFile(
    'shared/packages/ui/vitest.config.ts'
  );
  assert.equal(vitestConfig.languageOptions.globals.window, undefined);
  assert.equal(vitestConfig.rules['react-hooks/rules-of-hooks'], undefined);
  const backendConfig = await eslint.calculateConfigForFile(
    'apps/backend/src/server.ts'
  );
  for (const config of [browserConfig, backendConfig]) {
    assert.equal(config.languageOptions.parserOptions.projectService, true);
    assert.equal(config.languageOptions.parserOptions.tsconfigRootDir, root);
    assert.equal(config.rules['@typescript-eslint/await-thenable'][0], 2);
    assert.equal(config.rules['@typescript-eslint/no-floating-promises'][0], 2);
  }
});

test('tooling relocation removes obsolete paths and preserves Docker configuration', () => {
  for (const path of [
    'shared/frontend-env.d.ts',
    'playwright.real.config.ts',
    'playwright.monitoring.config.ts',
    'tooling/scripts/run-test-with-stopwatch.mjs',
    'e2e',
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, path);
  }
  const contractFiles = [
    'shared/tests/contracts/misc/docs.contracts.test.mjs',
    'shared/tests/contracts/infra/workspace.infra.contract.test.mjs',
    'shared/tests/contracts/misc/deployment.contracts.test.mjs',
    'shared/tests/contracts/misc/test-runner.contracts.test.mjs',
    'shared/tests/contracts/infra/backend.infra.contract.test.mjs',
  ];
  assert.equal(
    existsSync(resolve(root, 'shared/tests/config/config.test.mjs')),
    false
  );
  for (const file of contractFiles) {
    assert.ok(existsSync(resolve(root, file)), file);
  }
  assert.equal(
    json('package.json').scripts['test:tooling'],
    'node --test "shared/tests/contracts/**/*.test.mjs"'
  );
  assert.match(
    read('apps/backend/docker/Dockerfile'),
    /COPY tsconfig\.json \.\/tsconfig\.json/
  );
  assert.match(read('apps/backend/docker/Dockerfile'), /\/app\/tsconfig\.json/);
  assert.match(read('eslint.config.js'), /globalIgnores/);
});

test('root script composition does not reference missing aliases', () => {
  const { scripts } = json('package.json');
  for (const [name, script] of Object.entries(scripts)) {
    for (const command of script.split('&&')) {
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
