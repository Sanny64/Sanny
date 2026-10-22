# Sanny64 monorepo

Sanny64 is an npm-workspaces monorepo containing two React/Vite frontends, a Fastify backend, shared frontend packages, Docusaurus documentation, end-to-end tests, and repository tooling.

## Repository layout

- `apps/frontend/auth/` authentication frontend
- `apps/frontend/sanny/` public website frontend
- `apps/backend/` Fastify, Prisma, Auth0, Redis, and Compose backend application
- `apps/documentation/` English and German Docusaurus site
- `shared/packages/` source-exported `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`
- `shared/tests/` Playwright suites and repository configuration contracts
- `tooling/config/` shared compiler configuration and the canonical `.nvmrc`
- `tooling/scripts/` repository automation, test runners, and release helpers

## Setup

Use Node.js 24 and npm 11.6.3. Install from the repository root:

```sh
npm ci
```

Run applications with:

```sh
npm run dev:auth
npm run dev:sanny
npm run dev:docs
npm run start:stack
```

Run `npm run check` before manual builds. `npm run test:ci` runs formatting, workspace checks, contracts, Vitest, backend tests, mocked browser tests, documentation browser tests, builds, and visual tests. `npm run test` adds live Auth0 and the opt-in monitoring spike.

## Configuration ownership

Root `tsconfig.json`, `eslint.config.js`, `prettier.config.ts`, and `playwright.config.ts` own repository-level defaults. Shared frontend compiler, Vite, and Vitest configs live under `apps/frontend/`; workspaces extend them and define local source boundaries or test environments.

See `apps/documentation/docs/general-info/tooling.mdx` for detailed ownership and migration rules.
