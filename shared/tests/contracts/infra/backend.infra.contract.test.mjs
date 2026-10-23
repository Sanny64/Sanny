import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { createTestRules } from '../../../../apps/backend/src/tests/grafana/run-integration.mjs';
import { createRedisTestCertificates } from '../../../../apps/backend/src/tests/redis/run-integration.mjs';
import { readFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { runComposeIntegration } from '../../../../apps/backend/src/tests/compose-integration.mjs';
import { root, read, json } from '../test.helper.mjs';

test('Compose integration shares paths, failure codes, and unconditional teardown', async () => {
  for (const scenario of [
    { up: 0, down: 0, expected: 0 },
    { up: 7, down: 0, expected: 7 },
    { up: 7, down: 9, expected: 7 },
    { up: 0, down: 9, expected: 9 },
    { up: null, down: 0, error: true, expected: 1 },
    { up: null, down: 0, signal: 'SIGINT', expected: 130 },
    { up: null, down: 0, signal: 'SIGTERM', expected: 143 },
  ]) {
    const calls = [];
    const listeners = ['SIGINT', 'SIGTERM'].map((signal) =>
      process.listenerCount(signal)
    );
    const result = await runComposeIntegration(
      {
        composeFile: resolve(
          root,
          'apps/backend/docker/compose/docker-compose.test.redis.yml'
        ),
        projectPrefix: 'sanny-fixture-tests-',
        service: 'fixture',
        environment: { SANNY_FIXTURE: 'test-only' },
      },
      {
        removeStaleProjects: async () => {},
        spawnProcess: (command, args, options) => {
          calls.push({ command, args, options });
          const child = new EventEmitter();
          const isUp = args.includes('up');
          child.kill = (signal) => {
            assert.ok(isUp, 'teardown must not be interrupted');
            assert.equal(signal, scenario.signal);
          };
          queueMicrotask(() => {
            if (isUp && scenario.error)
              child.emit('error', new Error('fixture ENOENT'));
            if (scenario.signal) process.emit(scenario.signal, scenario.signal);
            child.emit(
              'close',
              isUp ? scenario.up : scenario.down,
              isUp ? scenario.signal : null
            );
          });
          return child;
        },
      }
    );
    assert.equal(result, scenario.expected);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].args.includes('--build'));
    assert.deepEqual(calls[0].args.slice(-2), ['--exit-code-from', 'fixture']);
    assert.ok(calls[1].args.includes('down'));
    assert.ok(calls[1].args.includes('--volumes'));
    for (const call of calls) {
      assert.equal(call.command, 'docker');
      assert.equal(
        call.options.cwd.href,
        new URL('../../../../apps/backend/', import.meta.url).href
      );
      assert.equal(call.options.env.COMPOSE_DISABLE_ENV_FILE, 'true');
      assert.equal(call.options.env.SANNY_FIXTURE, 'test-only');
    }
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
      listeners
    );
  }
});

test('backend integration runners live with their owning suites', () => {
  const scripts = json('apps/backend/package.json').scripts;
  assert.equal(
    scripts['test:integration:monitoring'],
    'node src/tests/grafana/run-integration.mjs'
  );
  assert.equal(scripts['test:integration:redis'], undefined);
  assert.equal(
    scripts['test:integration'].split(
      'node src/tests/redis/run-integration.mjs'
    ).length - 1,
    1
  );
  assert.equal(
    scripts['test:unit'],
    'tsx --test "src/tests/sanny64/**/*.test.ts"'
  );
  const directory = resolve(root, 'apps/backend/src/tests');
  assert.equal(existsSync(resolve(directory, 'scripts')), false);
  const domains = [
    'auth',
    'auth0',
    'observability',
    'security',
    'sessions',
    'users',
  ];
  assert.deepEqual(readdirSync(resolve(directory, 'sanny64')).sort(), domains);
  for (const domain of domains) {
    assert.ok(
      readdirSync(resolve(directory, 'sanny64', domain)).some((file) =>
        file.endsWith('.test.ts')
      ),
      domain
    );
  }
});

