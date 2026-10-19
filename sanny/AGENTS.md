# Sanny public site

This guide builds on the repository [root AGENTS.md](../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds app-specific guidance.

Main public React + Vite + TypeScript site for the portfolio, pages, and interactive content.

## Development Environment

- Install workspace dependencies from the repo root with `npm ci`.
- Start the site with `npm run dev:sanny`.
- Build with `npm run build:sanny`.
- Lint with `npm run lint:sanny`.
- Run app-local static checks with `npm run check -w sanny`; it composes `lint` and `typecheck`. This app has no standalone unit-test script; browser tests belong to root E2E tooling.
- Run `npm run test:e2e:accessibility:sanny` for the Sanny accessibility suite across browser projects.
- When shared packages change, verify with `npm run build:sanny`; the root wrapper typechecks shared source before building the app.

## Code Style Guidelines

- Preserve the provider order in `src/main.tsx` unless the task requires a deliberate change.
- Use workspace package imports from `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`.
- Keep page implementations focused; avoid moving unrelated UI into shared packages unless it is genuinely reusable.
- Match the existing local style and do not reformat unrelated files.

## Project Context

- `src/pages/` contains the page modules for home, blog, games, party, portfolio, projects, and settings.
- `src/styles/auxiliary.css` contains app-local style helpers.
- `vite.config.ts` uses shared React/HTTPS plugins and the pre-render HTML theme bootstrap from `../vite.shared.ts`; workspace exports resolve shared packages without aliases.
- The site depends on shared theme/language providers from the `shared/packages` workspace.
- `src/main.tsx` imports shared globals/layout CSS. Main routes use the shared UI `AppShell`; theme tokens and reduced-motion-aware Framer Motion defaults belong to `@sanny/styles`. Auxiliary party routes retain their scoped visual identity.

## Workflow / Security

- Deployment is handled by `.github/workflows/deploy-sanny.yml`.
- Keep build and lint scripts aligned with the root workspace scripts because CI calls them directly.
