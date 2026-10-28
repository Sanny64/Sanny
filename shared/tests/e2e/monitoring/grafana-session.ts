import { expect, type APIRequestContext } from '@playwright/test';

export const testEnvironment =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

export const grafanaApiPath = '/grafana/api/alertmanager/grafana';

export type GrafanaAlert = {
  labels?: Record<string, string>;
  receivers?: { name?: string }[];
};

// Returns the NGINX authorization header and leaves a Grafana session on the request context.
export async function signInToGrafana(
  request: APIRequestContext
): Promise<string> {
  const nginxUsername = testEnvironment.NGINX_BASIC_AUTH_USER?.trim();
  const nginxPassword = testEnvironment.NGINX_BASIC_AUTH_PASSWORD;
  const grafanaUsername = testEnvironment.GRAFANA_ADMIN_USER?.trim();
  const grafanaPassword = testEnvironment.GRAFANA_ADMIN_PASSWORD;
  expect(
    nginxUsername && nginxPassword && grafanaUsername && grafanaPassword,
    'NGINX_BASIC_AUTH_USER, NGINX_BASIC_AUTH_PASSWORD, GRAFANA_ADMIN_USER, and GRAFANA_ADMIN_PASSWORD must be set for the Grafana alert checks'
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
  return nginxAuthorization;
}

export function authenticationFailureMessage(
  status: number,
  authChallenge: string | undefined
): string {
  return authChallenge?.includes('Monitoring')
    ? 'NGINX rejected NGINX_BASIC_AUTH_USER or NGINX_BASIC_AUTH_PASSWORD; they must match an entry in nginx/secret/.htpasswd.'
    : status === 401
      ? 'Grafana rejected its session cookie. Verify GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD against the existing Grafana data volume.'
      : 'Grafana alert API must be reachable with the configured NGINX and Grafana authentication';
}

export async function getGrafanaAlerts(
  request: APIRequestContext,
  nginxAuthorization: string
): Promise<GrafanaAlert[]> {
  const response = await request.get(`${grafanaApiPath}/api/v2/alerts`, {
    headers: { authorization: nginxAuthorization },
    timeout: 10_000,
  });
  expect(
    response.status(),
    authenticationFailureMessage(
      response.status(),
      response.headers()['www-authenticate']
    )
  ).toBe(200);
  return (await response.json()) as GrafanaAlert[];
}
