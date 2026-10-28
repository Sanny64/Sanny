import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { CANCEL_SYMBOL } from '@clack/core';
import { parse } from 'yaml';
import browserConfig from '../../e2e/playwright.mocked.config.ts';
import baseBrowserConfig from '../../../../playwright.config.ts';
import docsBrowserConfig from '../../e2e/playwright.docs.config.ts';
import {
  BACKEND_DEPENDENT_SCRIPTS,
  E2E_GATE_SCRIPTS,
  FULL_GATE_SCRIPTS,
  LIVE_GATE_SCRIPTS,
  MONITORING_GATE_SCRIPTS,
  PLAYWRIGHT_GATE_ARGS,
  selectTestSuite,
} from '../../../../tooling/scripts/test/suites.mjs';
import {
  backendHealthUrl,
  newlyStartedServices,
  waitForBackendReady,
} from '../../../../apps/backend/src/tests/test-lifecycle.mjs';
import { selectStaleTestProjects } from '../../../../apps/backend/src/tests/stale-test-projects.mjs';
import {
  visualDependencyImage,
  visualWorkspaceFiles,
} from '../../../../tooling/scripts/test/run-visual-linux.mjs';
import { root, read, json } from '../test.helper.mjs';
import { runTestMenu } from '../../../../tooling/scripts/test/menu.mjs';
import { formatDuration } from '../../../../tooling/scripts/test/stopwatch.mjs';

test('suite selection rejects ambiguous or unknown flags before execution', () => {
  assert.deepEqual(selectTestSuite([]).scripts, FULL_GATE_SCRIPTS);
  assert.deepEqual(selectTestSuite(['--live-only']).scripts, LIVE_GATE_SCRIPTS);
  assert.deepEqual(selectTestSuite(['--e2e-only']).scripts, E2E_GATE_SCRIPTS);
  assert.deepEqual(
    selectTestSuite(['--monitoring-only']).scripts,
    MONITORING_GATE_SCRIPTS
  );
  for (const args of [
    ['--unknown'],
    ['--live-only', '--monitoring-only'],
    ['--live-only', '--live-only'],
    ['toString'],
  ]) {
    assert.throws(() => selectTestSuite(args), /Use at most one/);
    const result = spawnSync(
      process.execPath,
      [resolve(root, 'tooling/scripts/test/run-suites.mjs'), ...args],
      { encoding: 'utf8', env: { ...process.env, npm_execpath: '' } }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Use at most one/);
    assert.equal(result.stdout, '');
  }
});

test('test CLIs explain usage and reject non-interactive menus without starting tests', () => {
  for (const script of ['menu', 'run-ci', 'run-suites', 'run-visual-linux']) {
    const path = resolve(root, `tooling/scripts/test/${script}.mjs`);
    const help = spawnSync(process.execPath, [path, '--help'], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: '' },
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    const invalid = spawnSync(process.execPath, [path, '--typo'], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
  }
  const menu = spawnSync(
    process.execPath,
    [resolve(root, 'tooling/scripts/test/menu.mjs')],
    { encoding: 'utf8' }
  );
  assert.equal(menu.status, 1);
  assert.match(menu.stderr, /interactive terminal.*npm run test:ci/);
});

test('stopwatch formats seconds, minutes, and hours consistently', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(1999), '00:01');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_661_000), '1:01:01');
});

