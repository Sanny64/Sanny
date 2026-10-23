import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { safeTestEnvironment } from './environment.mjs';
import { startStopwatch } from './stopwatch.mjs';

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(
      'Usage: npm run test:ci\nRuns test:core without prompts, with CI=true and all live critical opt-ins disabled.'
    );
    return;
  }
  if (args.length > 0) {
    console.error('Unknown CI test arguments. Use npm run test:ci -- --help.');
    process.exitCode = 1;
    return;
  }
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('Cannot locate the npm CLI; run this script through npm.');
    process.exitCode = 1;
    return;
  }
  const finishStopwatch = startStopwatch('CI test suite');
  try {
    execFileSync(process.execPath, [npmCli, 'run', 'test:core'], {
      cwd: new URL('../../../', import.meta.url),
      stdio: 'inherit',
      env: { ...safeTestEnvironment(), CI: 'true' },
    });
  } catch (error) {
    process.exitCode = error.status ?? 1;
  } finally {
    finishStopwatch(`exit code ${process.exitCode ?? 0}`);
  }
}

if (import.meta.main) {
  main();
}
