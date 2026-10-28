import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  getGrafanaAlerts,
  signInToGrafana,
  testEnvironment,
} from './grafana-session.ts';

const alertName = '429 Rate Limit Spike';

async function getFiringAlertNames(
  request: APIRequestContext,
  nginxAuthorization: string
): Promise<Set<string>> {
  const alerts = await getGrafanaAlerts(request, nginxAuthorization);
  return new Set(
    alerts.flatMap((alert) =>
      alert.labels?.alertname ? [alert.labels.alertname] : []
    )
  );
}

test('auth initiation produces a real NGINX 429 alert spike', async ({
  request,
}) => {
  test.skip(
    testEnvironment.RUN_CRITICAL_TESTS !== 'true' &&
      testEnvironment.RUN_429_SPIKE_E2E !== 'true',
    'Enable the critical tests to generate an alerting traffic burst.'
  );
  test.setTimeout(5 * 60_000);

  const nginxAuthorization = await signInToGrafana(request);

  const initiallyFiring = await getFiringAlertNames(
    request,
    nginxAuthorization
  );
  expect(
    initiallyFiring.has(alertName),
    'Wait for the existing 429 alert to resolve before generating another spike'
  ).toBe(false);

  const statuses: number[] = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request.get('/api/v001/auth', {
      headers: { accept: 'application/json' },
      maxRedirects: 0,
      timeout: 10_000,
    });
    statuses.push(response.status());
  }

  const rateLimitedRequests = statuses.filter((status) => status === 429);
  expect(
    rateLimitedRequests.length,
    `Expected more than 20 HTTP 429 responses; observed ${rateLimitedRequests.length} from ${statuses.length} requests`
  ).toBeGreaterThan(20);

  const deadline = Date.now() + 4 * 60_000;
  let firing = new Set<string>();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    firing = await getFiringAlertNames(request, nginxAuthorization);
    if (firing.has(alertName)) return;
  }

  expect(
    firing.has(alertName),
    `Grafana did not report "${alertName}" as firing before the deadline`
  ).toBe(true);
});
