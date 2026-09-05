import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { createFrontendEslintConfig } from "../../../eslint.shared.mjs";

export default defineConfig(
  createFrontendEslintConfig({
    js,
    globals,
    reactHooks,
    reactRefresh,
    tseslint,
  }),
);
