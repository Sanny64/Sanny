import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { removeStaleTestProjects } from './stale-test-projects.mjs';

export async function runComposeIntegration(
  { composeFile, projectPrefix, service, environment = {} },
  { spawnProcess = spawn, removeStaleProjects = removeStaleTestProjects } = {}
) {
  const projectName = `${projectPrefix}${process.pid}`;
  const downArgs = ['down', '--timeout', '0', '--volumes', '--remove-orphans'];
  let activeChild;
  let receivedSignal;
  let cleaningUp = false;

  function runDocker(args, name = projectName) {
    return new Promise((resolve) => {
      const timestamp = () => new Date().toISOString();
      const command = `docker compose -p ${name} ${args.join(' ')}`;
      const startedAt = performance.now();
      console.log(`[${timestamp()}] Starting ${command}`);
      const child = spawnProcess(
        'docker',
        ['compose', '--project-name', name, '--file', composeFile, ...args],
        {
          cwd: new URL('../../', import.meta.url),
          stdio: ['inherit', 'pipe', 'pipe'],
          env: {
            ...process.env,
            COMPOSE_DISABLE_ENV_FILE: 'true',
            ...environment,
          },
        }
      );
      activeChild = child;
      let failed = false;
      for (const [stream, output] of [
        [child.stdout, process.stdout],
        [child.stderr, process.stderr],
      ]) {
        if (!stream) continue;
        createInterface({ input: stream, crlfDelay: Infinity }).on(
          'line',
          (line) => output.write(`[${timestamp()}] ${line}\n`)
        );
      }
      child.on('error', (error) => {
        failed = true;
        console.error(
          `[${timestamp()}] Unable to run Docker Compose: ${error.message}`
        );
      });
      child.once('close', (code, signal) => {
        if (activeChild === child) activeChild = undefined;
        const seconds = ((performance.now() - startedAt) / 1000).toFixed(2);
        console.log(
          `[${timestamp()}] Finished ${command} with ${signal ? `signal ${signal}` : `exit code ${code}`} after ${seconds}s`
        );
        resolve(failed ? 1 : (code ?? 1));
      });
    });
  }

  const handleSignal = (signal) => {
    receivedSignal ??= signal;
    if (!cleaningUp) activeChild?.kill(signal);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  let testExitCode = 1;
  let cleanupExitCode;
  try {
    await removeStaleProjects(projectPrefix, async (name) => {
      if (await runDocker(downArgs, name)) {
        throw new Error(
          `Unable to remove stale Docker Compose project ${name}.`
        );
      }
    });
    if (!receivedSignal) {
      testExitCode = await runDocker([
        'up',
        '--timeout',
        '0',
        '--build',
        '--abort-on-container-exit',
        '--exit-code-from',
        service,
      ]);
    }
  } finally {
    cleaningUp = true;
    try {
      cleanupExitCode = await runDocker(downArgs);
    } finally {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
    }
  }
  return receivedSignal
    ? receivedSignal === 'SIGINT'
      ? 130
      : 143
    : testExitCode || cleanupExitCode;
}
