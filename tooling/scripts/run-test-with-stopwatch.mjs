import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve(
  '@playwright/test/cli'
);

export const PLAYWRIGHT_GATE_ARGS = {
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
};

export const LIVE_GATE_SCRIPTS = ['test:e2e:real'];
export const MONITORING_GATE_SCRIPTS = ['test:e2e:429'];

export const E2E_GATE_SCRIPTS = [
  'test:e2e:mocked',
  ...LIVE_GATE_SCRIPTS,
  ...MONITORING_GATE_SCRIPTS,
  'test:e2e:docs',
];

export const FULL_GATE_SCRIPTS = [
  'test:ci',
  ...LIVE_GATE_SCRIPTS,
  ...MONITORING_GATE_SCRIPTS,
];

export const BACKEND_DEPENDENT_SCRIPTS = new Set([
  'test:e2e:real',
  ...MONITORING_GATE_SCRIPTS,
]);

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BACKEND_START_TIMEOUT_MS = 180_000;
const BACKEND_DIRECTORY = fileURLToPath(
  new URL('../../apps/backend/', import.meta.url)
);
const BACKEND_COMPOSE_ARGS = [
  'compose',
  '--project-directory',
  '.',
  '--env-file',
  '.env',
  '-f',
  'docker/compose/docker-compose.dev.yml',
];

export function newlyStartedServices(runningBefore, runningAfter) {
  const previouslyRunning = new Set(runningBefore);
  return runningAfter.filter((service) => !previouslyRunning.has(service));
}

export function backendHealthUrl(env = process.env) {
  return new URL(
    '/healthcheck',
    env.SANNY_E2E_API_URL ?? env.VITE_API_URL ?? 'https://localhost:8443'
  );
}

function isBackendHealthy(url) {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        // The local development stack uses a self-signed certificate.
        rejectUnauthorized: !LOOPBACK_HOSTS.has(url.hostname),
        timeout: 5_000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode === 200);
      }
    );
    request.once('timeout', () => request.destroy());
    request.once('error', () => resolve(false));
  });
}

function runDockerCompose(args, getActiveChild, setActiveChild) {
  return new Promise((resolve) => {
    const child = spawn('docker', [...BACKEND_COMPOSE_ARGS, ...args], {
      cwd: BACKEND_DIRECTORY,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    setActiveChild(child);

    child.once('error', (error) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      console.error(`Unable to run Docker Compose: ${error.message}`);
      resolve({ code: 1, output });
    });
    child.once('close', (code, signal) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      resolve({ code: code ?? (signal ? 1 : 0), output });
    });
  });
}

async function runningBackendServices(getActiveChild, setActiveChild) {
  const result = await runDockerCompose(
    ['ps', '--services', '--status', 'running'],
    getActiveChild,
    setActiveChild
  );
  return result.code === 0
    ? result.output
        .split(/\r?\n/)
        .map((service) => service.trim())
        .filter(Boolean)
    : undefined;
}

export async function waitForBackendReady({
  isHealthy,
  isCancelled,
  timeoutMs = BACKEND_START_TIMEOUT_MS,
  pollIntervalMs = 2_000,
  now = () => performance.now(),
  pause = delay,
}) {
  const deadline = now() + timeoutMs;
  while (now() < deadline && !isCancelled()) {
    if (await isHealthy()) return true;
    await pause(pollIntervalMs);
  }
  return false;
}

