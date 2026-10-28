// Gate ids below are internal run-suites identifiers, not npm scripts.
export const PLAYWRIGHT_GATE_ARGS = {
  'test:e2e:real': [
    'test',
    '--config=shared/tests/e2e/playwright.real.config.ts',
    '--headed',
  ],
  'test:e2e:429': [
    'test',
    '--config=shared/tests/e2e/playwright.monitoring.config.ts',
    '--project=chromium',
  ],
};

export const LIVE_GATE_SCRIPTS = ['test:e2e:real'];
export const MONITORING_GATE_SCRIPTS = ['test:e2e:429'];
export const E2E_GATE_SCRIPTS = [
  'test:e2e:mocked',
  ...LIVE_GATE_SCRIPTS,
  ...MONITORING_GATE_SCRIPTS,
  'test:e2e:docs',
];
export const FULL_GATE_SCRIPTS = [
  'test:core',
  ...LIVE_GATE_SCRIPTS,
  ...MONITORING_GATE_SCRIPTS,
];
export const BACKEND_DEPENDENT_SCRIPTS = new Set([
  ...LIVE_GATE_SCRIPTS,
  ...MONITORING_GATE_SCRIPTS,
]);

export function selectTestSuite(args) {
  const suites = {
    '--live-only': { name: 'live E2E suite', scripts: LIVE_GATE_SCRIPTS },
    '--e2e-only': { name: 'browser test suites', scripts: E2E_GATE_SCRIPTS },
    '--monitoring-only': {
      name: 'live monitoring suite',
      scripts: MONITORING_GATE_SCRIPTS,
    },
  };
  if (
    args.length > 1 ||
    (args.length === 1 && !Object.hasOwn(suites, args[0]))
  ) {
    throw new Error(
      'Use at most one of --live-only, --e2e-only, or --monitoring-only.'
    );
  }
  return args.length === 0
    ? { name: 'full test suite', scripts: FULL_GATE_SCRIPTS }
    : suites[args[0]];
}
