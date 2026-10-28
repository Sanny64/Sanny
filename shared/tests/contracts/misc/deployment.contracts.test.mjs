import assert from 'node:assert/strict';
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse } from 'yaml';
import { deploymentTargets } from '../../../../tooling/scripts/release/select-targets.mjs';
import { read, json } from '../test.helper.mjs';

test('release planning preserves branch and target boundaries', () => {
  assert.equal(
    deploymentTargets(['apps/backend/src/server.ts'], 'main').backend,
    true
  );
  assert.equal(
    deploymentTargets(['apps/backend/src/server.ts'], 'main').auth,
    false
  );
  assert.equal(
    deploymentTargets(['apps/frontend/auth/src/App.tsx'], 'main').auth,
    true
  );
  assert.equal(
    deploymentTargets(['apps/frontend/auth/src/App.tsx'], 'main').backend,
    false
  );
  for (const path of [
    'apps/frontend/frontend-env.d.ts',
    'tooling/config/.nvmrc',
    'shared/tests/contracts/misc/deployment.contracts.test.mjs',
    'shared/tests/e2e/playwright.mocked.config.ts',
    'apps/frontend/tsconfig.frontend.json',
    'tsconfig.json',
  ]) {
    const targets = deploymentTargets([path], 'main');
    for (const name of ['auth', 'sanny', 'docs', 'backend'])
      assert.equal(targets[name], true);
  }
  for (const path of [
    'apps/frontend/assets.d.ts',
    'apps/frontend/tests/frontend-feedback.test.ts',
    'apps/frontend/tests/account-linking-routes.test.ts',
    'apps/frontend/vite.config.ts',
    'apps/frontend/vitest.config.ts',
  ]) {
    const targets = deploymentTargets([path], 'main');
    assert.equal(targets.auth, true, path);
    assert.equal(targets.sanny, true, path);
    assert.equal(targets.docs, false, path);
    assert.equal(targets.backend, false, path);
  }
  assert.equal(deploymentTargets([], 'test').testing, true);
  assert.equal(deploymentTargets([], 'test', true, true).deployBackend, false);
  assert.equal(deploymentTargets([], 'dev', true, true).backend, false);
  assert.equal(deploymentTargets([], 'main', false, true).deployBackend, false);
  assert.equal(deploymentTargets([], 'main', true, true).deployBackend, true);
});

test('deployments use authenticated FTPS and the canonical API build input', () => {
  for (const name of ['auth', 'sanny', 'docs', 'to-test']) {
    const path = `.github/workflows/deploy-${name}.yml`;
    const workflow = parse(read(path));
    const steps = Object.values(workflow.jobs).flatMap(
      (job) => job.steps ?? []
    );
    const uploads = steps.filter((step) =>
      step.uses?.startsWith('SamKirkland/FTP-Deploy-Action@')
    );
    assert.ok(uploads.length, path);
    for (const upload of uploads) {
      assert.equal(upload.with.protocol, 'ftps', path);
      assert.equal(upload.with.security, 'strict', path);
    }
    assert.doesNotMatch(read(path), /--insecure/, path);
    if (name === 'docs') continue;
    const build = steps.find((step) => step.env?.VITE_API_URL);
    assert.ok(build, path);
    assert.equal(
      build.env.VITE_API_URL,
      name === 'to-test'
        ? '${{ vars.VITE_DEV_API_URL }}'
        : '${{ vars.VITE_PROD_API_URL }}'
    );
  }
});

