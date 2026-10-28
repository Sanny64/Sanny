import { confirm, intro, isCancel, log, outro, select } from '@clack/prompts';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  createFullTestEnvironment,
  loadDiscordTestEnvironment,
  safeTestEnvironment,
} from './environment.mjs';
import { loadSelectedApiOrigin } from './api-origin.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(
      'Usage: npm test\nInteractive: select safe or full; full asks for development/production.\nSafe automation: npm run test:ci\nFocused: npm run test:unit | test:contracts | test:integration | test:browser\nFull mode requires confirmation for live Auth0, 429 traffic, and development-only Discord checks.'
    );
    return;
  }
  if (args.length > 0) {
    console.error('Unknown test menu arguments. Use npm test -- --help.');
    process.exitCode = 1;
    return;
  }
  if (process.env.CI || !process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'The test menu requires an interactive terminal. Use npm run test:ci for safe non-interactive tests.'
    );
    process.exitCode = 1;
    return;
  }
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('Cannot locate the npm CLI; run this script through npm.');
    process.exitCode = 1;
    return;
  }
  await runTestMenu(npmCli);
}

export async function runTestMenu(
  npmCli,
  {
    selectOption = select,
    confirmRun = confirm,
    resolveOrigin = loadSelectedApiOrigin,
    loadDiscordEnvironment = loadDiscordTestEnvironment,
    execute = execFileSync,
  } = {}
) {
  intro('Sanny test suite');
  const scope = await selectOption({
    message: 'Select the test scope',
    options: [
      {
        value: 'safe',
        label: 'Safe',
        hint: 'CI suite; mocked, no live services',
      },
      {
        value: 'full',
        label: 'Full',
        hint: 'Live Auth0, 429 alerts, and Discord checks (development only)',
      },
    ],
  });
  if (isCancel(scope)) {
    outro('No tests were started.');
    return;
  }

  let target;
  let childEnvironment = safeTestEnvironment(process.env);
  if (scope === 'full') {
    target = await selectOption({
      message: 'Select the API environment',
      options: [
        { value: 'development', label: 'Development' },
        { value: 'production', label: 'Production' },
      ],
    });
    if (isCancel(target)) {
      outro('No tests were started.');
      return;
    }
    try {
      childEnvironment = createFullTestEnvironment(
        process.env,
        resolveOrigin(target),
        target,
        target === 'development' ? loadDiscordEnvironment() : {}
      );
    } catch (error) {
      log.error(
        error instanceof Error ? error.message : 'Invalid test configuration.'
      );
      process.exitCode = 1;
      return;
    }
    log.info(`API target: ${childEnvironment.VITE_API_URL}`);
    const warning =
      target === 'production'
        ? 'PRODUCTION: full tests use live credentials and generate rate-limit traffic that may trigger production alerts. Discord checks are skipped. Continue?'
        : 'Full tests use live Auth0 credentials, send Discord test messages to the development webhook, and generate rate-limit traffic that may trigger alerts. Continue?';
    const approved = await confirmRun({
      message: warning,
      initialValue: false,
    });
    if (isCancel(approved) || !approved) {
      outro('Full tests were not started.');
      return;
    }
  }

  const commandArgs =
    scope === 'full'
      ? [fileURLToPath(new URL('./run-suites.mjs', import.meta.url))]
      : [npmCli, 'run', 'test:ci'];
  try {
    execute(process.execPath, commandArgs, {
      cwd: new URL('../../../', import.meta.url),
      stdio: 'inherit',
      env: childEnvironment,
    });
    outro('Test run completed.');
  } catch (error) {
    process.exitCode = error.status ?? 1;
    outro('Test run failed.');
  }
}

if (import.meta.main) {
  await main();
}
