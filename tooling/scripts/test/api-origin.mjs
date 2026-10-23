import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const API_URL_KEYS = {
  development: 'VITE_DEV_API_URL',
  production: 'VITE_PROD_API_URL',
};
const FRONTEND_ROOTS = ['auth', 'sanny'].map((app) =>
  fileURLToPath(new URL(`../../../apps/frontend/${app}`, import.meta.url))
);

export function resolveApiOrigin(environment, target) {
  const key = API_URL_KEYS[target];
  if (!Object.hasOwn(API_URL_KEYS, target)) {
    throw new Error('Select development or production as the API environment.');
  }
  const value = environment.VITE_API_URL?.trim() || environment[key]?.trim();
  if (!value) {
    throw new Error(
      `Set VITE_API_URL or ${key} in both frontend environment configurations.`
    );
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an HTTPS API origin.`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${key} must be an HTTPS API origin without a path or credentials.`
    );
  }
  return url.origin;
}

export function resolveSharedApiOrigin(frontendEnvironments, target) {
  if (frontendEnvironments.length !== FRONTEND_ROOTS.length) {
    throw new Error('Provide the auth and sanny frontend configurations.');
  }
  const origins = frontendEnvironments.map((environment) =>
    resolveApiOrigin(environment, target)
  );
  if (new Set(origins).size !== 1) {
    throw new Error(
      'The selected API origins differ between the auth and sanny frontend configurations.'
    );
  }
  return origins[0];
}

export function loadSelectedApiOrigin(target) {
  if (!Object.hasOwn(API_URL_KEYS, target)) {
    throw new Error('Select development or production as the API environment.');
  }
  const environments = FRONTEND_ROOTS.map((root) =>
    loadEnv(target, root, 'VITE_')
  );
  return resolveSharedApiOrigin(environments, target);
}
