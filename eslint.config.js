import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';

const browserSource = [
  'apps/frontend/auth/src/**/*.{ts,tsx}',
  'apps/frontend/sanny/src/**/*.{ts,tsx}',
  'shared/packages/ui/src/**/*.{ts,tsx}',
  'shared/packages/i18n/**/*.{ts,tsx}',
  'shared/packages/styles/**/*.{ts,tsx}',
  'apps/documentation/src/**/*.{ts,tsx}',
];

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/build/**',
    '**/.docusaurus/**',
    '**/src/generated/**',
    '**/.agents/**',
    'games/**',
    'test-results/**',
    'playwright-report/**',
  ]),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/backend/auth0/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      'operator-linebreak': [
        'error',
        'after',
        { overrides: { '?': 'after', ':': 'before' } },
      ],
    },
  },
  {
    files: ['apps/backend/auth0/database-action/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        configuration: 'readonly',
        ValidationError: 'readonly',
        WrongUsernameOrPasswordError: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(login|create|remove|getByEmail|changePassword|verify)$',
        },
      ],
    },
  },
  {
    files: [
      'apps/backend/**/*.{ts,tsx}',
      'tooling/**/*.ts',
      'playwright*.ts',
      'shared/tests/**/*.ts',
      'apps/frontend/vite.config.ts',
      'apps/frontend/vitest.config.ts',
      'apps/frontend/tests/**/*.ts',
      'apps/frontend/auth/vite.config.ts',
      'apps/frontend/sanny/vite.config.ts',
      'apps/documentation/docusaurus.config.ts',
      'apps/documentation/sidebars.ts',
      'shared/packages/*/vitest.config.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: browserSource,
    ignores: ['**/*.config.ts'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [...browserSource, 'apps/backend/src/**/*.ts'],
    ignores: ['**/*.config.ts', '**/shared/tests/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: [
      'apps/frontend/auth/src/**/*.{ts,tsx}',
      'apps/frontend/sanny/src/**/*.{ts,tsx}',
    ],
    extends: [reactRefresh.configs.vite],
  },
  {
    files: ['apps/backend/src/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', name: 'test', package: 'node:test' },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/backend/src/tests/**/*.ts',
      'apps/backend/monitoring/**/tests/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['apps/documentation/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': [
        'error',
        { allow: ['^@site/static/.*\\.svg$'] },
      ],
    },
  }
);
