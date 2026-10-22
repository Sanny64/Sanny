import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

export function assertRuntime(nodeVersion, npmVersion) {
  if (Number(nodeVersion.replace(/^v/, '').split('.')[0]) !== 24) {
    throw new Error(
      `Use Node.js 24 (see /tooling/config/.nvmrc); received ${nodeVersion}.`
    );
  }
  const expectedNpm = manifest.packageManager.slice('npm@'.length);
  if (npmVersion !== expectedNpm) {
    throw new Error(
      `Use npm ${expectedNpm}; received ${npmVersion ?? 'no npm runtime'}.`
    );
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(pathToFileURL(process.argv[1]))
) {
  assertRuntime(
    process.version,
    process.env.npm_config_user_agent?.match(/^npm\/([^ ]+)/)?.[1]
  );
}
