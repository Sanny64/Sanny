import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BACKEND_ENV_FILE = fileURLToPath(
  new URL('../../../apps/backend/.env', import.meta.url)
);

export const LIVE_AUTH_CREDENTIALS = [
  'TESTUSER_EMAIL',
  'TESTUSER_PASSWORD',
] as const;
export const MONITORING_CREDENTIALS = [
  'NGINX_BASIC_AUTH_USER',
  'NGINX_BASIC_AUTH_PASSWORD',
  'GRAFANA_ADMIN_USER',
  'GRAFANA_ADMIN_PASSWORD',
] as const;
export const DISCORD_CREDENTIALS = ['DISCORD_WEBHOOK'] as const;

// Tests only ever use the development webhook; PROD_DISCORD_WEBHOOK is never read.
const SOURCE_KEYS: Readonly<Record<string, string>> = {
  DISCORD_WEBHOOK: 'DEV_DISCORD_WEBHOOK',
};

export function readBackendTestEnvironment(
  keys: readonly string[],
  file: string = BACKEND_ENV_FILE
): Record<string, string> {
  if (!existsSync(file)) return {};
  const parsed = parse(readFileSync(file));
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = parsed[SOURCE_KEYS[key] ?? key];
    if (value?.trim()) values[key] = value;
  }
  return values;
}

export function applyBackendTestEnvironment(
  keys: readonly string[],
  environment: Record<string, string | undefined> = process.env,
  file: string = BACKEND_ENV_FILE
): void {
  for (const [key, value] of Object.entries(
    readBackendTestEnvironment(keys, file)
  )) {
    if (!environment[key]?.trim()) environment[key] = value;
  }
}
