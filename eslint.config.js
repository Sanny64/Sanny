import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

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
    languageOptions: { globals: globals.node },
  },
  {
    files: [
      "auth/src/**/*.{ts,tsx}",
      "sanny/src/**/*.{ts,tsx}",
      "shared/packages/**/*.{ts,tsx}",
      "documentation/src/**/*.{ts,tsx}",
    ],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
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
