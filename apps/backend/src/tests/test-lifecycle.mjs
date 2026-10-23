import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const BACKEND_START_TIMEOUT_MS = 180_000;
const BACKEND_DIRECTORY = fileURLToPath(new URL('../../', import.meta.url));
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

export async function ensureBackendRunning({
  getActiveChild,
  setActiveChild,
  isCancelled,
  onBackendStart,
  runScript,
}) {
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
  const startExitCode = await runScript('start:stack');
  onBackendStart(previouslyRunningServices);
  if (isCancelled()) return 1;
  if (startExitCode !== 0) {
    console.error(
      'Unable to start the backend; create the stack with `npm run initialize:stack`.'
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

export async function stopBackendServicesStartedByTest(
  previouslyRunningServices,
  getActiveChild,
  setActiveChild
) {
  const runningServices = await runningBackendServices(
    getActiveChild,
    setActiveChild
  );
  if (!runningServices) {
    console.error('Unable to inspect backend services for test cleanup.');
    return 1;
  }

  const startedServices = newlyStartedServices(
    previouslyRunningServices,
    runningServices
  );
  if (startedServices.length === 0) return 0;

  console.log(
    `Stopping backend services started by this test run: ${startedServices.join(', ')}.`
  );
  const stopResult = await runDockerCompose(
    ['stop', ...startedServices],
    getActiveChild,
    setActiveChild
  );
  if (stopResult.code !== 0) {
    console.error('Unable to stop backend services started by this test run.');
  }
  return stopResult.code;
}
