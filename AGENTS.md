# Sanny64 monorepo

Personal website and authentication workspace using npm workspaces, React, TypeScript, Vite, Fastify, Prisma, and Docker.

## Layout

- `apps/frontend/auth` and `apps/frontend/sanny` contain the frontend applications.
- `apps/frontend/tests` contains cross-app frontend source contracts; shared browser/Vite/Vitest configs live at `apps/frontend/`.
- `apps/backend` contains the backend, Auth0 scripts, Prisma, Redis, monitoring, and Compose files.
- `apps/documentation` contains Docusaurus sources and translations.
- `shared/packages` contains source-exported shared frontend packages.
- `shared/tests` owns Playwright suites and repository/tooling contracts.
- `apps/frontend/tsconfig.frontend.json` is the shared browser compiler base; root `tsconfig.json` owns neutral/tooling defaults. `tooling/config/.nvmrc` pins Node.js 24.
- `tooling/scripts` owns runtime, test, release, and documentation automation.

## Rules

Use Node.js 24 and npm 11.6.3 from the repository root. Do not read `.env` files, edit generated output, create workspace lockfiles, or use destructive Git operations. Read the nearest `AGENTS.md` before editing a workspace.

Use `npm run check` for formatting-independent static checks, `npm run test:ci` for the CI gate, and `npm run test` only after the CI gate passes. Keep Playwright and Vitest tests separate: browser workflows remain in `shared/tests/e2e`, while fast workspace tests stay with their source packages.

Root configuration files are authoritative. Workspace configurations extend them and only add local paths, overrides, or test setup.

Document structural changes in both English and German documentation, then refresh reviewed source hashes with:

```sh
npm run review:docs:translations -- <path-relative-to-apps/documentation/docs>
```