async function ensureBackendRunning(
  npmCli,
  getActiveChild,
  setActiveChild,
  isCancelled,
  onBackendStart
) {
  const url = backendHealthUrl();
  if (await isBackendHealthy(url)) {
    console.log(`Backend is already running at ${url.origin}.`);
    return 0;
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    console.error(`Backend at ${url.origin} is unreachable.`);
    return 1;
  }

  const previouslyRunningServices = await runningBackendServices(
    getActiveChild,
    setActiveChild
  );
  if (!previouslyRunningServices) {
    console.error('Unable to inspect the local backend Compose services.');
    return 1;
  }
  if (isCancelled()) return 1;

  console.log(`Backend at ${url.origin} is not running; starting it.`);
  const startExitCode = await runScript(
    npmCli,
    'start:stack',
    getActiveChild,
    setActiveChild
  );
  onBackendStart(previouslyRunningServices);
  if (isCancelled()) return 1;
  if (startExitCode !== 0) {
    console.error(
      'Unable to start the backend; create the stack with `npm run restart:stack`.'
    );
    return startExitCode;
  }
  const ready = await waitForBackendReady({
    isHealthy: () => isBackendHealthy(url),
    isCancelled,
  });
  if (ready) {
    console.log(`Backend is ready at ${url.origin}.`);
    return 0;
  }
  if (isCancelled()) return 1;
  console.error(`Backend did not become healthy at ${url.origin}.`);
  return 1;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    '0'
  );
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours ? `${hours}:` : ''}${minutes}:${seconds}`;
}

async function runScript(npmCli, scriptName, getActiveChild, setActiveChild) {
  return new Promise((resolve) => {
    const playwrightArgs = PLAYWRIGHT_GATE_ARGS[scriptName];
    const commandArgs = playwrightArgs
      ? [PLAYWRIGHT_CLI, ...playwrightArgs]
      : [npmCli, 'run', scriptName];
    const child = spawn(process.execPath, commandArgs, {
      stdio: 'inherit',
    });
    setActiveChild(child);

    child.once('error', (error) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      console.error(`Unable to start ${scriptName}: ${error.message}`);
      resolve(1);
    });
    child.once('close', (code, signal) => {
      if (getActiveChild() === child) setActiveChild(undefined);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('Cannot locate the npm CLI; run this script through npm.');
    process.exitCode = 1;
    return;
  }

  const startedAt = performance.now();
  const timestamp = () => new Date().toISOString();
  const liveOnly = process.argv.includes('--live-only');
  const e2eOnly = process.argv.includes('--e2e-only');
  const monitoringOnly = process.argv.includes('--monitoring-only');
  const scriptsToRun = liveOnly
    ? LIVE_GATE_SCRIPTS
    : e2eOnly
      ? E2E_GATE_SCRIPTS
      : monitoringOnly
        ? MONITORING_GATE_SCRIPTS
        : FULL_GATE_SCRIPTS;
  const gateName = liveOnly
    ? 'live E2E suite'
    : e2eOnly
      ? 'browser test suites'
      : monitoringOnly
        ? 'live monitoring suite'
        : 'full test suite';
  let activeChild;
  let receivedSignal;
  let backendChecked = false;
  let previouslyRunningBackendServices;
  const getActiveChild = () => activeChild;
  const setActiveChild = (child) => {
    activeChild = child;
  };
  const forwardSignal = (signal) => {
    receivedSignal ??= signal;
    // Ctrl+C already reaches every process in the console; killing npm here
    // would orphan its children (on Windows) before Docker test stacks are removed.
    if (signal !== 'SIGINT') activeChild?.kill(signal);
  };
  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  console.log(`[${timestamp()}] Starting the ${gateName}.`);
  let exitCode = 0;
  try {
    for (const scriptName of scriptsToRun) {
      if (BACKEND_DEPENDENT_SCRIPTS.has(scriptName) && !backendChecked) {
        backendChecked = true;
        exitCode = await ensureBackendRunning(
          npmCli,
          getActiveChild,
          setActiveChild,
          () => Boolean(receivedSignal),
          (services) => {
            previouslyRunningBackendServices = services;
          }
        );
        if (exitCode !== 0 || receivedSignal) break;
      }
      exitCode = await runScript(
        npmCli,
        scriptName,
        getActiveChild,
        setActiveChild
      );
      if (exitCode !== 0 || receivedSignal) break;
    }
  } finally {
    if (previouslyRunningBackendServices) {
      const runningServices = await runningBackendServices(
        getActiveChild,
        setActiveChild
      );
      if (!runningServices) {
        console.error('Unable to inspect backend services for test cleanup.');
        if (exitCode === 0) exitCode = 1;
      } else {
        const startedServices = newlyStartedServices(
          previouslyRunningBackendServices,
          runningServices
        );
        if (startedServices.length > 0) {
          console.log(
            `Stopping backend services started by this test run: ${startedServices.join(', ')}.`
          );
          const stopResult = await runDockerCompose(
            ['stop', ...startedServices],
            getActiveChild,
            setActiveChild
          );
          if (stopResult.code !== 0) {
            console.error(
              'Unable to stop backend services started by this test run.'
            );
            if (exitCode === 0) exitCode = stopResult.code;
          }
        }
      }
    }
    process.off('SIGINT', forwardSignal);
    process.off('SIGTERM', forwardSignal);
  }

  const elapsed = formatDuration(performance.now() - startedAt);
  const result = receivedSignal
    ? `signal ${receivedSignal}`
    : `exit code ${exitCode}`;
  console.log(
    `[${timestamp()}] The ${gateName} finished with ${result} after ${elapsed}.`
  );
  process.exitCode = receivedSignal
    ? receivedSignal === 'SIGINT'
      ? 130
      : 143
    : exitCode;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  await main();
}
