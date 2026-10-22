# Auth

Authentication helper frontend for Sanny64, built with React, TypeScript, and Vite. This workspace replaces `login/`; sign-in itself remains owned by the backend and Auth0.

## Development

Install dependencies at the repository root with `npm ci`, then use:

- `npm run dev:auth`: HTTPS development server at `https://localhost:5174`.
- `npm run lint:auth`: application lint.
- `npm run build:auth`: build Auth; run `npm run check` first for static verification.
- `npx playwright test shared/tests/e2e/mock/auth-accessibility.spec.ts`: mocked accessibility checks across configured browsers.

The development server uses a self-signed certificate. Backend CORS origins must include `https://localhost:5174`, and the account-link frontend URL must be `https://localhost:5174/confirm-linking`. OAuth callbacks remain at `https://localhost:8443/api/v001/auth/callback`.

Existing local runtime configuration moves with the workspace directory. The rename does not change backend API paths, Auth0 callbacks, or authentication protocol identifiers.

## Routes

- `/`: authentication request state and shared appearance preferences.
- `/settings`: shared theme and language controls.
- `/confirm-linking`: account-link confirmation and ownership verification.
- `/account-link-proof-resume`: protected ownership-proof continuation.
- `/account-link-proof-complete`: returns signed proof to the opener window.

## Shared Design

Provider order remains `ThemeProvider` then `LanguageProvider`. `src/main.tsx` imports global and layout CSS from `@sanny/styles`, including for standalone proof/error views. Main routes use `AppShell` from `@sanny/ui` with its `auth` variant.

The shared packages own semantic light/dark colors, locally bundled Manrope typography, focus states, spacing, and reduced-motion-aware Framer Motion configuration. Account-link CSS only composes these tokens; it does not maintain a separate dark palette. Shared buttons handle disabled, focus, and press states.

## Deployment

`.github/workflows/deploy-auth.yml` builds Auth, uploads its build artifact, and downloads it into the deployment job. It publishes `apps/frontend/auth/dist/` to `/public_html/apps/frontend/auth/` using existing FTP secrets. Configure the auth subdomain document root to match this directory before deployment. Backend login endpoints and Auth0 callback URLs are unchanged.
