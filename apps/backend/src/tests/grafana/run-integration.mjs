import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { runComposeIntegration } from '../compose-integration.mjs';

export function createTestRules(documents) {
  const groups = structuredClone(
    documents.flatMap((document) => document.groups)
  );
  return {
    apiVersion: 1,
    groups: groups.flatMap((group) => {
      const rules = group.rules.filter((rule) =>
        rule.data.some((query) => query.datasourceUid === 'loki')
      );
      if (!rules.length) return [];
      return [
        {
          ...group,
          interval: '10s',
          rules: rules.map((rule) => ({ ...rule, for: '0s' })),
        },
      ];
    }),
  };
}

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'sanny-monitoring-rules-'));
  const testRulesPath = join(directory, 'rules.yml').replaceAll('\\', '/');
  try {
    const rulesDirectory = new URL(
      '../../monitoring/alerting/rules/',
      import.meta.url
    );
    const files = (await readdir(rulesDirectory))
      .filter((name) => name.endsWith('.yml'))
      .sort();
    const documents = await Promise.all(
      files.map(async (name) =>
        parse(await readFile(new URL(name, rulesDirectory), 'utf8'))
      )
    );
    await writeFile(testRulesPath, stringify(createTestRules(documents)), {
      mode: 0o644,
    });
    process.exitCode = await runComposeIntegration({
      composeFile: fileURLToPath(
        new URL(
          '../../../docker/compose/docker-compose.test.monitoring.yml',
          import.meta.url
        )
      ),
      projectPrefix: 'sanny-monitoring-tests-',
      service: 'monitoring-tests',
      environment: { SANNY_MONITORING_TEST_RULES: testRulesPath },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await main();
}