test('test deployment staging populates the directories selected for upload', () => {
  const workflow = parse(read('.github/workflows/deploy-to-test.yml'));
  const step = workflow.jobs['lint-and-build'].steps.find(
    (entry) => entry.name === 'Stage testing sites'
  );
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-staging-contract-'));
  try {
    for (const directory of [
      'apps/frontend/sanny/dist',
      'apps/frontend/auth/dist',
      'apps/documentation/build',
    ]) {
      mkdirSync(resolve(fixture, directory), { recursive: true });
      writeFileSync(resolve(fixture, directory, 'index.html'), directory);
    }
    const bash =
      process.platform === 'win32'
        ? resolve(
            process.env.ProgramFiles ?? 'C:/Program Files',
            'Git/bin/bash.exe'
          )
        : 'bash';
    const result = spawnSync(bash, ['-e', '-c', step.run], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_BASIC_AUTH_ENTRY: 'fixture:non-secret-test-hash',
        TEST_BASIC_AUTH_FILE_PATH: '/fixture/private/.htpasswd',
      },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    for (const { site } of workflow.jobs.deploy.strategy.matrix.include) {
      const directory = resolve(fixture, 'testing-site', site);
      assert.ok(existsSync(resolve(directory, 'index.html')), site);
      assert.match(
        readFileSync(resolve(directory, '.htaccess'), 'utf8'),
        /Require valid-user/
      );
    }
    assert.equal(
      readFileSync(resolve(fixture, 'testing-site/sanny/.htpasswd'), 'utf8'),
      'fixture:non-secret-test-hash\n'
    );
    assert.match(
      readFileSync(resolve(fixture, 'testing-site/auth/.htaccess'), 'utf8'),
      /RewriteRule \^ index\.html/
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('only the production alert policy routes critical alerts to email', () => {
  const routes = (file) =>
    parse(read(`apps/backend/src/monitoring/alerting/${file}`)).policies[0];
  const production = routes('policies.yml');
  assert.ok(
    production.routes.some(
      (route) =>
        route.receiver === 'email-alerts' &&
        route.matchers.includes('severity = critical')
    )
  );
  const development = routes('policies.dev.yml');
  assert.equal(development.receiver, 'discord-alerts');
  assert.equal(development.routes, undefined);
  assert.match(
    read('apps/backend/docker/compose/docker-compose.dev.yml'),
    /policies\.dev\.yml:\/etc\/grafana\/provisioning\/alerting\/policies\.yml/
  );
});

test('production Compose resolves environment and TLS paths from the backend project', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-compose-contract-'));
  const project = resolve(fixture, 'apps/backend');
  const directory = resolve(project, 'docker/compose');
  try {
    mkdirSync(directory, { recursive: true });
    for (const name of ['dev', 'prod']) {
      writeFileSync(
        resolve(directory, `docker-compose.${name}.yml`),
        read(`apps/backend/docker/compose/docker-compose.${name}.yml`)
      );
    }
    const inputs = resolve(fixture, 'compose-inputs');
    writeFileSync(
      inputs,
      [
        'BACKEND_IMAGE_TAG=0123456789012345678901234567890123456789',
        'REDIS_PASSWORD=fixture-only',
        'PROD_DISCORD_WEBHOOK=https://example.invalid/fixture-prod',
        'GRAFANA_ADMIN_USER=fixture',
        'GRAFANA_ADMIN_PASSWORD=fixture-only',
        'GRAFANA_DEV_ROOT_URL=https://example.invalid/grafana/',
        'GRAFANA_PROD_ROOT_URL=https://example.invalid/grafana/',
        'SMTP_HOST=example.invalid:587',
        'SMTP_USER=fixture',
        'SMTP_PASSWORD=fixture-only',
        'SMTP_FROM_ADDRESS=fixture@example.invalid',
        '',
      ].join('\n')
    );
    const result = spawnSync(
      'docker',
      [
        'compose',
        '--project-directory',
        project,
        '--env-file',
        inputs,
        '-f',
        resolve(directory, 'docker-compose.prod.yml'),
        'config',
        '--format',
        'json',
        '--no-env-resolution',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKEND_IMAGE_TAG: '0123456789012345678901234567890123456789',
        },
      }
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const backend = JSON.parse(result.stdout).services['sanny64-backend'];
    assert.equal(
      backend.image,
      'sanny64/backend:0123456789012345678901234567890123456789'
    );
    assert.equal(resolve(backend.env_file[0].path), resolve(project, '.env'));
    const authority = backend.volumes.find(
      (volume) => volume.target === '/app/redis-ca.crt'
    );
    assert.equal(
      resolve(authority.source),
      resolve(project, 'redis/secret/certs/ca.crt')
    );
    assert.equal(backend.build, undefined);
    const policies = JSON.parse(result.stdout)
      .services.grafana.volumes.filter(
        (volume) =>
          volume.target === '/etc/grafana/provisioning/alerting/policies.yml'
      )
      .map((volume) => volume.source.replaceAll('\\', '/'));
    assert.equal(policies.length, 1);
    assert.ok(
      policies[0].endsWith('/src/monitoring/alerting/policies.yml'),
      policies[0]
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('backend deployment selects the published commit and its matching checkout', () => {
  const workflow = parse(read('.github/workflows/deploy-backend.yml'));
  const metadata = workflow.jobs['build-and-publish'].steps.find(
    (step) => step.id === 'meta'
  );
  const deploy = workflow.jobs.deploy;
  const release = parse(read('.github/workflows/release.yml'));
  assert.equal(
    release.on.workflow_dispatch.inputs['backend-directory'].type,
    'string'
  );
  assert.equal(
    release.jobs.backend.with['deployment-directory'],
    '${{ inputs.backend-directory }}'
  );
  assert.equal(
    workflow.on.workflow_call.inputs['deployment-directory'].type,
    'string'
  );
  assert.equal(
    deploy.env.BACKEND_DEPLOY_DIRECTORY,
    '${{ inputs.deployment-directory }}'
  );
  assert.ok(
    metadata.with.tags
      .split('\n')
      .includes(`type=raw,value=${deploy.env.BACKEND_IMAGE_TAG}`)
  );
  assert.match(metadata.with.images, /ghcr\.io\/sanny64\/sanny\/backend/);
  const remote = deploy.steps.find(
    (step) => step.name === 'Deploy backend to VPS'
  ).with;
  assert.match(remote.script, /set -eu/);
  assert.match(remote.script, /git rev-parse HEAD/);
  assert.match(remote.script, /cd apps\/backend/);
  assert.match(
    remote.script,
    /--project-directory \. --env-file \.env -f docker\/compose\/docker-compose\.prod\.yml/
  );
  assert.match(remote.script, /--wait --wait-timeout/);
});

test('backend deployment executes only for the approved clean revision', () => {
  const workflow = parse(read('.github/workflows/deploy-backend.yml'));
  const script = workflow.jobs.deploy.steps.find(
    (step) => step.name === 'Deploy backend to VPS'
  ).with.script;
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-deployment-contract-'));
  const bin = resolve(fixture, 'bin');
  const log = resolve(fixture, 'docker-commands');
  try {
    mkdirSync(bin);
    mkdirSync(resolve(fixture, 'apps/backend'), { recursive: true });
    writeFileSync(
      resolve(bin, 'git'),
      [
        '#!/usr/bin/env bash',
        'if [ "$1" = "rev-parse" ]; then',
        '  printf "%s\\n" "$FIXTURE_REVISION"',
        'else',
        '  exit "${FIXTURE_DIRTY:-0}"',
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    writeFileSync(
      resolve(bin, 'docker'),
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$*" >> "$FIXTURE_COMMAND_LOG"',
        'if [ "$1" = "login" ]; then cat > /dev/null; fi',
        'if [[ "$*" == *"config --quiet"* ]]; then exit "${FIXTURE_CONFIG_FAILURE:-0}"; fi',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    const revision = '0123456789012345678901234567890123456789';
    const bash =
      process.platform === 'win32'
        ? resolve(
            process.env.ProgramFiles ?? 'C:/Program Files',
            'Git/bin/bash.exe'
          )
        : 'bash';
    const run = (overrides = {}) =>
      spawnSync(bash, ['-c', `export PATH="$PWD/bin:$PATH"\n${script}`], {
        cwd: fixture,
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKEND_DEPLOY_DIRECTORY: fixture.replaceAll('\\', '/'),
          BACKEND_IMAGE_TAG: revision,
          DOCKERHUB_USERNAME: 'fixture',
          DOCKERHUB_PAT: 'fixture-only',
          FIXTURE_REVISION: revision,
          FIXTURE_COMMAND_LOG: log.replaceAll('\\', '/'),
          FIXTURE_DIRTY: '0',
          FIXTURE_CONFIG_FAILURE: '0',
          ...overrides,
        },
      });
    for (const overrides of [
      { FIXTURE_REVISION: 'different-revision' },
      { FIXTURE_DIRTY: '1' },
      { BACKEND_DEPLOY_DIRECTORY: '' },
    ]) {
      const result = run(overrides);
      assert.equal(result.error, undefined, result.error?.message);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(log), false);
    }
    const invalidConfig = run({ FIXTURE_CONFIG_FAILURE: '1' });
    assert.notEqual(invalidConfig.status, 0);
    assert.doesNotMatch(
      readFileSync(log, 'utf8'),
      /pull sanny64-backend|up -d/
    );
    rmSync(log);
    const success = run();
    assert.equal(success.status, 0, success.stderr);
    const commands = readFileSync(log, 'utf8');
    assert.match(
      commands,
      /config --quiet\n[\s\S]*pull sanny64-backend\n[\s\S]*up -d --no-build --wait --wait-timeout 120 sanny64-backend/
    );
    assert.doesNotMatch(commands, /image prune|down|--volumes/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('every deployment waits for the common secret-free verification gate', () => {
  const verification = parse(read('.github/workflows/verify.yml'));
  assert.ok(Object.hasOwn(verification.on, 'pull_request'));
  assert.ok(Object.hasOwn(verification.on, 'workflow_call'));
  assert.equal(verification.permissions.contents, 'read');
  assert.ok(
    verification.jobs.verify.steps.some(
      (step) => step.run === 'npm run test:ci'
    )
  );
  assert.doesNotMatch(read('.github/workflows/verify.yml'), /secrets\./);
  const release = parse(read('.github/workflows/release.yml'));
  assert.equal(release.jobs.verify.uses, './.github/workflows/verify.yml');
  assert.equal(
    Object.values(release.jobs).filter(
      (job) => job.uses === './.github/workflows/verify.yml'
    ).length,
    1
  );
  for (const name of ['auth', 'sanny', 'docs', 'to-test', 'backend']) {
    const workflow = parse(read(`.github/workflows/deploy-${name}.yml`));
    assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
    assert.equal(workflow.jobs.verify, undefined);
    const caller = Object.values(release.jobs).find(
      (job) => job.uses === `./.github/workflows/deploy-${name}.yml`
    );
    assert.deepEqual(caller.needs, ['plan', 'verify'], name);
    assert.notEqual(caller.secrets, 'inherit');
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

test('production and test deployments build both documentation locales', () => {
  for (const workflowPath of [
    '.github/workflows/deploy-docs.yml',
    '.github/workflows/deploy-to-test.yml',
  ]) {
    const workflow = read(workflowPath);
    assert.match(workflow, /npm run build:docs(?:\r?\n|$)/);
    assert.doesNotMatch(workflow, /npm run build:docs:(?:en|de)/);
  }
  assert.equal(
    json('package.json').scripts['build:docs'],
    'npm run build -w documentation'
  );
  assert.match(
    read('apps/documentation/docusaurus.config.ts'),
    /locales:\s*\[\s*["']en["'],\s*["']de["']\s*\]/
  );
});
