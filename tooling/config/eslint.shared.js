import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";

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
    files: ["backend/auth0/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "operator-linebreak": [
        "error",
        "after",
        { overrides: { "?": "after", ":": "before" } },
      ],
    },
  },
  {
    files: ["backend/auth0/database-action/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        configuration: "readonly",
        ValidationError: "readonly",
        WrongUsernameOrPasswordError: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern:
            "^(login|create|remove|getByEmail|changePassword|verify)$",
        },
      ],
    },
  },
  {
    files: [
      "backend/**/*.{ts,tsx}",
      "tooling/**/*.ts",
      "playwright*.ts",
      "tests/**/*.ts",
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
        tsconfigRootDir: fileURLToPath(new URL("../../", import.meta.url)),
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