test('test entrypoints preserve runtime, root, safe flags, and failure codes', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'sanny-runner-contract-'));
  try {
    const npmCli = resolve(directory, 'npm-fixture.mjs');
    writeFileSync(
      npmCli,
      `
      console.log(JSON.stringify({
        args: process.argv.slice(2),
        runtime: process.execPath,
        cwd: process.cwd(),
        ci: process.env.CI,
        nodeEnv: process.env.NODE_ENV,
        critical: process.env.RUN_CRITICAL_TESTS,
        spike: process.env.RUN_429_SPIKE_E2E,
        discord: process.env.RUN_DISCORD_INTEGRATION,
      }));
      process.exitCode = Number(process.env.SANNY_FIXTURE_EXIT_CODE);
    `
    );
    for (const [script, expectedCode] of [
      ['test/run-ci', 0],
      ['test/run-ci', 7],
      ['test/run-suites', 7],
    ]) {
      const result = spawnSync(
        process.execPath,
        [resolve(root, `tooling/scripts/${script}.mjs`)],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            npm_execpath: npmCli,
            SANNY_FIXTURE_EXIT_CODE: String(expectedCode),
            NODE_ENV: 'production',
            RUN_CRITICAL_TESTS: 'true',
            RUN_429_SPIKE_E2E: 'true',
            RUN_DISCORD_INTEGRATION: 'true',
          },
        }
      );
      assert.equal(result.status, expectedCode, result.stderr);
      assert.match(
        result.stdout,
        /Starting the (CI test suite|full test suite)\./
      );
      assert.match(
        result.stdout,
        new RegExp(
          `finished with exit code ${expectedCode} after (?:\\d+:)?\\d{2}:\\d{2}\\.`
        )
      );
      const records = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('{'));
      assert.equal(records.length, 1, result.stdout);
      const record = JSON.parse(records[0]);
      assert.deepEqual(record.args, ['run', 'test:core']);
      assert.equal(record.runtime, process.execPath);
      assert.equal(resolve(record.cwd), resolve(root));
      const isCi = script === 'test/run-ci';
      if (isCi) assert.equal(record.ci, 'true');
      assert.equal(record.nodeEnv, isCi ? 'development' : 'production');
      for (const flag of ['critical', 'spike', 'discord']) {
        assert.equal(record[flag], isCi ? 'false' : 'true');
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Linux visual workspaces exclude environment files and local assets', () => {
  assert.deepEqual(
    visualWorkspaceFiles([
      'package.json',
      'apps/frontend/auth/src/App.tsx',
      'apps/frontend/frontend-env.d.ts',
      'apps/frontend/sanny/src/pages/games/Games.tsx',
      'apps/backend/.env',
      '../outside/package.json',
      'apps/frontend/auth/.env.local',
      '.secret/key',
      'apps/backend/redis/certs/ca.crt',
      'node_modules/vite/index.js',
      'apps/frontend/sanny/dist/index.html',
      'apps/documentation/build/index.html',
    ]),
    [
      'package.json',
      'apps/frontend/auth/src/App.tsx',
      'apps/frontend/frontend-env.d.ts',
      'apps/frontend/sanny/src/pages/games/Games.tsx',
    ]
  );
  assert.match(
    read('tooling/scripts/test/run-visual-linux.mjs'),
    /lock\.packages\[['"]node_modules\/@playwright\/test['"]\]/
  );
});

test('Linux visual dependency images invalidate for every build input', () => {
  const inputs = [
    ['package.json', '{"packageManager":"npm@11.6.3"}'],
    ['package-lock.json', '{"lockfileVersion":3}'],
    ['apps/frontend/auth/package.json', '{"name":"auth"}'],
    ['apps/backend/docker/Dockerfile.visual', 'FROM playwright'],
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
    visualDependencyImage([
      ...inputs,
      ['apps/frontend/sanny/package.json', '{}'],
    ])
  );
});

test('visual suites have Linux counterparts for Windows baselines', () => {
  for (const suite of ['auth-accessibility', 'sanny-accessibility']) {
    const directory = resolve(
      root,
      `shared/tests/e2e/mock/${suite}.spec.ts-snapshots`
    );
    const files = readdirSync(directory);
    const windows = files.filter((name) => name.endsWith('-win32.png'));
    assert.ok(windows.length > 0);
    for (const name of windows) {
      assert.ok(
        files.includes(name.replace(/-win32\.png$/, '-linux.png')),
        name
      );
    }
  }
});

test('default browser tests exclude live authentication and monitoring', () => {
  assert.notEqual(baseBrowserConfig, browserConfig);
  assert.equal(
    resolve(browserConfig.testDir),
    resolve(root, 'shared/tests/e2e/mock')
  );
  assert.equal(browserConfig.workers, 2);
  assert.equal(
    json('package.json').scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ['chromium', 'firefox', 'webkit', 'edge']
  );
  for (const server of browserConfig.webServer) {
    assert.equal(server.reuseExistingServer, !process.env.CI);
    assert.equal(resolve(server.cwd), resolve(root));
  }
  assert.equal(browserConfig.forbidOnly, Boolean(process.env.CI));
});

test('live authentication uses one API origin for the app and backend checks', () => {
  const liveConfig = read('shared/tests/e2e/playwright.real.config.ts');
  const liveTest = read('shared/tests/e2e/real/login-logout.spec.ts');
  const apiOrigin =
    /E2E_API_URL\s*\?\?\s*(?:process\.)?env\.VITE_API_URL\s*\?\?\s*["']https:\/\/localhost:8443["']/;

  assert.match(liveConfig, apiOrigin);
  assert.match(liveTest, apiOrigin);
  assert.match(liveConfig, /reuseExistingServer:\s*false/);
  assert.match(liveConfig, /sanny -- --host 127\.0\.0\.1 --port 5178/);
  assert.doesNotMatch(liveConfig, /auth -- --host/);
  assert.match(liveTest, /127\.0\.0\.1:5178/);
  assert.match(liveTest, /SANNY_E2E_TRUSTED_ORIGIN/);
  assert.match(liveConfig, /LIVE_AUTH_CREDENTIALS/);
  assert.match(
    read('shared/tests/e2e/backend-environment.ts'),
    /\[\s*'TESTUSER_EMAIL',\s*'TESTUSER_PASSWORD',?\s*\]/
  );
  assert.match(liveConfig, /Live Auth0 tests require/);
  assert.doesNotMatch(liveConfig, /TESTGOOGLEUSER_EMAIL/);
  assert.match(
    read('shared/tests/e2e/playwright.monitoring.config.ts'),
    /E2E_API_URL\s*\?\?\s*process\.env\.VITE_API_URL\s*\?\?/
  );
});

test('opted-in monitoring tests load only their credentials from the local backend environment', () => {
  const monitoringConfig = read(
    'shared/tests/e2e/playwright.monitoring.config.ts'
  );
  const backendEnvironment = read('shared/tests/e2e/backend-environment.ts');
  assert.match(monitoringConfig, /RUN_429_SPIKE_E2E === 'true'/);
  assert.match(monitoringConfig, /RUN_DISCORD_INTEGRATION === 'true'/);
  assert.match(monitoringConfig, /RUN_EMAIL_INTEGRATION === 'true'/);
  assert.match(monitoringConfig, /MONITORING_CREDENTIALS/);
  assert.match(
    backendEnvironment,
    /'NGINX_BASIC_AUTH_USER'[\s\S]*?'NGINX_BASIC_AUTH_PASSWORD'[\s\S]*?'GRAFANA_ADMIN_USER'[\s\S]*?'GRAFANA_ADMIN_PASSWORD'/
  );
  assert.match(backendEnvironment, /apps\/backend\/\.env/);
  assert.match(
    monitoringConfig,
    /only these four credentials are read by this test config/
  );
  assert.match(backendEnvironment, /DISCORD_WEBHOOK: 'DEV_DISCORD_WEBHOOK'/);
  assert.doesNotMatch(
    backendEnvironment.replace(/\/\/.*$/gm, ''),
    /PROD_DISCORD_WEBHOOK/
  );
  for (const config of ['real', 'monitoring']) {
    assert.doesNotMatch(
      read(`shared/tests/e2e/playwright.${config}.config.ts`),
      /dotenv/
    );
  }
  const session = read('shared/tests/e2e/monitoring/grafana-session.ts');
  assert.match(session, /nginx\/secret\/\.htpasswd/);
  assert.match(session, /request\.post\('\/grafana\/login'/);
  assert.match(
    read('shared/tests/e2e/monitoring/discord-routing.spec.ts'),
    /LOOPBACK_HOSTS/
  );
});

test('backend test cleanup only targets services newly started by the gate', () => {
  assert.deepEqual(
    newlyStartedServices(['redis', 'grafana'], ['redis', 'grafana', 'nginx']),
    ['nginx']
  );
  assert.deepEqual(newlyStartedServices(['redis'], ['redis']), []);
  const lifecycle = read('apps/backend/src/tests/test-lifecycle.mjs');
  assert.match(lifecycle, /ps', '--services', '--status', 'running'/);
  assert.match(lifecycle, /\['stop', \.\.\.startedServices\]/);
  assert.doesNotMatch(lifecycle, /['"]stop:backend['"]/);
  assert.match(lifecycle, /BACKEND_START_TIMEOUT_MS = 180_000/);
  assert.match(lifecycle, /while \(now\(\) < deadline && !isCancelled\(\)\)/);
  assert.match(lifecycle, /if \(isCancelled\(\)\) return 1;/);
  const runner = read('tooling/scripts/test/run-suites.mjs');
  assert.match(runner, /ensureBackendRunning/);
  assert.match(runner, /stopBackendServicesStartedByTest/);
  assert.doesNotMatch(
    runner,
    /healthcheck|docker compose|runningBackendServices/
  );
});

test('backend readiness handles success, timeout, and cancellation', async () => {
  let healthChecks = 0;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => ++healthChecks === 2,
      isCancelled: () => false,
      now: () => 0,
      pause: async () => {},
    }),
    true
  );

  let time = 0;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => false,
      isCancelled: () => false,
      timeoutMs: 10,
      now: () => {
        const current = time;
        time += 5;
        return current;
      },
      pause: async () => {},
    }),
    false
  );
  let cancelled = false;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => false,
      isCancelled: () => cancelled,
      now: () => 0,
      pause: async () => {
        cancelled = true;
      },
    }),
    false
  );
});