test('Redis test TLS is generated independently of local certificates', async () => {
  const directory = await createRedisTestCertificates();
  try {
    const authority = new X509Certificate(
      await readFile(resolve(directory, 'ca.crt'))
    );
    const certificate = new X509Certificate(
      await readFile(resolve(directory, 'redis.crt'))
    );
    assert.equal(authority.ca, true);
    assert.ok(certificate.verify(authority.publicKey));
    assert.equal(certificate.checkHost('redis'), 'redis');
    assert.equal(certificate.checkHost('production.example.test'), undefined);
    assert.ok(Date.parse(certificate.validTo) - Date.now() < 86_400_000);
    const compose = read(
      'apps/backend/docker/compose/docker-compose.test.redis.yml'
    );
    assert.doesNotMatch(compose, /\.\.\/redis\/certs/);
    assert.match(compose, /SANNY_REDIS_TEST_CERTS/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('backend 5xx logs retain only the route and safe error class', () => {
  const server = read('apps/backend/src/server.ts');
  assert.match(
    server,
    /errorType:\s*error instanceof Error \? error\.name : typeof error/
  );
  assert.match(server, /route:\s*request\.routeOptions\.url/);
  assert.doesNotMatch(server, /request\.log\.error\(\{[^}]*error\.message/);
});

test('Auth0 token requests use the documented OAuth endpoint', () => {
  for (const file of [
    'apps/backend/src/routes/auth.route.ts',
    'apps/backend/src/utils/auth0-management.ts',
    'apps/backend/src/utils/session.ts',
    'apps/backend/auth0/post-login/linkAccounts.js',
    'apps/backend/auth0/post-login/roleClaims.js',
    'apps/backend/auth0/post-login/verifyEmail.js',
    'apps/backend/auth0/post-user-registration/assignDefaultUserRole.js',
  ]) {
    assert.match(read(file), /\/oauth\/token/);
    assert.doesNotMatch(read(file), /\/oapps\/frontend\/auth\/token/);
  }
});

test('backend names are explicit without coupling isolated test projects', () => {
  const development = parse(
    read('apps/backend/docker/compose/docker-compose.dev.yml')
  );
  const monitoringTests = parse(
    read('apps/backend/docker/compose/docker-compose.test.monitoring.yml')
  );
  const production = parse(
    read('apps/backend/docker/compose/docker-compose.prod.yml')
  );
  const local = development.services['sanny64-backend'];
  assert.equal(local.image, 'sanny64/backend:latest');
  assert.equal(local.container_name, 'sanny64-backend');
  assert.equal(local.pull_policy, 'build');
  assert.deepEqual(local.env_file, ['.env']);
  assert.ok(
    development.services.nginx.volumes.includes(
      './nginx/secret/certs:/etc/nginx/certs:ro'
    )
  );
  assert.ok(
    development.services.redis.volumes.includes(
      './redis/secret/certs:/etc/redis/certs:ro'
    )
  );
  assert.ok(
    development.services.alloy.volumes.includes(
      './src/monitoring/config/config.alloy:/etc/alloy/config.alloy:ro'
    )
  );
  assert.ok(
    monitoringTests.services['notification-sink'].volumes.includes(
      '../../src/tests/grafana/notification-sink.mjs:/app/notification-sink.mjs:ro'
    )
  );
  for (const fixture of [
    'grafana-datasources.yml',
    'grafana-contactpoints.yml',
    'grafana-policies.yml',
  ]) {
    assert.ok(
      monitoringTests.services.grafana.volumes.some((volume) =>
        volume.includes(`../../../../apps/backend/src/tests/grafana/${fixture}`)
      ),
      fixture
    );
  }
  assert.ok(
    monitoringTests.services['monitoring-tests'].command.includes(
      'src/tests/grafana/integration/grafana-rules.integration.test.ts'
    )
  );
  const redisTests = parse(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml')
  );
  assert.ok(
    redisTests.services['sanny64-backend'].command.includes(
      'src/tests/sanny64/sessions/session-rotation.test.ts'
    )
  );
  assert.equal(
    production.services['sanny64-backend'].container_name,
    'sanny64-backend'
  );
  for (const name of ['redis', 'monitoring']) {
    const isolated = parse(
      read(`apps/backend/docker/compose/docker-compose.test.${name}.yml`)
    );
    for (const service of Object.values(isolated.services)) {
      assert.equal(service.container_name, undefined);
      assert.notEqual(service.image, local.image);
    }
  }
});

test('Compose restart scripts distinguish full-stack and backend-only recreation', () => {
  const rootScripts = json('package.json').scripts;
  const backendScripts = json('apps/backend/package.json').scripts;
  const composeCommand =
    'docker compose --project-directory . --env-file .env -f docker/compose/docker-compose.dev.yml';

  assert.equal(
    rootScripts['initialize:stack'],
    'npm run initialize:stack -w backend'
  );
  assert.equal(rootScripts['start:stack'], 'npm run start -w backend');
  assert.equal(rootScripts['stop:stack'], 'npm run stop -w backend');
  assert.equal(
    backendScripts['initialize:stack'],
    `${composeCommand} up -d --build --force-recreate --remove-orphans`
  );
  assert.equal(backendScripts.start, `${composeCommand} start`);
  assert.equal(backendScripts.stop, `${composeCommand} stop`);
  assert.equal(
    backendScripts.restart,
    `${composeCommand} up -d --build --force-recreate sanny64-backend`
  );
});

test('production inherits common services without a local backend build', () => {
  const development = parse(
    read('apps/backend/docker/compose/docker-compose.dev.yml')
  );
  const production = parse(
    read('apps/backend/docker/compose/docker-compose.prod.yml')
  );
  assert.equal(development.services['sanny64-backend'].build.context, '../..');
  assert.equal(
    development.services['sanny64-backend'].build.dockerfile,
    'apps/backend/docker/Dockerfile'
  );
  assert.equal(production.services['sanny64-backend'].build, undefined);
  assert.match(
    production.services['sanny64-backend'].image,
    /^sanny64\/backend:/
  );
  assert.match(
    production.services['sanny64-backend'].image,
    /BACKEND_IMAGE_TAG/
  );
  assert.equal(
    production.services['sanny64-backend'].environment.PROD_TRUST_PROXY,
    '172.28.0.2'
  );
  for (const [name, service] of Object.entries(production.services)) {
    if (name === 'sanny64-backend') continue;
    assert.equal(service.extends.file, 'docker/compose/docker-compose.dev.yml');
    assert.ok(development.services[service.extends.service]);
  }
  assert.equal(development.services.promtail, undefined);
  assert.ok(development.services.alloy);
  assert.ok(development.volumes['alloy-data'] === null);
  assert.match(
    read('apps/backend/src/monitoring/config/config.alloy'),
    /legacy_positions_file/
  );
});

test('backend runtime loader is retained by production-only installs', () => {
  const manifest = json('apps/backend/package.json');
  const dockerfile = read('apps/backend/docker/Dockerfile');
  assert.ok(manifest.dependencies.tsx);
  assert.equal(manifest.devDependencies.tsx, undefined);
  assert.match(dockerfile, /npm ci --workspace=backend/);
  assert.doesNotMatch(dockerfile, /RUN npm install/);
  assert.match(
    dockerfile,
    /FROM builder AS production\s+RUN rm -rf \/app\/backend\/src\/tests/
  );
  assert.match(dockerfile, /RUN mkdir -p \/app\/logs\s+WORKDIR \/app\/backend/);
  assert.match(
    dockerfile,
    /COPY --from=production .*\/app\/backend \/app\/backend/
  );
  for (const path of [
    'apps/backend/docker/compose/docker-compose.test.monitoring.yml',
    'apps/backend/docker/compose/docker-compose.test.redis.yml',
  ]) {
    assert.equal(
      parse(read(path)).services['monitoring-tests']?.build.target ??
        parse(read(path)).services['sanny64-backend']?.build.target,
      'builder',
      path
    );
  }
});

test('monitoring test rules preserve production queries and thresholds', () => {
  const documents = [
    '429-spikes',
    'auth-abuse',
    'callback-flood',
    'backend-operational',
  ].map((name) =>
    parse(read(`apps/backend/src/monitoring/alerting/rules/${name}.yml`))
  );
  const original = structuredClone(documents);
  const generated = createTestRules(documents);
  assert.deepEqual(documents, original);
  assert.equal(generated.groups.length, 3);
  for (const group of generated.groups) {
    assert.equal(group.interval, '10s');
    const production = documents
      .flatMap((document) => document.groups)
      .find((candidate) => candidate.name === group.name);
    assert.ok(production);
    for (const rule of group.rules) {
      const source = production.rules.find(
        (candidate) => candidate.uid === rule.uid
      );
      assert.deepEqual(rule, { ...source, for: '0s' });
    }
  }
  const compose = parse(
    read('apps/backend/docker/compose/docker-compose.test.monitoring.yml')
  );
  assert.ok(
    compose.services.grafana.volumes.some((volume) =>
      volume.includes('SANNY_MONITORING_TEST_RULES')
    )
  );
});
