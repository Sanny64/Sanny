# Auth app

This guide builds on the repository [root AGENTS.md](../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds app-specific guidance.

React + Vite + TypeScript app for the authentication subdomain.

## Development Environment

- Install workspace dependencies from the repo root with `npm ci`.
- Start the app with `npm run dev:auth`.
- Build with `npm run build:auth`.
- Lint with `npm run lint:auth`.
- Run app-local static checks with `npm run check -w auth`; it composes `lint` and `typecheck`. This app has no standalone unit-test script; browser tests belong to root E2E tooling.
- Run `npm run test:e2e:accessibility:auth` for the Auth accessibility suite across browser projects.
- For focused verification after editing shared packages, run `npm run build:auth`; the root wrapper typechecks shared source before building the app.

## Code Style Guidelines

- Keep the provider and render order in `src/main.tsx` stable unless a change explicitly needs to alter it.
- Prefer workspace package imports from `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`.
- Keep app-specific styling in the app folder; do not move shared concerns out of the shared packages.
- Match the existing file-local style and avoid formatting-only edits.

## Project Context

- `src/main.tsx` composes the shared theme and language providers around the app.
- `src/pages/` contains authentication helper routes, account-link ownership proof, and a neutral root view with shared appearance settings.
- `vite.config.ts` uses shared React/HTTPS plugins and the pre-render HTML theme bootstrap from `../vite.shared.ts`; workspace exports resolve shared packages without aliases.
- `src/main.tsx` imports shared globals and layout CSS; `Main.tsx` uses `AppShell` from `@sanny/ui`. App-specific account-link styling uses shared semantic tokens.

## Workflow / Security

- Deployment is handled by `.github/workflows/deploy-auth.yml`.
- Deploys publish the auth build artifact to `/public_html/auth/`; configure the auth subdomain document root accordingly. Backend login endpoints and Auth0 callbacks do not change.
- Keep the app compatible with the workspace root lockfile and CI Node 24 setup.
