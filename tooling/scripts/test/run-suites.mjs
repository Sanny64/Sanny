import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { startStopwatch } from './stopwatch.mjs';
import {
  ensureBackendRunning,
  stopBackendServicesStartedByTest,
} from '../../../apps/backend/src/tests/test-lifecycle.mjs';
import {
  BACKEND_DEPENDENT_SCRIPTS,
  PLAYWRIGHT_GATE_ARGS,
  selectTestSuite,
} from './suites.mjs';

const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve(
  '@playwright/test/cli'
);

async function runScript(npmCli, scriptName, getActiveChild, setActiveChild) {
  return new Promise((resolve) => {
    const playwrightArgs = PLAYWRIGHT_GATE_ARGS[scriptName];
    const commandArgs = playwrightArgs
      ? [PLAYWRIGHT_CLI, ...playwrightArgs]
      : [npmCli, 'run', scriptName];
    const child = spawn(process.execPath, commandArgs, {
      cwd: new URL('../../../', import.meta.url),
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

export async function main() {
  if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
    console.log(
      'Usage: node tooling/scripts/test/run-suites.mjs [--live-only | --e2e-only | --monitoring-only]\nDefault: core, live Auth0, then opted-in monitoring. Use npm run test:ci for safe tests.'
    );
    return;
  }
  let suite;
  try {
    suite = selectTestSuite(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const npmCli =
    process.env.npm_execpath ??
    [
      join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
      join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ].find((candidate) => existsSync(candidate));
  if (!npmCli) {
    console.error('Cannot locate the npm CLI next to the Node.js runtime.');
    process.exitCode = 1;
    return;
  }

  const { scripts: scriptsToRun, name: gateName } = suite;
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

  const finishStopwatch = startStopwatch(gateName);
  let exitCode = 0;
  try {
    for (const scriptName of scriptsToRun) {
      if (BACKEND_DEPENDENT_SCRIPTS.has(scriptName) && !backendChecked) {
        backendChecked = true;
        exitCode = await ensureBackendRunning({
          getActiveChild,
          setActiveChild,
          isCancelled: () => Boolean(receivedSignal),
          onBackendStart: (services) => {
            previouslyRunningBackendServices = services;
          },
          runScript: (scriptName) =>
            runScript(npmCli, scriptName, getActiveChild, setActiveChild),
        });
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
      const cleanupExitCode = await stopBackendServicesStartedByTest(
        previouslyRunningBackendServices,
        getActiveChild,
        setActiveChild
      );
      if (exitCode === 0) exitCode = cleanupExitCode;
    }
    process.off('SIGINT', forwardSignal);
    process.off('SIGTERM', forwardSignal);
  }

  const result = receivedSignal
    ? `signal ${receivedSignal}`
    : `exit code ${exitCode}`;
  finishStopwatch(result);
  process.exitCode = receivedSignal
    ? receivedSignal === 'SIGINT'
      ? 130
      : 143
    : exitCode;
}

if (import.meta.main) {
  await main();
}
