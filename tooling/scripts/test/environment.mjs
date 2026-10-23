import process from 'node:process';

export function safeTestEnvironment(environment = process.env) {
  return {
    ...environment,
    NODE_ENV: 'development',
    RUN_CRITICAL_TESTS: 'false',
    RUN_429_SPIKE_E2E: 'false',
    RUN_DISCORD_INTEGRATION: 'false',
  };
}

export function createTestEnvironment(environment, apiOrigin, scope) {
  if (scope !== 'safe' && scope !== 'full') {
    throw new Error('Select safe or full as the test scope.');
  }
  const runCriticalTests = scope === 'full' ? 'true' : 'false';
  return {
    ...safeTestEnvironment(environment),
    VITE_API_URL: apiOrigin,
    SANNY_E2E_API_URL: apiOrigin,
    RUN_CRITICAL_TESTS: runCriticalTests,
    RUN_429_SPIKE_E2E: runCriticalTests,
    RUN_DISCORD_INTEGRATION: runCriticalTests,
  };
}
