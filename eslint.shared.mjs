export function createFrontendEslintConfig({
  js,
  globals,
  reactHooks,
  reactRefresh,
  tseslint,
}) {
  return [
    {
      ignores: ["dist"],
    },
    {
      files: ["**/*.{ts,tsx}"],
      extends: [
        js.configs.recommended,
        tseslint.configs.recommended,
        reactHooks.configs.flat.recommended,
        reactRefresh.configs.vite,
      ],
      languageOptions: {
        globals: globals.browser,
      },
    },
  ];
}
