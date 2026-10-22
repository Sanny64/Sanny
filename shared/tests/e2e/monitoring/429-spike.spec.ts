import { expect, test, type APIRequestContext } from '@playwright/test';

const testEnvironment =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

const alertName = '429 Rate Limit Spike';
const grafanaAlertsPath = '/grafana/api/alertmanager/grafana/api/v2/alerts';

type GrafanaAlert = {
  labels?: Record<string, string>;
};

async function getFiringAlertNames(
  request: APIRequestContext,
  nginxAuthorization: string
): Promise<Set<string>> {
  const response = await request.get(grafanaAlertsPath, {
    headers: { authorization: nginxAuthorization },
    timeout: 10_000,
  });
  const authChallenge = response.headers()['www-authenticate'];
  const failureMessage = authChallenge?.includes('Monitoring')
    ? 'NGINX rejected NGINX_BASIC_AUTH_USER or NGINX_BASIC_AUTH_PASSWORD; they must match an entry in nginx/secret/.htpasswd.'
    : response.status() === 401
      ? 'Grafana rejected its session cookie. Verify GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD against the existing Grafana data volume.'
      : 'Grafana alert API must be reachable with the configured NGINX and Grafana authentication';
  expect(response.status(), failureMessage).toBe(200);

  const alerts = (await response.json()) as GrafanaAlert[];
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
    testEnvironment.RUN_429_SPIKE_E2E !== 'true',
    'Set RUN_429_SPIKE_E2E=true to generate an alerting traffic burst.'
  );
  test.setTimeout(5 * 60_000);

  const nginxUsername = testEnvironment.NGINX_BASIC_AUTH_USER?.trim();
  const nginxPassword = testEnvironment.NGINX_BASIC_AUTH_PASSWORD;
  const grafanaUsername = testEnvironment.GRAFANA_ADMIN_USER?.trim();
  const grafanaPassword = testEnvironment.GRAFANA_ADMIN_PASSWORD;
  expect(
    nginxUsername && nginxPassword && grafanaUsername && grafanaPassword,
    'NGINX_BASIC_AUTH_USER, NGINX_BASIC_AUTH_PASSWORD, GRAFANA_ADMIN_USER, and GRAFANA_ADMIN_PASSWORD must be set for the alert-state check'
  ).toBeTruthy();
  const nginxAuthorization = `Basic ${btoa(`${nginxUsername}:${nginxPassword}`)}`;

  const grafanaLogin = await request.post('/grafana/login', {
    headers: { authorization: nginxAuthorization },
    data: { user: grafanaUsername, password: grafanaPassword },
    timeout: 10_000,
  });
  expect(
    grafanaLogin.status(),
    grafanaLogin.status() === 401
      ? 'Grafana rejected GRAFANA_ADMIN_USER or GRAFANA_ADMIN_PASSWORD; verify them against the existing Grafana data volume.'
      : 'Grafana session login failed.'
  ).toBe(200);

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
