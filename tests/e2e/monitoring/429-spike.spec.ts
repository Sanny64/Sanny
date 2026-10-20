import { expect, test, type APIRequestContext } from "@playwright/test";

const testEnvironment =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

const alertName = "429 Rate Limit Spike";
const grafanaAlertsPath = "/grafana/api/alertmanager/grafana/api/v2/alerts";

type GrafanaAlert = {
  labels?: Record<string, string>;
};

async function getFiringAlertNames(
  request: APIRequestContext,
  authorization: string,
): Promise<Set<string>> {
  const response = await request.get(grafanaAlertsPath, {
    headers: { authorization },
    timeout: 10_000,
  });
  expect(
    response.status(),
    "Grafana alert API must be reachable with the configured monitoring credentials",
  ).toBe(200);

  const alerts = (await response.json()) as GrafanaAlert[];
  return new Set(
    alerts.flatMap((alert) =>
      alert.labels?.alertname ? [alert.labels.alertname] : [],
    ),
  );
}

test("auth initiation produces a real NGINX 429 alert spike", async ({
  request,
}) => {
  test.skip(
    testEnvironment.RUN_429_SPIKE_E2E !== "true",
    "Set RUN_429_SPIKE_E2E=true to generate an alerting traffic burst.",
  );
  test.setTimeout(5 * 60_000);

  const grafanaUsername = testEnvironment.GRAFANA_ADMIN_USER?.trim();
  const grafanaPassword = testEnvironment.GRAFANA_ADMIN_PASSWORD;
  expect(
    grafanaUsername && grafanaPassword,
    "GRAFANA_ADMIN_USER and GRAFANA_ADMIN_PASSWORD must be set for the alert-state check",
  ).toBeTruthy();
  const authorization = `Basic ${btoa(`${grafanaUsername}:${grafanaPassword}`)}`;

  const initiallyFiring = await getFiringAlertNames(request, authorization);
  expect(
    initiallyFiring.has(alertName),
    "Wait for the existing 429 alert to resolve before generating another spike",
  ).toBe(false);

  const statuses: number[] = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request.get("/api/v001/auth", {
      headers: { accept: "application/json" },
      maxRedirects: 0,
      timeout: 10_000,
    });
    statuses.push(response.status());
  }

  const rateLimitedRequests = statuses.filter((status) => status === 429);
  expect(
    rateLimitedRequests.length,
    `Expected more than 20 HTTP 429 responses; observed ${rateLimitedRequests.length} from ${statuses.length} requests`,
  ).toBeGreaterThan(20);

  const deadline = Date.now() + 4 * 60_000;
  let firing = new Set<string>();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    firing = await getFiringAlertNames(request, authorization);
    if (firing.has(alertName)) return;
  }

  expect(
    firing.has(alertName),
    `Grafana did not report "${alertName}" as firing before the deadline`,
  ).toBe(true);
});
