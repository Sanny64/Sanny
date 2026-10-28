import { expect, test } from '@playwright/test';
import { signInToGrafana, testEnvironment } from './grafana-session.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const discordReceiver = 'discord-alerts';
const receiversApi =
  '/grafana/apis/notifications.alerting.grafana.app/v1beta1/namespaces/default/receivers';

type Route = {
  receiver?: string;
  matchers?: string[];
  routes?: Route[];
};

type Receiver = {
  metadata: { name: string };
  spec: { title: string; integrations: Record<string, unknown>[] };
};

function matches(
  matchers: string[] | undefined,
  labels: Record<string, string>
) {
  return (matchers ?? []).every((matcher) => {
    const parsed = /^\s*([^=!~\s]+)\s*(=|!=)\s*"?(.*?)"?\s*$/.exec(matcher);
    if (!parsed) return false;
    const [, name = '', operator, value] = parsed;
    return operator === '=' ? labels[name] === value : labels[name] !== value;
  });
}

function receiverFor(
  root: Route,
  labels: Record<string, string>
): string | undefined {
  let receiver = root.receiver;
  let next = (root.routes ?? []).find((route) =>
    matches(route.matchers, labels)
  );
  while (next) {
    receiver = next.receiver ?? receiver;
    next = (next.routes ?? []).find((route) => matches(route.matchers, labels));
  }
  return receiver;
}

test('warning alerts route to the Discord contact point, which delivers a test notification', async ({
  request,
  baseURL,
}) => {
  test.skip(
    testEnvironment.RUN_DISCORD_INTEGRATION !== 'true',
    'Enable the Discord integration to send a test notification.'
  );
  test.skip(
    !baseURL || !LOOPBACK_HOSTS.has(new URL(baseURL).hostname),
    'The delivery check posts to the Discord webhook and runs only against the local development stack.'
  );

  const authorization = await signInToGrafana(request);
  const headers = { authorization };

  const policies = await request.get('/grafana/api/v1/provisioning/policies', {
    headers,
    timeout: 10_000,
  });
  expect(
    policies.status(),
    'Grafana notification policies must be readable'
  ).toBe(200);
  const policyTree = (await policies.json()) as Route;
  for (const severity of ['warning', 'info', 'none', 'critical']) {
    expect(
      receiverFor(policyTree, { alertname: 'Sanny routing test', severity }),
      `Alerts with severity "${severity}" must route to ${discordReceiver} on the local stack, which sends no email`
    ).toBe(discordReceiver);
  }

  const receivers = await request.get(receiversApi, {
    headers,
    timeout: 10_000,
  });
  expect(receivers.status(), 'Grafana receivers must be readable').toBe(200);
  const discord = (
    (await receivers.json()) as { items: Receiver[] }
  ).items.find((receiver) => receiver.spec.title === discordReceiver);
  expect(discord, `${discordReceiver} contact point must exist`).toBeDefined();
  const integration = discord?.spec.integrations[0];
  expect(integration?.type, 'The contact point must use Discord').toBe(
    'discord'
  );

  const delivery = await request.post(
    `${receiversApi}/${discord?.metadata.name}/test`,
    {
      headers,
      data: {
        integration,
        alert: {
          labels: { alertname: 'Sanny routing test', severity: 'warning' },
          annotations: {
            summary: 'Synthetic routing test; no action required.',
          },
        },
      },
      timeout: 30_000,
    }
  );
  expect(
    delivery.status(),
    `Grafana failed to deliver the test notification to Discord: ${await delivery.text()}`
  ).toBe(200);
  expect(((await delivery.json()) as { status?: string }).status).toBe(
    'success'
  );
});
