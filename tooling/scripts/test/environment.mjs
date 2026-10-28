import process from 'node:process';
import {
  DISCORD_CREDENTIALS,
  readBackendTestEnvironment,
} from '../../../shared/tests/e2e/backend-environment.ts';

export function safeTestEnvironment(environment = process.env) {
  return {
    ...environment,
    NODE_ENV: 'development',
    RUN_CRITICAL_TESTS: 'false',
    RUN_429_SPIKE_E2E: 'false',
    RUN_DISCORD_INTEGRATION: 'false',
    RUN_EMAIL_INTEGRATION: 'false',
  };
}

// The Discord checks post to the development webhook and the local development
// stack only, so they never run for the production target.
export function loadDiscordTestEnvironment() {
  return readBackendTestEnvironment(DISCORD_CREDENTIALS);
}

export function createFullTestEnvironment(
  environment,
  apiOrigin,
  target,
  discordEnvironment = {}
) {
  if (target !== 'development' && target !== 'production') {
    throw new Error('Select development or production as the API environment.');
  }
  const runDiscord = target === 'development';
  const discord = {};
  if (
    runDiscord &&
    !environment.DISCORD_WEBHOOK?.trim() &&
    discordEnvironment.DISCORD_WEBHOOK
  ) {
    discord.DISCORD_WEBHOOK = discordEnvironment.DISCORD_WEBHOOK;
  }
  return {
    ...safeTestEnvironment(environment),
    ...discord,
    VITE_API_URL: apiOrigin,
    E2E_API_URL: apiOrigin,
    RUN_CRITICAL_TESTS: 'true',
    RUN_429_SPIKE_E2E: 'true',
    RUN_DISCORD_INTEGRATION: runDiscord ? 'true' : 'false',
    RUN_EMAIL_INTEGRATION: runDiscord ? 'true' : 'false',
  };
}
