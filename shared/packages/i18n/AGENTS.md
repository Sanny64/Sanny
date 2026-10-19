# @sanny/i18n

This guide builds on the repository [root AGENTS.md](../../../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds package-specific guidance.

Shared language context and translation package for the workspace frontends.

## Development Environment

- Install workspace dependencies from the repo root with `npm ci`.
- Lint this package with `npm run lint -w @sanny/i18n` from the repo root, or run `npm run lint:shared` after changing multiple shared packages.
- Typecheck with `npm run typecheck -w @sanny/i18n`.
- The package exports source through workspace links; no build or `dist/` output is needed after source or locale changes.

## Code Style Guidelines

- Keep translation keys stable unless the consuming apps are updated at the same time.
- Preserve the cookie and localStorage behavior in `LanguageProvider.tsx` unless the task explicitly changes persistence.
- Keep the public exports in `index.ts` aligned with the actual source files.
- Use the existing React and TypeScript patterns; do not introduce extra abstraction for small changes.

## Project Context

- `LanguageContext.tsx` owns the React context creation.
- `language.types.ts` owns the shared language and context types.
- `language.utils.ts` owns the shared translation map and pure language helpers.
- `LanguageProvider.tsx` owns persistence and document language updates.
- `useLanguage.ts` is the consumer hook.
- `locales/` contains the actual translation objects.
- `index.ts` is the package entrypoint used by the frontends.

## Workflow / Security

- Do not write secrets into translation or context files.
- If you add new locale data, keep the shape compatible with both `en` and `de` exports.
