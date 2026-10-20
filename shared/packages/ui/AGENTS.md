# @sanny/ui

This guide builds on the repository [root AGENTS.md](../../../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds package-specific guidance.

Shared reusable UI component package for the workspace frontends.

## Development Environment

- Install workspace dependencies from the repo root with `npm ci`.
- Lint with `npm run lint -w @sanny/ui` from the repo root.
- Typecheck with `npm run typecheck -w @sanny/ui`.
- This package exports source through workspace links. Vite bundles it in each app; no separate library build is needed.

## Code Style Guidelines

- Keep components small, reusable, and presentation-focused.
- Export new public components from `src/index.ts`.
- Keep styles colocated under `src/styles/` and component code under `src/components/`.
- Preserve the current prop and class-name conventions unless a task explicitly requires a breaking change.

## Project Context

- `src/components/Button.tsx` is the current reusable button implementation.
- `src/components/AppShell.tsx` provides the shared branded frame, localized skip navigation, optional header actions, and reduced-motion-aware route entry for Sanny and Auth. Keep app session logic in callers, not the shell.
- Keep explicit zero tab indices on skip/brand anchors: WebKit's default sequential navigation otherwise skips them in the tested environment. Preserve DOM tab order and native link semantics; do not replace keyboard tests with programmatic focus.
- Shared controls and feedback styles consume semantic tokens from `@sanny/styles`; use the same action hierarchy in both themes rather than adding app-specific palettes.
- `src/pages/Settings.tsx` provides shared theme and language preferences.
- `src/index.ts` is the public entrypoint consumed by the apps.
- The package depends on `@sanny/i18n` and `@sanny/styles`.

## Workflow / Security

- Keep this package framework-agnostic and avoid binding it to a single app's route or page structure.
- Do not commit built output unless a task explicitly requests it.
