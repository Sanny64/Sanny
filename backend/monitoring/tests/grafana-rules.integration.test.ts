import assert from "node:assert/strict";
import test from "node:test";

const expectedAlertNames = [
  "429 Rate Limit Spike",
  "Auth Endpoint Abuse",
  "Auth Callback Flood",
];

type GrafanaAlert = {
  labels?: Record<string, string>;
};

const grafanaUrl = process.env.GRAFANA_URL ?? "http://grafana:3000";
const lokiUrl = process.env.LOKI_URL ?? "http://loki:3100";
const notificationSinkUrl =
  process.env.NOTIFICATION_SINK_URL ?? "http://notification-sink:9000";

function makeLogEntries(count: number, line: string, startTime: bigint) {
  return Array.from({ length: count }, (_, index) => [
    String(startTime + BigInt(index) * 1_000_000n),
    line,
  ]);
}

async function getFiringAlertNames(
  authorization: string,
): Promise<Set<string>> {
  const response = await fetch(
    `${grafanaUrl}/api/alertmanager/grafana/api/v2/alerts`,
    {
      headers: { authorization },
      signal: AbortSignal.timeout(10_000),
    },
  );
  assert.equal(response.status, 200, "Grafana Alertmanager API request failed");

  const alerts = (await response.json()) as GrafanaAlert[];
  return new Set(
    alerts.flatMap((alert) =>
      alert.labels?.alertname ? [alert.labels.alertname] : [],
    ),
  );
}

async function getDeliveredAlertNames(): Promise<Set<string>> {
  const response = await fetch(`${notificationSinkUrl}/received`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, "Notification test sink request failed");
  const result = (await response.json()) as { alertNames?: string[] };
  return new Set(result.alertNames ?? []);
}

async function waitForService(url: string, name: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch {
      // The service may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.fail(`${name} did not become ready`);
}

async function waitForLokiDatasource(authorization: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${grafanaUrl}/api/datasources/uid/loki`, {
        headers: { authorization },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok) {
        const datasource = (await response.json()) as {
          type?: string;
          uid?: string;
        };
        if (datasource.uid === "loki" && datasource.type === "loki") return;
      }
    } catch {
      // Provisioning may still be in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.fail("Grafana Loki datasource did not become ready");
}

test("synthetic Loki entries trigger all configured log-based Grafana rules", async () => {
  const username = process.env.GRAFANA_ADMIN_USER?.trim();
  const password = process.env.GRAFANA_ADMIN_PASSWORD;
  assert.ok(
    username && password,
    "Grafana admin credentials must be configured",
  );

  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  await Promise.all([
    waitForService(`${grafanaUrl}/api/health`, "Grafana"),
    waitForService(`${lokiUrl}/ready`, "Loki"),
    waitForService(`${notificationSinkUrl}/health`, "Notification test sink"),
  ]);
  await waitForLokiDatasource(authorization);
  const initiallyFiring = await getFiringAlertNames(authorization);
  assert.deepEqual(
    expectedAlertNames.filter((name) => initiallyFiring.has(name)),
    [],
    "Wait for existing log-based alerts to resolve before running this test",
  );

  const startTime = BigInt(Date.now()) * 1_000_000n;
  const streams = [
    {
      stream: {
        job: "nginx",
        source: "integration-test",
        test_kind: "rate-limit",
      },
      values: makeLogEntries(
        21,
        'GET /api/v001/auth HTTP/1.1" 429 0',
        startTime,
      ),
    },
    {
      stream: {
        job: "nginx",
        source: "integration-test",
        test_kind: "auth-volume",
      },
      values: makeLogEntries(
        51,
        'GET /api/v001/auth HTTP/1.1" 302 0',
        startTime + 30_000_000n,
      ),
    },
    {
      stream: {
        job: "nginx",
        source: "integration-test",
        test_kind: "callback-volume",
      },
      values: makeLogEntries(
        21,
        'GET /api/v001/auth/callback HTTP/1.1" 400 0',
        startTime + 60_000_000n,
      ),
    },
  ];

  const pushResponse = await fetch(`${lokiUrl}/loki/api/v1/push`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streams }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    pushResponse.status,
    204,
    "Loki rejected synthetic test entries",
  );

  const deadline = Date.now() + 5 * 60_000;
  let firing = new Set<string>();
  let delivered = new Set<string>();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    [firing, delivered] = await Promise.all([
      getFiringAlertNames(authorization),
      getDeliveredAlertNames(),
    ]);
    if (
      expectedAlertNames.every(
        (name) => firing.has(name) && delivered.has(name),
      )
    ) {
      return;
    }
  }

  assert.deepEqual(
    expectedAlertNames.filter((name) => !firing.has(name)),
    [],
    "Grafana did not report all expected log-based rules as firing",
  );
  assert.deepEqual(
    expectedAlertNames.filter((name) => !delivered.has(name)),
    [],
    "Grafana did not deliver all expected alerts to the test notification sink",
  );
});
