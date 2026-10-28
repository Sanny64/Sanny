import { expect, test } from '@playwright/test';
import { signInToGrafana, testEnvironment } from './grafana-session.ts';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const emailReceiver = 'email-alerts';
const receiversApi =
  '/grafana/apis/notifications.alerting.grafana.app/v1beta1/namespaces/default/receivers';

type Receiver = {
  metadata: { name: string };
  spec: { title: string; integrations: Record<string, unknown>[] };
};

// The local policy never routes alerts to email, so this is the only test that
// sends an email from the development stack.
test('the email contact point delivers one test notification', async ({
  request,
  baseURL,
}) => {
  test.skip(
    testEnvironment.RUN_EMAIL_INTEGRATION !== 'true',
    'Enable the email integration to send one real test email.'
  );
  test.skip(
    !baseURL || !LOOPBACK_HOSTS.has(new URL(baseURL).hostname),
    'The email check runs only against the local development stack.'
  );

  const authorization = await signInToGrafana(request);
  const headers = { authorization };

  const receivers = await request.get(receiversApi, {
    headers,
    timeout: 10_000,
  });
  expect(receivers.status(), 'Grafana receivers must be readable').toBe(200);
  const email = ((await receivers.json()) as { items: Receiver[] }).items.find(
    (receiver) => receiver.spec.title === emailReceiver
  );
  expect(email, `${emailReceiver} contact point must exist`).toBeDefined();
  const integration = email?.spec.integrations[0];
  expect(integration?.type, 'The contact point must use email').toBe('email');

  const delivery = await request.post(
    `${receiversApi}/${email?.metadata.name}/test`,
    {
      headers,
      data: {
        integration,
        alert: {
          labels: { alertname: 'Sanny email test', severity: 'critical' },
          annotations: {
            summary: 'Synthetic email test; no action required.',
          },
        },
      },
      timeout: 30_000,
    }
  );
  expect(
    delivery.status(),
    `Grafana failed to send the test email: ${await delivery.text()}`
  ).toBe(200);
  expect(((await delivery.json()) as { status?: string }).status).toBe(
    'success'
  );
});