test('docs browser tests use a dedicated mobile Chromium server', () => {
  assert.equal(
    resolve(docsBrowserConfig.testDir),
    resolve(root, 'shared/tests/e2e/docs')
  );
  assert.deepEqual(
    docsBrowserConfig.projects.map((project) => project.name),
    ['chromium-mobile']
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
    json('package.json').scripts['test:e2e:docs'],
    'playwright test --config=shared/tests/e2e/playwright.docs.config.ts'
  );
});

test('mocked browser and visual commands cover accessibility checks', () => {
  const { scripts } = json('package.json');
  assert.equal(
    scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  for (const file of [
    'auth-accessibility.spec.ts',
    'sanny-accessibility.spec.ts',
    'accessibility.spec.ts',
  ]) {
    assert.ok(existsSync(resolve(root, 'shared/tests/e2e/mock', file)), file);
  }
  assert.equal(
    scripts['test:visual:linux'],
    'node tooling/scripts/test/run-visual-linux.mjs'
  );
  const visualRunner = read('tooling/scripts/test/run-visual-linux.mjs');
  assert.match(visualRunner, /auth-accessibility\.spec\.ts/);
  assert.match(visualRunner, /sanny-accessibility\.spec\.ts/);
  assert.match(visualRunner, /--project chromium --grep 'visual baseline'/);
  const webkit = browserConfig.projects.find(
    (project) => project.name === 'webkit'
  );
  assert.ok(webkit.testMatch.includes('**/*accessibility.spec.ts'));
});

test('menu choices execute safe or confirmed full runs exactly once', async () => {
  const cases = [
    { scope: 'safe', approvals: [true] },
    { scope: 'full', target: 'development', approvals: [false, true] },
    { scope: 'full', target: 'production', approvals: [false, true] },
  ];
  for (const { scope, target, approvals } of cases) {
    for (const approved of approvals) {
      const answers = scope === 'full' ? [scope, target] : [scope];
      const prompts = [
        ['safe', 'full'],
        ['development', 'production'],
      ];
      const calls = [];
      let confirmations = 0;
      await runTestMenu('/fixture/npm-cli.js', {
        selectOption: async (options) => {
          assert.deepEqual(
            options.options.map(({ value }) => value),
            prompts.shift()
          );
          return answers.shift();
        },
        confirmRun: async (options) => {
          confirmations++;
          assert.equal(options.initialValue, false);
          assert.equal(
            options.message.includes('PRODUCTION:'),
            target === 'production'
          );
          return approved;
        },
        resolveOrigin: (selected) => {
          assert.equal(selected, target);
          return `https://${target}.example.test`;
        },
        loadDiscordEnvironment: () => {
          assert.equal(target, 'development');
          return { DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1/x' };
        },
        execute: (...args) => calls.push(args),
      });
      assert.equal(confirmations, scope === 'full' ? 1 : 0);
      assert.equal(calls.length, approved ? 1 : 0);
      if (!approved) continue;
      const [runtime, args, options] = calls[0];
      assert.equal(runtime, process.execPath);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.env.NODE_ENV, 'development');
      if (scope === 'safe') {
        assert.deepEqual(args, ['/fixture/npm-cli.js', 'run', 'test:ci']);
        assert.equal(options.env.E2E_API_URL, process.env.E2E_API_URL);
        for (const flag of [
          'RUN_CRITICAL_TESTS',
          'RUN_429_SPIKE_E2E',
          'RUN_DISCORD_INTEGRATION',
        ]) {
          assert.equal(options.env[flag], 'false');
        }
        continue;
      }
      assert.equal(
        resolve(args[0]),
        resolve(root, 'tooling/scripts/test/run-suites.mjs')
      );
      assert.equal(options.env.VITE_API_URL, `https://${target}.example.test`);
      assert.equal(options.env.E2E_API_URL, options.env.VITE_API_URL);
      assert.equal(options.env.RUN_CRITICAL_TESTS, 'true');
      assert.equal(options.env.RUN_429_SPIKE_E2E, 'true');
      assert.equal(
        options.env.RUN_DISCORD_INTEGRATION,
        target === 'development' ? 'true' : 'false'
      );
    }
  }
  for (const answers of [[CANCEL_SYMBOL], ['full', CANCEL_SYMBOL]]) {
    await runTestMenu('/fixture/npm-cli.js', {
      selectOption: async () => answers.shift(),
      resolveOrigin: () =>
        assert.fail('Cancellation must not load environment files'),
      loadDiscordEnvironment: () =>
        assert.fail('Cancellation must not load environment files'),
      execute: () => assert.fail('Cancellation must not start tests'),
    });
  }
  await runTestMenu('/fixture/npm-cli.js', {
    selectOption: async () => 'safe',
    resolveOrigin: () => assert.fail('Safe runs need no API target'),
    loadDiscordEnvironment: () => assert.fail('Safe runs need no credentials'),
    execute: () => {},
  });
});

test('the test menu maps safe and full targets and protects live opt-ins', async () => {
  const { resolveApiOrigin, resolveSharedApiOrigin } =
    await import('../../../../tooling/scripts/test/api-origin.mjs');
  const { createFullTestEnvironment, safeTestEnvironment } =
    await import('../../../../tooling/scripts/test/environment.mjs');
  const {
    applyBackendTestEnvironment,
    DISCORD_CREDENTIALS,
    LIVE_AUTH_CREDENTIALS,
    MONITORING_CREDENTIALS,
    readBackendTestEnvironment,
  } = await import('../../e2e/backend-environment.ts');
  const environment = {
    VITE_DEV_API_URL: 'https://dev.example.test/',
    VITE_PROD_API_URL: 'https://prod.example.test',
  };

  assert.equal(
    resolveApiOrigin(environment, 'development'),
    'https://dev.example.test'
  );
  assert.equal(
    resolveApiOrigin(environment, 'production'),
    'https://prod.example.test'
  );
  assert.equal(
    resolveApiOrigin(
      { ...environment, VITE_API_URL: 'https://override.example.test/' },
      'production'
    ),
    'https://override.example.test'
  );
  const secondFrontend = {
    VITE_DEV_API_URL: 'https://dev.example.test',
    VITE_PROD_API_URL: 'https://prod.example.test',
  };
  assert.equal(
    resolveSharedApiOrigin([environment, secondFrontend], 'development'),
    'https://dev.example.test'
  );
  assert.throws(
    () =>
      resolveSharedApiOrigin(
        [
          environment,
          { ...secondFrontend, VITE_DEV_API_URL: 'https://other.example.test' },
        ],
        'development'
      ),
    /origins differ between the auth and sanny frontend configurations/
  );
  assert.throws(
    () =>
      resolveApiOrigin(
        { VITE_DEV_API_URL: 'http://localhost:8443' },
        'development'
      ),
    /HTTPS API origin/
  );
  assert.throws(
    () =>
      resolveApiOrigin(
        { VITE_DEV_API_URL: 'https://dev.example.test/api' },
        'development'
      ),
    /without a path or credentials/
  );

  const full = createFullTestEnvironment(
    environment,
    resolveSharedApiOrigin([environment, secondFrontend], 'development'),
    'development',
    { DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1/x' }
  );
  assert.equal(full.VITE_API_URL, 'https://dev.example.test');
  assert.equal(full.E2E_API_URL, full.VITE_API_URL);
  assert.equal(full.NODE_ENV, 'development');
  assert.equal(full.RUN_CRITICAL_TESTS, 'true');
  assert.equal(full.RUN_429_SPIKE_E2E, 'true');
  assert.equal(full.RUN_DISCORD_INTEGRATION, 'true');
  assert.equal(full.RUN_EMAIL_INTEGRATION, 'true');
  assert.equal(full.DISCORD_WEBHOOK, 'https://discord.com/api/webhooks/1/x');
  assert.equal(
    createFullTestEnvironment(
      { DISCORD_WEBHOOK: 'shell-hook' },
      'https://dev.example.test',
      'development',
      { DISCORD_WEBHOOK: 'file-hook' }
    ).DISCORD_WEBHOOK,
    'shell-hook'
  );

  const production = createFullTestEnvironment(
    environment,
    resolveSharedApiOrigin([environment, secondFrontend], 'production'),
    'production',
    { DISCORD_WEBHOOK: 'must-not-be-forwarded' }
  );
  assert.equal(production.VITE_API_URL, 'https://prod.example.test');
  assert.equal(production.RUN_CRITICAL_TESTS, 'true');
  assert.equal(production.RUN_429_SPIKE_E2E, 'true');
  assert.equal(production.RUN_DISCORD_INTEGRATION, 'false');
  assert.equal(production.RUN_EMAIL_INTEGRATION, 'false');
  assert.equal(production.DISCORD_WEBHOOK, undefined);
  assert.throws(
    () => createFullTestEnvironment(environment, 'https://x.test', 'typo'),
    /development or production/
  );

  const envDirectory = mkdtempSync(resolve(tmpdir(), 'sanny-env-'));
  try {
    const envFile = resolve(envDirectory, '.env');
    writeFileSync(
      envFile,
      'DEV_DISCORD_WEBHOOK=dev-hook\nPROD_DISCORD_WEBHOOK=prod-hook\nDISCORD_WEBHOOK=legacy\nGRAFANA_ADMIN_USER=admin\nTESTUSER_EMAIL=user@example.test\nOTHER=x\n'
    );
    assert.deepEqual(readBackendTestEnvironment(DISCORD_CREDENTIALS, envFile), {
      DISCORD_WEBHOOK: 'dev-hook',
    });
    assert.deepEqual(
      readBackendTestEnvironment(MONITORING_CREDENTIALS, envFile),
      { GRAFANA_ADMIN_USER: 'admin' }
    );
    assert.deepEqual(
      readBackendTestEnvironment(LIVE_AUTH_CREDENTIALS, envFile),
      { TESTUSER_EMAIL: 'user@example.test' }
    );
    const target = { GRAFANA_ADMIN_USER: 'shell-user' };
    applyBackendTestEnvironment(
      [...MONITORING_CREDENTIALS, ...DISCORD_CREDENTIALS],
      target,
      envFile
    );
    assert.deepEqual(target, {
      GRAFANA_ADMIN_USER: 'shell-user',
      DISCORD_WEBHOOK: 'dev-hook',
    });
    assert.deepEqual(
      readBackendTestEnvironment(
        DISCORD_CREDENTIALS,
        resolve(envDirectory, 'missing')
      ),
      {}
    );
  } finally {
    rmSync(envDirectory, { recursive: true, force: true });
  }

  const ci = safeTestEnvironment({
    NODE_ENV: 'production',
    RUN_CRITICAL_TESTS: 'true',
    RUN_429_SPIKE_E2E: 'true',
    RUN_DISCORD_INTEGRATION: 'true',
    RUN_EMAIL_INTEGRATION: 'true',
  });
  assert.equal(ci.NODE_ENV, 'development');
  assert.equal(ci.RUN_CRITICAL_TESTS, 'false');
  assert.equal(ci.RUN_429_SPIKE_E2E, 'false');
  assert.equal(ci.RUN_DISCORD_INTEGRATION, 'false');
  assert.equal(ci.RUN_EMAIL_INTEGRATION, 'false');
  assert.throws(
    () => resolveApiOrigin(environment, 'preview'),
    /development or production/
  );
  assert.throws(
    () => resolveSharedApiOrigin([], 'development'),
    /auth and sanny/
  );
});

test('the full gate runs each suite once and covers all major browsers', () => {
  const { scripts } = json('package.json');
  const backendScripts = json('apps/backend/package.json').scripts;
  assert.equal(scripts.test, 'node tooling/scripts/test/menu.mjs');
  assert.equal(scripts['test:ci'], 'node tooling/scripts/test/run-ci.mjs');
  assert.equal(scripts['test:full'], undefined);
  assert.match(scripts['test:core'], /npm run check(?: &&|$)/);
  assert.match(scripts['test:core'], /npm run build:frontend/);
  assert.match(scripts['test:core'], /npm run test:contracts/);
  assert.match(scripts['test:core'], /npm run test:unit/);
  assert.match(scripts['test:core'], /npm run test:integration/);
  assert.match(scripts['test:core'], /npm run test:browser/);
  assert.equal(scripts['test:unit:backend'], 'npm run test:unit -w backend');
  assert.equal(
    scripts['test:unit:frontend'],
    'npm run test:auth && npm run test:sanny && npm run test:components'
  );
  assert.equal(
    scripts['test:contracts'],
    'npm run test:tooling && npm run test:frontend:contracts'
  );
  assert.equal(
    scripts['test:integration'],
    'npm run test:integration -w backend'
  );
  assert.equal(
    scripts['test:browser'],
    'npm run test:e2e:mocked && npm run test:e2e:docs'
  );
  assert.doesNotMatch(
    scripts['test:core'],
    /npm run build:backend|npm run build(?:\s|&&)/
  );
  assert.equal(
    scripts.build,
    'npm run build:backend && npm run build:frontend'
  );
  assert.match(
    scripts['build:frontend'],
    /npm run build:auth && npm run build:docs && npm run build:sanny/
  );
  assert.equal(
    scripts['build:docs:en'],
    'npm run build -w documentation -- --locale en'
  );
  assert.equal(
    scripts['build:docs:de'],
    'npm run build -w documentation -- --locale de'
  );
  assert.equal(scripts['build:docs'], 'npm run build -w documentation');
  assert.equal(scripts['build:docs:all'], undefined);
  assert.match(scripts['test:core'], /npm run test:visual:linux/);
  assert.doesNotMatch(
    scripts['test:core'],
    /npm run test:backend|npm run test:auth|npm run test:sanny|npm run test:components|npm run test:e2e:mocked/
  );
  assert.equal(scripts.test, 'node tooling/scripts/test/menu.mjs');
  const testRunner = read('tooling/scripts/test/run-suites.mjs');
  assert.match(
    testRunner,
    /ensureBackendRunning\(\{[\s\S]*?onBackendStart: \(services\)/
  );
  assert.match(testRunner, /runScript: \(scriptName\) =>/);
  assert.match(testRunner, /if \(previouslyRunningBackendServices\)/);
  assert.deepEqual(FULL_GATE_SCRIPTS, [
    'test:core',
    'test:e2e:real',
    'test:e2e:429',
  ]);
  assert.deepEqual(LIVE_GATE_SCRIPTS, ['test:e2e:real']);
  assert.deepEqual(E2E_GATE_SCRIPTS, [
    'test:e2e:mocked',
    'test:e2e:real',
    'test:e2e:429',
    'test:e2e:docs',
  ]);
  assert.deepEqual(MONITORING_GATE_SCRIPTS, ['test:e2e:429']);
  assert.deepEqual(
    [...BACKEND_DEPENDENT_SCRIPTS],
    ['test:e2e:real', 'test:e2e:429']
  );
  assert.deepEqual(PLAYWRIGHT_GATE_ARGS, {
    'test:e2e:real': [
      'test',
      '--config=shared/tests/e2e/playwright.real.config.ts',
      '--headed',
    ],
    'test:e2e:429': [
      'test',
      '--config=shared/tests/e2e/playwright.monitoring.config.ts',
      '--project=chromium',
    ],
  });
  assert.equal(scripts['test:e2e:real:playwright'], undefined);
  assert.equal(scripts['test:e2e:429:playwright'], undefined);
  assert.ok(
    read('tooling/scripts/test/run-suites.mjs').includes(
      'spawn(process.execPath, commandArgs'
    )
  );
  assert.equal(backendHealthUrl({}).href, 'https://localhost:8443/healthcheck');
  assert.equal(
    backendHealthUrl({ E2E_API_URL: 'https://127.0.0.1:9443/api' }).href,
    'https://127.0.0.1:9443/healthcheck'
  );
  assert.deepEqual(
    selectStaleTestProjects(
      [
        'sanny-monitoring-tests-10',
        'sanny-monitoring-tests-10',
        'sanny-monitoring-tests-20',
        'sanny-monitoring-tests-x',
        'sanny64',
      ],
      'sanny-monitoring-tests-',
      (processId) => processId === 20
    ),
    ['sanny-monitoring-tests-10']
  );
  for (const runner of [
    'apps/backend/src/tests/redis/run-integration.mjs',
    'apps/backend/src/tests/grafana/run-integration.mjs',
  ]) {
    assert.match(read(runner), /runComposeIntegration\(\{/);
  }
  assert.equal(scripts['test:backend:redis'], undefined);
  assert.equal(
    backendScripts.test,
    'npm run test:unit && npm run test:integration'
  );
  assert.equal(
    backendScripts['test:integration'],
    'npm run test:integration:monitoring && node src/tests/redis/run-integration.mjs && npm run test:integration:discord'
  );
  for (const workspace of [
    'apps/frontend/auth/package.json',
    'apps/frontend/sanny/package.json',
    'shared/packages/ui/package.json',
  ]) {
    const workspaceScripts = json(workspace).scripts;
    assert.ok(workspaceScripts['test:unit'], workspace);
    assert.equal(workspaceScripts.test, 'npm run test:unit', workspace);
  }
  assert.equal(scripts['test:unit:backend'], 'npm run test:unit -w backend');
  assert.equal(
    scripts['test:integration'],
    'npm run test:integration -w backend'
  );
  assert.equal(
    scripts['test:browser'],
    'npm run test:e2e:mocked && npm run test:e2e:docs'
  );
  assert.doesNotMatch(scripts.test, /test:integration:redis/);
  assert.doesNotMatch(
    read('apps/backend/src/tests/redis/run-integration.mjs'),
    /--env-file.*\.env/
  );
  assert.doesNotMatch(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /extends:|env_file:/
  );
  assert.match(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /internal:\s*true/
  );
  assert.doesNotMatch(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /ports:/
  );
  assert.match(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /sanny-redis-test-only/
  );
  assert.match(
    read('apps/backend/src/tests/compose-integration.mjs'),
    /["']--build["']/
  );
  assert.equal(
    parse(read('apps/backend/docker/compose/docker-compose.test.redis.yml'))
      .services['sanny64-backend'].build.dockerfile,
    'apps/backend/docker/Dockerfile'
  );
  assert.equal(scripts['test:e2e:real'], undefined);
  assert.equal(scripts['test:e2e:429'], undefined);
  assert.equal(scripts['test:e2e'], undefined);
  assert.equal(
    scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  assert.equal(scripts['test:gate'], undefined);
  for (const scriptName of [
    'test:e2e:real:chromium',
    'test:e2e:real:firefox',
    'test:e2e:real:edge',
    'test:e2e:mocked:chromium',
    'test:e2e:mocked:firefox',
    'test:e2e:mocked:edge',
    'test:e2e:accessibility:auth',
    'test:e2e:accessibility:sanny',
    'test:e2e:accessibility:shared',
  ]) {
    assert.equal(scripts[scriptName], undefined, scriptName);
  }
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ['chromium', 'firefox', 'webkit', 'edge']
  );
  for (const [app, workspace] of [
    ['auth', 'apps/frontend/auth'],
    ['sanny', 'apps/frontend/sanny'],
  ]) {
    assert.doesNotMatch(
      json(`${workspace}/package.json`).scripts.build,
      /typecheck|lint/
    );
    assert.match(
      scripts[`build:${app}`],
      new RegExp(`npm run build -w ${app}`)
    );
  }
});
