# @sanny/styles

This guide builds on the repository [root AGENTS.md](../../../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds package-specific guidance.

Shared theme and style-state package for the workspace frontends.

## Development Environment

- Install workspace dependencies from the repo root with `npm ci`.
- Lint with `npm run lint -w @sanny/styles` from the repo root.
- Typecheck with `npm run typecheck -w @sanny/styles`.
- This package exports source and CSS through workspace links; no build or `dist/` output is needed.

## Code Style Guidelines

- Keep theme persistence and document attribute updates in `ThemeProvider.tsx` consistent with the existing behavior.
- Preserve the `Theme`, `ThemeVariant`, and `getThemeVariant` exports in `index.ts`.
- Use the same TypeScript and React conventions as the rest of the workspace.
- Do not add app-specific logic here; this package should remain reusable.

## Project Context

- `ThemeProvider.tsx` owns theme resolution, persistence, and system-theme synchronization.
- `useTheme.ts` is the consumer hook.
- `ThemeContext.tsx` owns the React context creation.
- `theme.types.ts` defines the shared theme types.
- `theme.utils.ts` owns pure theme helpers such as `getThemeVariant`.
- `theme.config.ts` owns stable constsants.
- `globals.css`, `main.css`, and `auxiliary.css` are the shared CSS entrypoints.
- Semantic light/dark surface, action, and status tokens and bundled Manrope typography live in `globals.css`. Apps import globals and main CSS in `src/main.tsx`, including for standalone error/proof routes.
- `ThemeProvider` also owns shared Framer Motion defaults through `MotionConfig` with `reducedMotion="user"`. Avoid duplicated app-level motion policies or separate auth palettes.
- The frontends import this package through workspace exports, without aliases or deep relative paths.

## Workflow / Security

- Do not hardcode site-specific settings into shared theme code.
- Keep the package compatible with both frontend apps that consume it.
