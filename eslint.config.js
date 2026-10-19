import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const browserSource = [
  "auth/src/**/*.{ts,tsx}",
  "sanny/src/**/*.{ts,tsx}",
  "shared/packages/ui/src/**/*.{ts,tsx}",
  "shared/packages/i18n/**/*.{ts,tsx}",
  "shared/packages/styles/**/*.{ts,tsx}",
  "documentation/src/**/*.{ts,tsx}",
];

export default defineConfig(
  globalIgnores([
    "**/dist/**",
    "**/build/**",
    "**/.docusaurus/**",
    "**/src/generated/**",
    "**/.agents/**",
    "games/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: [
      "backend/**/*.{ts,tsx}",
      "vite.shared.ts",
      "playwright*.ts",
      "e2e/**/*.ts",
      "auth/vite.config.ts",
      "sanny/vite.config.ts",
      "documentation/docusaurus.config.ts",
      "documentation/sidebars.ts",
      "shared/packages/*/vitest.config.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: browserSource,
    ignores: ["**/*.config.ts"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [...browserSource, "backend/src/**/*.ts"],
    ignores: ["**/*.config.ts", "**/tests/**"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["auth/src/**/*.{ts,tsx}", "sanny/src/**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
  },
  {
    files: ["backend/src/tests/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["documentation/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": [
        "error",
        { allow: ["^@site/static/.*\\.svg$"] },
      ],
    },
  },
);
